const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

const REDACTED_KEYS = new Set([
  'apikey',
  'api_key',
  'authorization',
  'x-goog-api-key',
  'key',
  'token',
  'secret',
]);

function redact(fields) {
  const safe = {};
  for (const [key, value] of Object.entries(fields ?? {})) {
    safe[key] = REDACTED_KEYS.has(key.toLowerCase()) ? '[redacted]' : value;
  }
  return safe;
}

/**
 * Structured single-line JSON logger.
 *
 * Conversation content is never passed to this logger by design: prompts and
 * replies may contain personal information, so call sites log metadata only
 * (request id, model, latency, token counts).
 */
export function createLogger({ level = 'info', stream = process.stdout } = {}) {
  const threshold = LEVELS[level] ?? LEVELS.info;

  const emit = (levelName) => (message, fields) => {
    if (LEVELS[levelName] < threshold) return;
    const entry = {
      ts: new Date().toISOString(),
      level: levelName,
      msg: message,
      ...redact(fields),
    };
    stream.write(`${JSON.stringify(entry)}\n`);
  };

  return {
    level,
    debug: emit('debug'),
    info: emit('info'),
    warn: emit('warn'),
    error: emit('error'),
  };
}

export const silentLogger = createLogger({ level: 'silent' });
