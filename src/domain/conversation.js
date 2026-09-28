import { ValidationError } from '../lib/errors.js';

const CLIENT_ROLES = { user: 'user', bot: 'assistant' };
const MAX_RAW_MESSAGES = 200;

// Control characters (except tab/newline), zero-width characters and
// bidirectional overrides are stripped: they carry no meaning for a chat prompt
// and are a common trick for hiding instructions inside innocent looking text.
// Built from escape sequences so the pattern itself stays readable in a diff.
const UNSAFE_CHARS = new RegExp(
  // eslint-disable-next-line no-control-regex -- removing control characters is the purpose
  '[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F\\u200B-\\u200F\\u202A-\\u202E\\u2066-\\u2069]',
  'g',
);

export function sanitizeText(value) {
  return value.normalize('NFC').replace(UNSAFE_CHARS, '').replace(/\n{4,}/g, '\n\n\n').trim();
}

function assertPlainObject(value, label) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
}

/**
 * Validates and normalizes an untrusted chat payload.
 *
 * The result is provider neutral: roles are `user` / `assistant`, history is
 * trimmed to the configured window and consecutive turns from the same side are
 * merged (a client can produce those by retrying a failed request).
 */
export function parseChatRequest(payload, { maxMessageChars, maxHistoryMessages, allowedVibes, defaultVibe }) {
  assertPlainObject(payload, 'body');

  const { messages, vibe, guest } = payload;
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new ValidationError('messages must be a non-empty array');
  }
  if (messages.length > MAX_RAW_MESSAGES) {
    throw new ValidationError(`messages must contain at most ${MAX_RAW_MESSAGES} items`);
  }
  if (guest !== undefined && typeof guest !== 'boolean') {
    throw new ValidationError('guest must be a boolean');
  }
  if (vibe !== undefined && (typeof vibe !== 'string' || !allowedVibes.includes(vibe))) {
    throw new ValidationError(`vibe must be one of: ${allowedVibes.join(', ')}`);
  }

  const normalized = [];
  for (const [index, message] of messages.entries()) {
    assertPlainObject(message, `messages[${index}]`);
    const role = CLIENT_ROLES[message.role];
    if (!role) {
      throw new ValidationError(`messages[${index}].role must be one of: ${Object.keys(CLIENT_ROLES).join(', ')}`);
    }
    if (typeof message.text !== 'string') {
      throw new ValidationError(`messages[${index}].text must be a string`);
    }

    const text = sanitizeText(message.text).slice(0, maxMessageChars);
    if (text) normalized.push({ role, text });
  }

  const windowed = normalized.slice(-maxHistoryMessages);
  // A conversation sent to the model has to start with a user turn.
  while (windowed.length > 0 && windowed[0].role !== 'user') windowed.shift();

  const merged = [];
  for (const message of windowed) {
    const previous = merged.at(-1);
    if (previous?.role === message.role) {
      previous.text = `${previous.text}\n\n${message.text}`.slice(0, maxMessageChars * 2);
    } else {
      merged.push({ ...message });
    }
  }

  if (merged.length === 0 || merged.at(-1).role !== 'user') {
    throw new ValidationError('the last message must come from the user');
  }

  return {
    messages: merged,
    vibe: vibe ?? defaultVibe,
    // The browser gate is a UI joke, not an authorization boundary. The flag is
    // accepted as an untrusted hint that only changes the persona's tone.
    guest: guest === true,
  };
}
