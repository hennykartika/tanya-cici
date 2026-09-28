import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEnv } from '../../src/lib/env-file.js';

test('parses simple assignments and ignores comments', () => {
  const parsed = parseEnv(['# comment', 'GEMINI_API_KEY=abc123', '', 'PORT = 8080'].join('\n'));
  assert.deepEqual(parsed, { GEMINI_API_KEY: 'abc123', PORT: '8080' });
});

test('handles quotes, escapes, export prefix and trailing comments', () => {
  const parsed = parseEnv(
    [
      'export HOST="0.0.0.0"',
      "SINGLE='keep #hash'",
      'MULTI="line1\\nline2"',
      'PLAIN=value # trailing comment',
    ].join('\r\n'),
  );

  assert.equal(parsed.HOST, '0.0.0.0');
  assert.equal(parsed.SINGLE, 'keep #hash');
  assert.equal(parsed.MULTI, 'line1\nline2');
  assert.equal(parsed.PLAIN, 'value');
});

test('skips malformed lines instead of throwing', () => {
  assert.deepEqual(parseEnv('not an assignment\n123INVALID=x\nOK=1'), { OK: '1' });
});
