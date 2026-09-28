import { AppError, ValidationError } from '../lib/errors.js';

export function sendJson(res, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(payload);
}

export function sendError(res, error) {
  const status = error instanceof AppError ? error.status : 500;
  const code = error instanceof AppError ? error.code : 'internal_error';
  const message =
    error instanceof AppError ? error.publicMessage : 'Ada kendala di server. Coba lagi sebentar lagi ya.';
  const headers = error?.retryAfterSeconds ? { 'retry-after': String(error.retryAfterSeconds) } : {};
  sendJson(res, status, { error: { code, message } }, headers);
}

/**
 * Reads a JSON request body with a hard byte ceiling.
 *
 * `preparsed` covers serverless runtimes (Vercel) that consume the stream and
 * hand over an already decoded body.
 */
export async function readJsonBody(req, { maxBytes, preparsed } = {}) {
  if (preparsed !== undefined && preparsed !== null) {
    return typeof preparsed === 'string' ? parseJson(preparsed) : preparsed;
  }

  const contentType = String(req.headers['content-type'] ?? '');
  if (!contentType.toLowerCase().startsWith('application/json')) {
    // Requiring JSON also forces browsers into a CORS preflight, which the
    // server never answers - so third-party pages cannot post here.
    throw new AppError(`Unsupported content-type: ${contentType || 'none'}`, {
      status: 415,
      code: 'unsupported_media_type',
      publicMessage: 'Format permintaannya harus JSON.',
    });
  }

  const declaredLength = Number.parseInt(req.headers['content-length'] ?? '', 10);
  if (Number.isInteger(declaredLength) && declaredLength > maxBytes) {
    throw payloadTooLarge();
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      req.destroy();
      throw payloadTooLarge();
    }
    chunks.push(chunk);
  }

  return parseJson(Buffer.concat(chunks).toString('utf8'));
}

function payloadTooLarge() {
  return new AppError('Request body too large', {
    status: 413,
    code: 'payload_too_large',
    publicMessage: 'Pesannya kepanjangan.',
  });
}

function parseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    throw new ValidationError('Body is not valid JSON', 'Format permintaannya nggak valid.');
  }
}

/** Resolves the client address, honouring proxy headers only when configured to. */
export function resolveClientIp(req, { trustProxy }) {
  if (trustProxy) {
    const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
    if (forwarded) return forwarded;
  }
  return req.socket?.remoteAddress ?? 'unknown';
}
