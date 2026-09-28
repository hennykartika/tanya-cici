#!/usr/bin/env node
/**
 * Fails the build when something that looks like a credential is about to be
 * committed. It is a cheap safety net, not a replacement for GitHub secret
 * scanning and push protection - see docs/SECURITY.md.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PATTERNS = [
  { name: 'Google API key', regex: /AIza[0-9A-Za-z_-]{30,}/g, group: 0 },
  { name: 'Credential assignment', regex: /(?:api[_-]?key|secret|token|password)\s*[:=]\s*["']?([A-Za-z0-9_-]{10,})/gi, group: 1 },
  { name: 'Private key block', regex: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g, group: 0 },
];

// Values that are obviously stand-ins rather than live credentials.
const PLACEHOLDER = /^(?:your|my|the|paste|insert|example|sample|dummy|fake|test|mock|changeme|replace|xxx+|placeholder|redacted)[-_a-z0-9]*$/i;

const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git', 'coverage', '.vercel']);
const SKIPPED_FILES = new Set(['docs/SECURITY.md', 'scripts/scan-secrets.js']);
const BINARY_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.ico', '.woff2', '.zip', '.pdf']);

function listTrackedFiles() {
  try {
    return execFileSync('git', ['ls-files'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\n')
      .filter(Boolean);
  } catch {
    return walk('.');
  }
}

function walk(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      files.push(...walk(path.join(directory, entry.name)));
    } else if (entry.isFile()) {
      files.push(path.join(directory, entry.name).replace(/^\.[/\\]/, ''));
    }
  }
  return files;
}

const findings = [];

for (const file of listTrackedFiles()) {
  if (SKIPPED_FILES.has(file) || BINARY_EXTENSIONS.has(path.extname(file).toLowerCase())) continue;

  let content;
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch {
    continue;
  }

  for (const { name, regex, group } of PATTERNS) {
    for (const match of content.matchAll(regex)) {
      const value = match[group] ?? '';
      if (group !== 0 && PLACEHOLDER.test(value)) continue;
      const line = content.slice(0, match.index).split('\n').length;
      findings.push(`${file}:${line}  ${name}`);
    }
  }
}

if (findings.length > 0) {
  process.stderr.write(`Possible secrets found:\n${findings.map((item) => `  - ${item}`).join('\n')}\n`);
  process.exit(1);
}

process.stdout.write(`No secrets found (${listTrackedFiles().length} files scanned).\n`);
