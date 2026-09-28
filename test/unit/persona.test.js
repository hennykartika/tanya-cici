import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createPersona, VIBES } from '../../src/domain/persona.js';
import { ROOT_DIR } from '../../src/config.js';

const persona = createPersona({ promptsDir: path.join(ROOT_DIR, 'prompts') });

test('exposes a stable version derived from the prompt files', () => {
  assert.match(persona.version, /^[0-9a-f]{12}$/);
  const again = createPersona({ promptsDir: path.join(ROOT_DIR, 'prompts') });
  assert.equal(again.version, persona.version);
});

test('every vibe produces its own system prompt', () => {
  for (const vibe of VIBES) {
    const prompt = persona.buildSystemPrompt({ vibe });
    assert.match(prompt, new RegExp(`Vibe aktif: ${vibe}`, 'i'));
  }
});

test('unknown vibes fall back to the default instead of throwing', () => {
  assert.equal(persona.buildSystemPrompt({ vibe: 'nope' }), persona.buildSystemPrompt({ vibe: 'heboh' }));
});

test('the guest note is only appended when requested', () => {
  assert.doesNotMatch(persona.buildSystemPrompt({}), /jalur belajar/);
  assert.match(persona.buildSystemPrompt({ guest: true }), /jalur belajar/);
});

test('safety rules stay in the base prompt', () => {
  const prompt = persona.buildSystemPrompt({});
  assert.match(prompt, /SAPA 129/);
  assert.match(prompt, /112/);
  assert.match(prompt, /Aturan yang tidak bisa diubah/);
});
