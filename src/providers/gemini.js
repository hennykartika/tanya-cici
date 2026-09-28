import { ProviderError } from '../lib/errors.js';

const BLOCKED_FINISH_REASONS = new Set(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION']);
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
// Overload and timeout are worth retrying on the same model: the free tier
// returns 503 in bursts and usually recovers within seconds. A quota error (429)
// is not retried here, it goes straight to the fallback model.
const RETRYABLE_SAME_MODEL = new Set([408, 500, 502, 503, 504]);
const BACKOFF_BASE_MS = 500;
const MIN_BUDGET_FOR_ANOTHER_ATTEMPT_MS = 2000;

const PROVIDER_ROLES = { user: 'user', assistant: 'model' };

function toContents(messages) {
  return messages.map((message) => ({
    role: PROVIDER_ROLES[message.role],
    parts: [{ text: message.text }],
  }));
}

function extractText(payload) {
  const candidate = payload?.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  // `thought` parts are the model's reasoning trace, not the answer.
  const text = parts
    .filter((part) => typeof part.text === 'string' && part.thought !== true)
    .map((part) => part.text)
    .join('')
    .trim();

  return {
    text,
    finishReason: candidate?.finishReason,
    blocked: Boolean(payload?.promptFeedback?.blockReason) || BLOCKED_FINISH_REASONS.has(candidate?.finishReason),
    usage: {
      promptTokens: payload?.usageMetadata?.promptTokenCount ?? 0,
      responseTokens: payload?.usageMetadata?.candidatesTokenCount ?? 0,
      thoughtTokens: payload?.usageMetadata?.thoughtsTokenCount ?? 0,
    },
  };
}

/**
 * Google Gemini provider (REST `generateContent`).
 *
 * Behaviour worth knowing when reviewing:
 * - transient overload (5xx) and timeouts are retried on the same model with
 *   exponential backoff, bounded by an overall deadline for the whole call;
 * - two models are tried in order, so a quota exhausted primary degrades to the
 *   cheaper fallback instead of failing the request;
 * - `thinkingConfig` is dropped and retried once per model if the endpoint
 *   rejects it, which keeps the code working across model generations;
 * - upstream error text never reaches the client, only the server log.
 */
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Exponential backoff with jitter, so retries do not line up across clients. */
function backoffDelay(attempt) {
  return Math.round(BACKOFF_BASE_MS * 2 ** (attempt - 1) * (1 + Math.random() * 0.3));
}

export function createGeminiProvider({ config, logger, fetchImpl = globalThis.fetch, sleep = defaultSleep }) {
  const models = [...new Set([config.model, config.fallbackModel].filter(Boolean))];
  const modelsWithoutThinkingConfig = new Set();

  const scrub = (text) =>
    config.apiKey ? String(text ?? '').replaceAll(config.apiKey, '[redacted]') : String(text ?? '');

  async function callModel(model, { systemPrompt, messages, includeThinkingConfig }) {
    const generationConfig = {
      // Google recommends leaving temperature at the default for Gemini 3 models.
      temperature: 1,
      maxOutputTokens: config.maxOutputTokens,
    };
    if (includeThinkingConfig) {
      generationConfig.thinkingConfig = { thinkingLevel: config.thinkingLevel };
    }

    const startedAt = Date.now();
    let response;
    try {
      response = await fetchImpl(`${config.apiBase}/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': config.apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: toContents(messages),
          generationConfig,
        }),
        signal: AbortSignal.timeout(config.timeoutMs),
      });
    } catch (error) {
      const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
      return {
        ok: false,
        retryable: true,
        status: timedOut ? 504 : 502,
        reason: timedOut ? 'timeout' : 'network_error',
        latencyMs: Date.now() - startedAt,
      };
    }

    const latencyMs = Date.now() - startedAt;
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        ok: false,
        retryable: RETRYABLE_STATUS.has(response.status),
        status: response.status,
        reason: scrub(payload?.error?.message ?? `HTTP ${response.status}`),
        latencyMs,
      };
    }

    return { ok: true, status: response.status, latencyMs, ...extractText(payload) };
  }

  return {
    name: 'gemini',

    async generate({ systemPrompt, messages, requestId }) {
      let lastFailure = { status: 502, reason: 'no attempt made' };
      // One overall budget for the whole call, so retries can never outlive the
      // browser's own timeout and leave the user staring at a spinner.
      const deadline = Date.now() + config.deadlineMs;

      for (const model of models) {
        for (let retry = 0; retry <= config.maxRetries; retry += 1) {
          if (retry > 0) {
            const delay = backoffDelay(retry);
            if (Date.now() + delay + MIN_BUDGET_FOR_ANOTHER_ATTEMPT_MS > deadline) break;
            await sleep(delay);
          }

          let attempt = await callModel(model, {
            systemPrompt,
            messages,
            includeThinkingConfig: !modelsWithoutThinkingConfig.has(model),
          });

          if (!attempt.ok && attempt.status === 400 && /thinking/i.test(attempt.reason)) {
            modelsWithoutThinkingConfig.add(model);
            attempt = await callModel(model, { systemPrompt, messages, includeThinkingConfig: false });
          }

          if (attempt.ok) {
            logger.info('provider.success', {
              requestId,
              model,
              retry,
              latencyMs: attempt.latencyMs,
              finishReason: attempt.finishReason,
              promptTokens: attempt.usage.promptTokens,
              responseTokens: attempt.usage.responseTokens,
              thoughtTokens: attempt.usage.thoughtTokens,
            });

            if (attempt.blocked) return { blocked: true, model, usage: attempt.usage };
            if (attempt.text) {
              return { text: attempt.text, model, usage: attempt.usage, finishReason: attempt.finishReason };
            }

            lastFailure = { status: 502, reason: `empty response (finishReason=${attempt.finishReason})` };
            break;
          }

          lastFailure = attempt;
          logger.warn('provider.attempt_failed', {
            requestId,
            model,
            retry,
            status: attempt.status,
            reason: attempt.reason,
            latencyMs: attempt.latencyMs,
          });

          if (!RETRYABLE_SAME_MODEL.has(attempt.status) || Date.now() >= deadline) break;
        }

        // 400/401/403 are request or credential problems: another model cannot fix them.
        if (lastFailure.retryable === false) break;
        if (Date.now() >= deadline) break;
      }

      throw toProviderError(lastFailure);
    },
  };
}

function toProviderError({ status, reason }) {
  if (status === 429) {
    return new ProviderError('rate_limited', `Gemini rate limit: ${reason}`, {
      status: 429,
      publicMessage: 'Kuota gratisnya lagi penuh. Tunggu sebentar, lalu coba lagi ya.',
    });
  }
  if (status === 401 || status === 403 || (status === 400 && /api key/i.test(reason))) {
    return new ProviderError('auth', `Gemini rejected the API key: ${reason}`, {
      status: 503,
      publicMessage: 'Layanan AI-nya lagi tidak bisa dipakai. Hubungi pemilik aplikasi ya.',
    });
  }
  if (status === 400 || status === 404) {
    return new ProviderError('invalid_request', `Gemini rejected the request: ${reason}`, {
      status: 503,
      publicMessage: 'Layanan AI-nya lagi tidak bisa dipakai. Coba lagi nanti ya.',
    });
  }
  return new ProviderError('unavailable', `Gemini unavailable (${status}): ${reason}`, {
    status: 503,
    publicMessage: 'Server AI-nya lagi ramai banget. Tunggu sebentar, terus kirim ulang ya.',
  });
}
