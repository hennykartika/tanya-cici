import { loadConfig } from './config.js';
import { createLogger } from './lib/logger.js';
import { createPersona } from './domain/persona.js';
import { createProvider } from './providers/index.js';
import { createChatService } from './services/chat-service.js';
import { createRateLimiter } from './app/rate-limiter.js';

/**
 * Composition root: the only place where concrete implementations are wired
 * together. Everything below this line receives its dependencies, which is what
 * makes the HTTP layer testable against the mock provider.
 */
export function createContainer(env = process.env, overrides = {}) {
  const config = overrides.config ?? loadConfig(env);
  const logger = overrides.logger ?? createLogger({ level: config.logLevel });
  const persona = overrides.persona ?? createPersona({ promptsDir: config.paths.promptsDir });
  const provider = overrides.provider ?? createProvider(config, { logger });
  const chatService = overrides.chatService ?? createChatService({ provider, persona, config, logger });
  const rateLimiter = overrides.rateLimiter ?? createRateLimiter(config.rateLimit);

  return { config, logger, persona, provider, chatService, rateLimiter };
}
