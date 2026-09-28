const ENDPOINT = '/api/chat';
// Longer than the server's own deadline (GEMINI_DEADLINE_MS), so a slow upstream
// produces the server's explanatory message instead of a bare client timeout.
const DEFAULT_TIMEOUT_MS = 70_000;

export class ChatError extends Error {
  constructor(message, { code = 'unknown' } = {}) {
    super(message);
    this.name = 'ChatError';
    this.code = code;
  }
}

/**
 * Posts a conversation to the backend.
 *
 * The request always carries a timeout: without one a stalled connection leaves
 * the composer disabled forever.
 */
export async function sendChat({ messages, vibe, guest }, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  let response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages, vibe, guest }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error?.name === 'TimeoutError') {
      throw new ChatError('Kelamaan nunggu jawaban. Coba kirim ulang ya.', { code: 'timeout' });
    }
    throw new ChatError('Server-nya nggak kejangkau. Pastikan servernya masih jalan.', { code: 'network' });
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ChatError(payload?.error?.message ?? 'Ada kendala di server.', {
      code: payload?.error?.code ?? `http_${response.status}`,
    });
  }
  if (typeof payload.reply !== 'string' || payload.reply.length === 0) {
    throw new ChatError('Jawabannya kosong. Coba tanya lagi ya.', { code: 'empty_reply' });
  }

  return { reply: payload.reply, model: payload.model };
}
