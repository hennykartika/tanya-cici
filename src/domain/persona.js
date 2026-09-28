import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const VIBES = ['heboh', 'kalem', 'savage'];
export const DEFAULT_VIBE = 'heboh';

/**
 * Loads the persona prompt from `prompts/` once at startup.
 *
 * Prompt text lives in versioned Markdown files rather than in source code so
 * that behaviour changes show up as content diffs in review, and so the exact
 * prompt used by a deployment can be identified from logs through `version`.
 */
export function createPersona({ promptsDir, readFile = fs.readFileSync } = {}) {
  const read = (file) => String(readFile(path.join(promptsDir, file), 'utf8')).trim();

  const base = read('base.id.md');
  const guestNote = read('guest.id.md');
  const vibes = Object.fromEntries(VIBES.map((vibe) => [vibe, read(`vibe.${vibe}.id.md`)]));

  const version = crypto
    .createHash('sha256')
    .update([base, guestNote, ...Object.values(vibes)].join('\n'))
    .digest('hex')
    .slice(0, 12);

  return {
    version,
    vibes: VIBES,
    defaultVibe: DEFAULT_VIBE,
    buildSystemPrompt({ vibe = DEFAULT_VIBE, guest = false } = {}) {
      const sections = [base, vibes[vibe] ?? vibes[DEFAULT_VIBE]];
      if (guest) sections.push(guestNote);
      return sections.join('\n\n');
    },
  };
}
