import { randomUUID } from 'node:crypto';
import { AppError } from '../lib/errors.js';
import { sendError } from './http.js';
import { applySecurityHeaders } from './security-headers.js';
import { createStaticHandler } from './static-files.js';
import { createChatRoute } from './routes/chat.js';
import { createHealthRoute } from './routes/health.js';

function isHttps(req, { trustProxy }) {
  if (req.socket?.encrypted) return true;
  return trustProxy && String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim() === 'https';
}

export function createApp({ config, logger, chatService, rateLimiter, persona, provider }) {
  const handleChat = createChatRoute({ chatService, rateLimiter, config, logger });
  const handleHealth = createHealthRoute({ persona, provider });
  const serveStatic = createStaticHandler({ root: config.paths.publicDir });

  return async function requestListener(req, res) {
    const requestId = randomUUID();
    res.setHeader('x-request-id', requestId);
    applySecurityHeaders(res, { https: isHttps(req, config.http) });

    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

      if (url.pathname === '/api/chat') {
        await handleChat(req, res, { requestId });
        return;
      }
      if (url.pathname === '/healthz') {
        handleHealth(req, res);
        return;
      }
      if (await serveStatic(req, res, url)) return;

      throw new AppError(`No route for ${req.method} ${url.pathname}`, {
        status: 404,
        code: 'not_found',
        publicMessage: 'Alamatnya nggak ketemu.',
      });
    } catch (error) {
      reportFailure({ error, requestId, logger });
      if (!res.headersSent) sendError(res, error);
      else res.end();
    }
  };
}

/**
 * Expected failures (validation, quota, 404) are noise at error level, so they
 * are logged as warnings without a stack. Anything else is a real defect and
 * keeps its stack in the log - never in the response.
 */
export function reportFailure({ error, requestId, logger }) {
  const expected = error instanceof AppError && error.expected;
  const fields = { requestId, code: error?.code ?? 'internal_error', reason: error?.message };
  if (expected) logger.warn('request.rejected', fields);
  else logger.error('request.failed', { ...fields, stack: error?.stack });
}
