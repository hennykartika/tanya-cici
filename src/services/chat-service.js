import { parseChatRequest } from '../domain/conversation.js';

const BLOCKED_REPLY = [
  'Yang ini aku lewati dulu ya.',
  '',
  'Coba tanya dengan kalimat lain. Kalau ini soal sesuatu yang berat, cerita pelan-pelan aja, aku dengerin.',
].join('\n');

/**
 * Application service: untrusted payload in, safe reply out.
 *
 * It owns validation and persona selection so that the HTTP layer stays a thin
 * adapter and the same flow can be driven from tests or another transport.
 */
export function createChatService({ provider, persona, config, logger }) {
  return {
    async reply(payload, { requestId } = {}) {
      const { messages, vibe, guest } = parseChatRequest(payload, {
        maxMessageChars: config.conversation.maxMessageChars,
        maxHistoryMessages: config.conversation.maxHistoryMessages,
        allowedVibes: persona.vibes,
        defaultVibe: persona.defaultVibe,
      });

      const systemPrompt = persona.buildSystemPrompt({ vibe, guest });

      // Metadata only: conversation content stays out of the logs.
      logger.debug('chat.request', {
        requestId,
        vibe,
        guest,
        messageCount: messages.length,
        promptChars: messages.reduce((total, message) => total + message.text.length, 0),
        personaVersion: persona.version,
      });

      const result = await provider.generate({ systemPrompt, messages, requestId });

      if (result.blocked) {
        logger.info('chat.blocked', { requestId, model: result.model, personaVersion: persona.version });
        return { reply: BLOCKED_REPLY, model: result.model, blocked: true };
      }

      return { reply: result.text, model: result.model, blocked: false };
    },
  };
}
