import { AppError } from '../../lib/errors.js';
import { readJsonBody, resolveClientIp, sendJson } from '../http.js';

/**
 * Rejects browser requests coming from another site.
 *
 * Combined with the JSON-only content type this removes the "someone embeds my
 * endpoint on their page and spends my quota" case. Non-browser clients (curl,
 * tests) send no Origin header and are unaffected.
 */
function assertAllowedOrigin(req, { allowedOrigins }) {
  const origin = req.headers.origin;
  if (!origin) return;

  if (allowedOrigins.length > 0) {
    if (allowedOrigins.includes(origin)) return;
  } else {
    try {
      if (new URL(origin).host === req.headers.host) return;
    } catch {
      // Malformed Origin falls through to the rejection below.
    }
  }

  throw new AppError(`Blocked cross-origin request from ${origin}`, {
    status: 403,
    code: 'origin_not_allowed',
    publicMessage: 'Permintaan dari domain ini nggak diizinkan.',
  });
}

export function createChatRoute({ chatService, rateLimiter, config, logger }) {
  return async function handleChat(req, res, { requestId, preparsedBody } = {}) {
    if (req.method !== 'POST') {
      res.setHeader('allow', 'POST');
      throw new AppError(`Method ${req.method} not allowed`, {
        status: 405,
        code: 'method_not_allowed',
        publicMessage: 'Metodenya harus POST.',
      });
    }

    assertAllowedOrigin(req, config.http);

    const clientIp = resolveClientIp(req, config.http);
    const quota = rateLimiter.check(clientIp);
    if (!quota.allowed) {
      logger.warn('chat.rate_limited', { requestId });
      const error = new AppError('Rate limit exceeded', {
        status: 429,
        code: 'rate_limited',
        publicMessage: 'Pelan-pelan ya, kebanyakan pesan dalam semenit. Coba lagi sebentar lagi.',
      });
      error.retryAfterSeconds = quota.retryAfterSeconds;
      throw error;
    }

    const body = await readJsonBody(req, { maxBytes: config.http.maxBodyBytes, preparsed: preparsedBody });
    const startedAt = Date.now();
    const result = await chatService.reply(body, { requestId });

    logger.info('chat.replied', {
      requestId,
      model: result.model,
      blocked: result.blocked,
      latencyMs: Date.now() - startedAt,
      replyChars: result.reply.length,
    });

    sendJson(res, 200, { reply: result.reply, model: result.model });
  };
}
