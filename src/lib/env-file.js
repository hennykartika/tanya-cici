import fs from 'node:fs';

const LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/;

/**
 * Minimal dotenv parser. The project has no runtime dependencies on purpose,
 * and Node's own --env-file flag is not available on every supported runtime
 * (Vercel injects variables directly, so this path is local-only).
 */
export function parseEnv(source) {
  const result = {};
  for (const rawLine of String(source).split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trim().startsWith('#')) continue;
    const match = rawLine.match(LINE);
    if (!match) continue;

    const [, key, rawValue] = match;
    let value = rawValue;

    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = value.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"');
    } else if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
      value = value.slice(1, -1);
    } else {
      value = value.split(' #')[0].trim();
    }

    result[key] = value;
  }
  return result;
}

/**
 * Loads a .env file without overriding variables that are already set:
 * the real process environment always wins over the file.
 */
export function loadEnvFile(filePath, env = process.env) {
  if (!fs.existsSync(filePath)) return env;
  const parsed = parseEnv(fs.readFileSync(filePath, 'utf8'));
  for (const [key, value] of Object.entries(parsed)) {
    if (env[key] === undefined) env[key] = value;
  }
  return env;
}
