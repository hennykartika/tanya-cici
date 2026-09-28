import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGeminiProvider } from '../../src/providers/gemini.js';
import { silentLogger } from '../../src/lib/logger.js';
import { ProviderError } from '../../src/lib/errors.js';

const CONFIG = {
  apiKey: 'test-key',
  apiBase: 'https://example.invalid/v1beta',
  model: 'primary-model',
  fallbackModel: 'fallback-model',
  timeoutMs: 1000,
  maxRetries: 2,
  deadlineMs: 60_000,
  maxOutputTokens: 512,
  thinkingLevel: 'low',
};

// Retries are exercised without waiting for the real backoff.
const noSleep = async () => {};

const buildProvider = (fetchImpl, overrides = {}) =>
  createGeminiProvider({ config: { ...CONFIG, ...overrides }, logger: silentLogger, fetchImpl, sleep: noSleep });

const REQUEST = {
  systemPrompt: 'system',
  messages: [
    { role: 'user', text: 'halo' },
    { role: 'assistant', text: 'hai' },
    { role: 'user', text: 'kenapa?' },
  ],
  requestId: 'test-request',
};

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function successBody(text, extra = {}) {
  return {
    candidates: [{ content: { parts: [{ text: 'internal reasoning', thought: true }, { text }] }, finishReason: 'STOP' }],
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, thoughtsTokenCount: 5 },
    ...extra,
  };
}

/** Replays the queued responses; the last one repeats once the queue runs dry. */
function recordingFetch(responses) {
  const calls = [];
  const queue = [...responses];
  let last = responses.at(-1);

  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    if (queue.length > 0) last = queue.shift();
    if (typeof last === 'function') return last();
    return last;
  };
  return { fetchImpl, calls };
}

test('sends system instruction, mapped roles and thinking config', async () => {
  const { fetchImpl, calls } = recordingFetch([jsonResponse(200, successBody('jawaban'))]);
  const provider = buildProvider(fetchImpl);

  const result = await provider.generate(REQUEST);

  assert.equal(result.text, 'jawaban');
  assert.equal(result.model, 'primary-model');
  assert.deepEqual(result.usage, { promptTokens: 10, responseTokens: 20, thoughtTokens: 5 });

  const [call] = calls;
  assert.match(call.url, /primary-model:generateContent$/);
  assert.equal(call.init.headers['x-goog-api-key'], 'test-key');
  assert.equal(call.body.systemInstruction.parts[0].text, 'system');
  assert.deepEqual(
    call.body.contents.map((item) => item.role),
    ['user', 'model', 'user'],
  );
  assert.equal(call.body.generationConfig.thinkingConfig.thinkingLevel, 'low');
});

test('reasoning parts are stripped from the answer', async () => {
  const { fetchImpl } = recordingFetch([jsonResponse(200, successBody('hanya ini'))]);
  const provider = buildProvider(fetchImpl);

  const result = await provider.generate(REQUEST);
  assert.equal(result.text, 'hanya ini');
});

test('quota errors switch models immediately instead of retrying the same one', async () => {
  const { fetchImpl, calls } = recordingFetch([
    jsonResponse(429, { error: { message: 'Resource exhausted' } }),
    jsonResponse(200, successBody('dari cadangan')),
  ]);
  const provider = buildProvider(fetchImpl);

  const result = await provider.generate(REQUEST);
  assert.equal(result.model, 'fallback-model');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url.includes('primary-model'), true);
});

test('an overloaded model is retried before falling back', async () => {
  const overloaded = jsonResponse(503, { error: { message: 'This model is currently experiencing high demand.' } });
  const { fetchImpl, calls } = recordingFetch([overloaded, overloaded, jsonResponse(200, successBody('akhirnya'))]);
  const provider = buildProvider(fetchImpl);

  const result = await provider.generate(REQUEST);

  assert.equal(result.text, 'akhirnya');
  assert.equal(result.model, 'primary-model', 'the primary model should recover without a fallback');
  assert.equal(calls.length, 3);
});

test('retries stop at the configured limit and move on to the fallback model', async () => {
  const overloaded = jsonResponse(503, { error: { message: 'high demand' } });
  const { fetchImpl, calls } = recordingFetch([overloaded]);
  const provider = buildProvider(fetchImpl, { maxRetries: 1 });

  await assert.rejects(provider.generate(REQUEST));
  // Two attempts per model (one initial plus one retry), two models.
  assert.equal(calls.length, 4);
});

test('an exhausted deadline stops further attempts', async () => {
  const overloaded = jsonResponse(503, { error: { message: 'high demand' } });
  const { fetchImpl, calls } = recordingFetch([overloaded]);
  const provider = buildProvider(fetchImpl, { deadlineMs: 0 });

  await assert.rejects(provider.generate(REQUEST), (error) => error.kind === 'unavailable');
  assert.equal(calls.length, 1, 'no budget left for a retry or a fallback model');
});

test('retries once without thinking config when the model rejects it', async () => {
  const { fetchImpl, calls } = recordingFetch([
    jsonResponse(400, { error: { message: 'thinking_level is not supported' } }),
    jsonResponse(200, successBody('ok')),
  ]);
  const provider = buildProvider(fetchImpl);

  await provider.generate(REQUEST);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body.generationConfig.thinkingConfig.thinkingLevel, 'low');
  assert.equal(calls[1].body.generationConfig.thinkingConfig, undefined);
});

test('safety blocks surface as a flag, not as an error', async () => {
  const { fetchImpl } = recordingFetch([jsonResponse(200, { promptFeedback: { blockReason: 'SAFETY' } })]);
  const provider = buildProvider(fetchImpl);

  const result = await provider.generate(REQUEST);
  assert.equal(result.blocked, true);
  assert.equal(result.text, undefined);
});

test('credential failures are not retried on another model', async () => {
  const { fetchImpl, calls } = recordingFetch([
    jsonResponse(403, { error: { message: 'API key not valid' } }),
    jsonResponse(200, successBody('never reached')),
  ]);
  const provider = buildProvider(fetchImpl);

  await assert.rejects(provider.generate(REQUEST), (error) => {
    assert.ok(error instanceof ProviderError);
    assert.equal(error.kind, 'auth');
    // The client-facing text must not mention keys or upstream details.
    assert.doesNotMatch(error.publicMessage, /key|API|403/i);
    return true;
  });
  assert.equal(calls.length, 1);
});

test('timeouts are reported as a retryable upstream failure', async () => {
  const timeout = () => {
    const error = new Error('timed out');
    error.name = 'TimeoutError';
    throw error;
  };
  const { fetchImpl } = recordingFetch([timeout, timeout]);
  const provider = buildProvider(fetchImpl);

  await assert.rejects(provider.generate(REQUEST), (error) => {
    assert.equal(error.kind, 'unavailable');
    assert.equal(error.status, 503);
    return true;
  });
});

test('the API key never appears in error messages', async () => {
  const { fetchImpl } = recordingFetch([
    jsonResponse(400, { error: { message: `bad request for key ${CONFIG.apiKey}` } }),
  ]);
  const provider = buildProvider(fetchImpl);

  await assert.rejects(provider.generate(REQUEST), (error) => {
    assert.doesNotMatch(error.message, /test-key/);
    assert.match(error.message, /\[redacted\]/);
    return true;
  });
});
