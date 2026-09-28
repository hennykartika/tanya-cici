import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../../src/config.js';
import { createContainer } from '../../src/container.js';
import { createApp } from '../../src/app/create-app.js';
import { silentLogger } from '../../src/lib/logger.js';
import { ProviderError } from '../../src/lib/errors.js';

const NO_ENV_FILE = { envFile: path.join(os.tmpdir(), 'tanya-cici-missing.env') };

function buildConfig(overrides = {}) {
  return loadConfig({ PROVIDER: 'mock', LOG_LEVEL: 'silent', RATE_LIMIT_PER_MIN: '60', ...overrides }, NO_ENV_FILE);
}

async function startTestServer({ provider, ...configOverrides } = {}) {
  const config = buildConfig(configOverrides);
  const container = createContainer(undefined, { config, logger: silentLogger, provider });
  const server = http.createServer(createApp(container));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

const chatRequest = (baseUrl, body, { headers = {}, ...init } = {}) =>
  fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    ...init,
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('http surface', () => {
  let server;

  before(async () => {
    server = await startTestServer();
  });
  after(() => server.close());

  test('serves the app shell with security headers', async () => {
    const response = await fetch(`${server.baseUrl}/`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.match(response.headers.get('content-security-policy'), /default-src 'none'/);
    assert.doesNotMatch(response.headers.get('content-security-policy'), /unsafe-inline/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.ok(response.headers.get('x-request-id'));
  });

  test('serves static modules and answers conditional requests', async () => {
    const first = await fetch(`${server.baseUrl}/js/main.js`);
    assert.equal(first.status, 200);
    assert.match(first.headers.get('content-type'), /javascript/);

    const cached = await fetch(`${server.baseUrl}/js/main.js`, {
      headers: { 'if-none-match': first.headers.get('etag') },
    });
    assert.equal(cached.status, 304);
  });

  test('blocks path traversal, including encoded and symlinked forms', async () => {
    for (const target of ['/%2e%2e/src/config.js', '/%2e%2e%2f.env', '/../package.json']) {
      const response = await fetch(`${server.baseUrl}${target}`);
      assert.equal(response.status, 404, `expected 404 for ${target}`);
    }
  });

  test('refuses to serve files with unknown extensions', async () => {
    const response = await fetch(`${server.baseUrl}/../.env.example`);
    assert.equal(response.status, 404);
  });

  test('health endpoint reports liveness without leaking configuration', async () => {
    const response = await fetch(`${server.baseUrl}/healthz`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.status, 'ok');
    assert.equal(body.provider, 'mock');
    assert.ok(!JSON.stringify(body).includes('apiKey'));
  });

  test('answers a valid chat request', async () => {
    const response = await chatRequest(server.baseUrl, {
      messages: [{ role: 'user', text: 'kenapa lemari penuh tapi nggak punya baju?' }],
      vibe: 'kalem',
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.match(body.reply, /ide outfit/);
    assert.equal(body.model, 'mock');
    assert.equal(response.headers.get('cache-control'), 'no-store');
  });

  test('rejects non-POST methods', async () => {
    const response = await fetch(`${server.baseUrl}/api/chat`);
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'POST');
  });

  test('requires a JSON content type', async () => {
    const response = await chatRequest(
      server.baseUrl,
      JSON.stringify({ messages: [{ role: 'user', text: 'halo' }] }),
      { headers: { 'content-type': 'text/plain' } },
    );
    assert.equal(response.status, 415);
  });

  test('rejects invalid payloads with a stable error shape', async () => {
    const response = await chatRequest(server.baseUrl, { messages: [] });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error.code, 'invalid_request');
    assert.equal(typeof body.error.message, 'string');
    assert.equal(body.reply, undefined);
  });

  test('rejects malformed JSON', async () => {
    const response = await chatRequest(server.baseUrl, '{not json');
    assert.equal(response.status, 400);
  });

  test('enforces the body size limit', async () => {
    const response = await chatRequest(server.baseUrl, {
      messages: [{ role: 'user', text: 'x'.repeat(40_000) }],
    });
    assert.equal(response.status, 413);
  });

  test('blocks cross-origin browser requests', async () => {
    const response = await chatRequest(
      server.baseUrl,
      { messages: [{ role: 'user', text: 'halo' }] },
      { headers: { origin: 'https://not-my-site.example' } },
    );
    assert.equal(response.status, 403);
  });

  test('allows same-origin browser requests', async () => {
    const response = await chatRequest(
      server.baseUrl,
      { messages: [{ role: 'user', text: 'halo' }] },
      { headers: { origin: server.baseUrl } },
    );
    assert.equal(response.status, 200);
  });

  test('unknown routes return a JSON 404', async () => {
    const response = await fetch(`${server.baseUrl}/nope`);
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error.code, 'not_found');
  });
});

describe('abuse and failure handling', () => {
  test('rate limits repeated requests and sets retry-after', async () => {
    const server = await startTestServer({ RATE_LIMIT_PER_MIN: '2' });

    try {
      const body = { messages: [{ role: 'user', text: 'halo' }] };
      assert.equal((await chatRequest(server.baseUrl, body)).status, 200);
      assert.equal((await chatRequest(server.baseUrl, body)).status, 200);

      const limited = await chatRequest(server.baseUrl, body);
      assert.equal(limited.status, 429);
      assert.ok(Number(limited.headers.get('retry-after')) > 0);
      assert.equal((await limited.json()).error.code, 'rate_limited');
    } finally {
      await server.close();
    }
  });

  test('upstream failures never leak provider details to the client', async () => {
    const failingProvider = {
      name: 'failing',
      async generate() {
        throw new ProviderError('unavailable', 'Gemini 503: internal backend error at models/secret-model', {
          status: 503,
          publicMessage: 'Sambungan ke layanan AI lagi bermasalah. Coba kirim ulang sebentar lagi.',
        });
      },
    };
    const server = await startTestServer({ provider: failingProvider });

    try {
      const response = await chatRequest(server.baseUrl, { messages: [{ role: 'user', text: 'halo' }] });
      const body = await response.json();

      assert.equal(response.status, 503);
      assert.doesNotMatch(JSON.stringify(body), /secret-model|Gemini|503:/);
    } finally {
      await server.close();
    }
  });

  test('unexpected errors return a generic message without a stack trace', async () => {
    const brokenProvider = {
      name: 'broken',
      async generate() {
        throw new TypeError('provider.internals.undefined is not a function');
      },
    };
    const server = await startTestServer({ provider: brokenProvider });

    try {
      const response = await chatRequest(server.baseUrl, { messages: [{ role: 'user', text: 'halo' }] });
      const body = await response.json();

      assert.equal(response.status, 500);
      assert.equal(body.error.code, 'internal_error');
      assert.doesNotMatch(JSON.stringify(body), /TypeError|internals|at /);
    } finally {
      await server.close();
    }
  });
});
