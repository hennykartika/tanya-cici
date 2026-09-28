import http from 'node:http';
import { createContainer } from './container.js';
import { createApp } from './app/create-app.js';
import { ConfigError } from './lib/errors.js';

const SHUTDOWN_GRACE_MS = 5_000;

function startServer() {
  const container = createContainer();
  const { config, logger } = container;
  const server = http.createServer(createApp(container));

  // Slowloris style connections hold sockets open without finishing a request;
  // these ceilings make the server drop them instead of accumulating them.
  server.headersTimeout = 20_000;
  server.requestTimeout = 60_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 64;

  server.listen(config.http.port, config.http.host, () => {
    logger.info('server.started', {
      url: `http://${config.http.host}:${config.http.port}`,
      provider: config.provider,
      model: config.provider === 'gemini' ? config.gemini.model : 'mock',
      personaVersion: container.persona.version,
      env: config.env,
    });
  });

  const shutdown = (signal) => {
    logger.info('server.stopping', { signal });
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), SHUTDOWN_GRACE_MS).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    logger.error('process.unhandled_rejection', { reason: String(reason) });
    shutdown('unhandledRejection');
  });

  return server;
}

try {
  startServer();
} catch (error) {
  if (error instanceof ConfigError) {
    process.stderr.write(`Configuration error:\n- ${error.problems.join('\n- ')}\n`);
    process.stderr.write('Copy .env.example to .env and fill in the required values.\n');
    process.exit(1);
  }
  throw error;
}
