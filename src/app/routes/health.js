import { sendJson } from '../http.js';

/**
 * Liveness endpoint for deployment probes.
 *
 * It exposes nothing that helps an attacker: no versions of dependencies, no
 * configuration values, no API key state.
 */
export function createHealthRoute({ persona, provider }) {
  const startedAt = Date.now();
  return function handleHealth(req, res) {
    sendJson(res, 200, {
      status: 'ok',
      provider: provider.name,
      personaVersion: persona.version,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    });
  };
}
