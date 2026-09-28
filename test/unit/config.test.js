import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../../src/config.js';
import { ConfigError } from '../../src/lib/errors.js';

const NO_ENV_FILE = { envFile: path.join(os.tmpdir(), 'tanya-cici-missing.env') };

test('fails fast when the API key is missing for the gemini provider', () => {
  assert.throws(() => loadConfig({ PROVIDER: 'gemini' }, NO_ENV_FILE), (error) => {
    assert.ok(error instanceof ConfigError);
    assert.match(error.problems.join(' '), /GEMINI_API_KEY/);
    return true;
  });
});

test('mock provider needs no credentials', () => {
  const config = loadConfig({ PROVIDER: 'mock' }, NO_ENV_FILE);
  assert.equal(config.provider, 'mock');
  assert.equal(config.http.host, '127.0.0.1');
  assert.equal(config.http.trustProxy, false);
});

test('rejects out-of-range numbers and non-https api bases', () => {
  assert.throws(
    () =>
      loadConfig(
        { PROVIDER: 'mock', RATE_LIMIT_PER_MIN: '0', GEMINI_API_BASE: 'http://example.com/v1beta' },
        NO_ENV_FILE,
      ),
    (error) => {
      const message = error.problems.join(' ');
      assert.match(message, /RATE_LIMIT_PER_MIN/);
      assert.match(message, /https/);
      return true;
    },
  );
});

test('allows a plain http base only on localhost, for test doubles', () => {
  const config = loadConfig(
    { PROVIDER: 'mock', GEMINI_API_BASE: 'http://127.0.0.1:4555/v1beta/' },
    NO_ENV_FILE,
  );
  assert.equal(config.gemini.apiBase, 'http://127.0.0.1:4555/v1beta');
});

test('configuration object is frozen', () => {
  const config = loadConfig({ PROVIDER: 'mock' }, NO_ENV_FILE);
  assert.throws(() => {
    config.provider = 'gemini';
  }, TypeError);
});
