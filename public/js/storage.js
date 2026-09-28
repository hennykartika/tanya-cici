const STORAGE_KEY = 'tanya-cici:v1';
const MAX_STORED_MESSAGES = 40;

const EMPTY = { messages: [], vibe: null, gate: null };

/**
 * localStorage wrapper.
 *
 * Every access is guarded: private mode, disabled site data and quota errors
 * must degrade to "no history" instead of breaking the page. Stored data is
 * re-validated on read because it is user-writable.
 */
export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw);

    return {
      messages: Array.isArray(parsed.messages)
        ? parsed.messages
            .filter((item) => item && typeof item.text === 'string' && ['user', 'bot'].includes(item.role))
            .slice(-MAX_STORED_MESSAGES)
        : [],
      vibe: typeof parsed.vibe === 'string' ? parsed.vibe : null,
      gate: ['girl', 'guest'].includes(parsed.gate) ? parsed.gate : null,
    };
  } catch {
    return { ...EMPTY };
  }
}

export function saveState({ messages, vibe, gate }) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ messages: messages.slice(-MAX_STORED_MESSAGES), vibe, gate }),
    );
  } catch {
    // Storage is a convenience here; the session still works without it.
  }
}

export function clearMessages(state) {
  saveState({ ...state, messages: [] });
}
