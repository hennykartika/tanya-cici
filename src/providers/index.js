import { createGeminiProvider } from './gemini.js';
import { createMockProvider } from './mock.js';

export function createProvider(config, { logger }) {
  if (config.provider === 'mock') return createMockProvider();
  return createGeminiProvider({ config: config.gemini, logger });
}
