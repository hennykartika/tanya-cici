import { randomUUID } from 'node:crypto';
import { createContainer } from '../src/container.js';
import { createChatRoute } from '../src/app/routes/chat.js';
import { reportFailure } from '../src/app/create-app.js';
import { applySecurityHeaders } from '../src/app/security-headers.js';
import { sendError } from '../src/app/http.js';
import { createLogger } from '../src/lib/logger.js';

/**
 * Vercel serverless entry point.
 *
 * It reuses the same container and route as the standalone server; only the
 * body handling differs, because the platform has already parsed it.
 */
let cached;

function getRoute() {
  if (!cached) {
    // Requests always arrive through Vercel's proxy, so forwarded headers are
    // the only source of the client address here.
    const container = createContainer({ TRUST_PROXY: 'true', ...process.env });
    cached = { route: createChatRoute(container), ...container };
  }
  return cached;
}

export default async function handler(req, res) {
  const requestId = randomUUID();
  let logger;

  try {
    const context = getRoute();
    logger = context.logger;
    res.setHeader('x-request-id', requestId);
    applySecurityHeaders(res, { https: true });
    await context.route(req, res, { requestId, preparsedBody: req.body });
  } catch (error) {
    // A failure during container creation (bad configuration) happens before a
    // logger exists, so fall back to a minimal one.
    reportFailure({ error, requestId, logger: logger ?? createLogger({ level: 'error' }) });
    if (!res.headersSent) sendError(res, error);
    else res.end();
  }
}
