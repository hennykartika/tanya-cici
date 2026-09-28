import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChatRequest, sanitizeText } from '../../src/domain/conversation.js';
import { ValidationError } from '../../src/lib/errors.js';

const LIMITS = {
  maxMessageChars: 100,
  maxHistoryMessages: 4,
  allowedVibes: ['heboh', 'kalem', 'savage'],
  defaultVibe: 'heboh',
};

const parse = (payload) => parseChatRequest(payload, LIMITS);

test('maps client roles and applies defaults', () => {
  const result = parse({ messages: [{ role: 'user', text: 'halo' }] });
  assert.deepEqual(result.messages, [{ role: 'user', text: 'halo' }]);
  assert.equal(result.vibe, 'heboh');
  assert.equal(result.guest, false);
});

test('keeps only the configured history window and drops a leading model turn', () => {
  const result = parse({
    messages: [
      { role: 'bot', text: 'a' },
      { role: 'user', text: 'b' },
      { role: 'bot', text: 'c' },
      { role: 'user', text: 'd' },
      { role: 'bot', text: 'e' },
      { role: 'user', text: 'f' },
    ],
  });

  // Window of 4 keeps [bot c, user d, bot e, user f]; the leading model turn is
  // then dropped, leaving three messages that start with the user.
  assert.equal(result.messages.length, 3);
  assert.equal(result.messages[0].role, 'user');
  assert.equal(result.messages[0].text, 'd');
  assert.equal(result.messages.at(-1).text, 'f');
});

test('merges consecutive turns from the same side', () => {
  const result = parse({
    messages: [
      { role: 'user', text: 'pertama' },
      { role: 'user', text: 'kedua' },
    ],
  });

  assert.equal(result.messages.length, 1);
  assert.equal(result.messages[0].text, 'pertama\n\nkedua');
});

test('truncates long messages to the configured limit', () => {
  const result = parse({ messages: [{ role: 'user', text: 'x'.repeat(500) }] });
  assert.equal(result.messages[0].text.length, LIMITS.maxMessageChars);
});

test('strips control characters and bidirectional overrides', () => {
  const rightToLeftOverride = String.fromCharCode(0x202e);
  const nullCharacter = String.fromCharCode(0x00);
  assert.equal(sanitizeText(`halo${rightToLeftOverride}evil${nullCharacter} `), 'haloevil');
});

test('rejects malformed payloads', () => {
  const cases = [
    null,
    [],
    { messages: [] },
    { messages: 'halo' },
    { messages: [{ role: 'admin', text: 'halo' }] },
    { messages: [{ role: 'user', text: 42 }] },
    { messages: [{ role: 'user', text: 'halo' }], vibe: 'chaos' },
    { messages: [{ role: 'user', text: 'halo' }], guest: 'true' },
    { messages: [{ role: 'user', text: 'halo' }, { role: 'bot', text: 'jawab' }] },
    { messages: Array.from({ length: 201 }, () => ({ role: 'user', text: 'spam' })) },
  ];

  for (const payload of cases) {
    assert.throws(() => parse(payload), ValidationError, `expected rejection for ${JSON.stringify(payload)}`);
  }
});

test('treats the guest flag as an untrusted hint, never as a role', () => {
  const result = parse({ messages: [{ role: 'user', text: 'halo' }], guest: true });
  assert.equal(result.guest, true);
  assert.equal(Object.keys(result).length, 3);
});
