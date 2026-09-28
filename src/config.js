import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigError } from './lib/errors.js';
import { loadEnvFile } from './lib/env-file.js';

export const ROOT_DIR = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

const PROVIDERS = new Set(['gemini', 'mock']);
const LOG_LEVELS = new Set(['debug', 'info', 'warn', 'error', 'silent']);

function readInt(env, key, fallback, { min, max }, problems) {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < min || value > max) {
    problems.push(`${key} must be an integer between ${min} and ${max}`);
    return fallback;
  }
  return value;
}

function readBool(env, key, fallback) {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

function readList(env, key) {
  return (env[key] ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Builds the runtime configuration and fails fast on invalid input.
 *
 * Every problem is collected before throwing so a misconfigured deployment
 * reports all of its issues in one go instead of one restart at a time.
 */
export function loadConfig(env = process.env, { envFile = path.join(ROOT_DIR, '.env') } = {}) {
  loadEnvFile(envFile, env);

  const problems = [];
  const provider = env.PROVIDER ?? 'gemini';
  if (!PROVIDERS.has(provider)) {
    problems.push(`PROVIDER must be one of: ${[...PROVIDERS].join(', ')}`);
  }

  const logLevel = env.LOG_LEVEL ?? 'info';
  if (!LOG_LEVELS.has(logLevel)) {
    problems.push(`LOG_LEVEL must be one of: ${[...LOG_LEVELS].join(', ')}`);
  }

  const apiKey = (env.GEMINI_API_KEY ?? '').trim();
  if (provider === 'gemini' && !apiKey) {
    problems.push('GEMINI_API_KEY is required when PROVIDER=gemini (get one at https://aistudio.google.com/apikey)');
  }

  let apiBase = env.GEMINI_API_BASE ?? 'https://generativelanguage.googleapis.com/v1beta';
  try {
    const parsed = new URL(apiBase);
    // http is tolerated for local test doubles only; anything public must be TLS.
    if (parsed.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(parsed.hostname)) {
      problems.push('GEMINI_API_BASE must use https outside of localhost');
    }
    apiBase = parsed.toString().replace(/\/$/, '');
  } catch {
    problems.push('GEMINI_API_BASE must be a valid URL');
  }

  const config = Object.freeze({
    env: env.NODE_ENV ?? 'development',
    provider,
    logLevel,
    http: Object.freeze({
      port: readInt(env, 'PORT', 3000, { min: 1, max: 65535 }, problems),
      // Loopback by default: a dev server should not be reachable from the
      // local network unless that is an explicit decision.
      host: env.HOST ?? '127.0.0.1',
      trustProxy: readBool(env, 'TRUST_PROXY', false),
      allowedOrigins: readList(env, 'ALLOWED_ORIGINS'),
      maxBodyBytes: readInt(env, 'MAX_BODY_BYTES', 32 * 1024, { min: 1024, max: 1024 * 1024 }, problems),
    }),
    rateLimit: Object.freeze({
      limit: readInt(env, 'RATE_LIMIT_PER_MIN', 12, { min: 1, max: 600 }, problems),
      windowMs: 60_000,
      maxKeys: readInt(env, 'RATE_LIMIT_MAX_KEYS', 10_000, { min: 100, max: 1_000_000 }, problems),
    }),
    conversation: Object.freeze({
      maxMessageChars: readInt(env, 'MAX_MESSAGE_CHARS', 1000, { min: 50, max: 8000 }, problems),
      maxHistoryMessages: readInt(env, 'MAX_HISTORY_MESSAGES', 16, { min: 2, max: 60 }, problems),
    }),
    gemini: Object.freeze({
      apiKey,
      apiBase,
      model: env.GEMINI_MODEL ?? 'gemini-3.6-flash',
      fallbackModel: env.GEMINI_FALLBACK_MODEL ?? 'gemini-3.5-flash-lite',
      // Per attempt. Successful calls land well under this; anything slower is
      // usually an overloaded endpoint and is better retried than waited out.
      timeoutMs: readInt(env, 'GEMINI_TIMEOUT_MS', 25_000, { min: 1000, max: 120_000 }, problems),
      // Extra attempts on the same model for transient 5xx and timeouts.
      maxRetries: readInt(env, 'GEMINI_MAX_RETRIES', 2, { min: 0, max: 5 }, problems),
      // Budget for the whole call, retries and model fallback included.
      deadlineMs: readInt(env, 'GEMINI_DEADLINE_MS', 60_000, { min: 5000, max: 180_000 }, problems),
      maxOutputTokens: readInt(env, 'GEMINI_MAX_OUTPUT_TOKENS', 2048, { min: 256, max: 8192 }, problems),
      thinkingLevel: env.GEMINI_THINKING_LEVEL ?? 'low',
    }),
    paths: Object.freeze({
      publicDir: path.join(ROOT_DIR, 'public'),
      promptsDir: path.join(ROOT_DIR, 'prompts'),
    }),
  });

  if (problems.length > 0) throw new ConfigError(problems);
  return config;
}
