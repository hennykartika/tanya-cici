/**
 * In-memory sliding window limiter.
 *
 * Scope is deliberately per process: it protects a single-instance deployment
 * from burning the free API quota. A multi-instance deployment needs a shared
 * store (Redis or the platform's own limiter) - see docs/SECURITY.md.
 */
export function createRateLimiter({ limit, windowMs, maxKeys = 10_000, clock = Date.now }) {
  const hits = new Map();

  function prune(now) {
    for (const [key, timestamps] of hits) {
      const fresh = timestamps.filter((time) => now - time < windowMs);
      if (fresh.length === 0) hits.delete(key);
      else hits.set(key, fresh);
    }
  }

  return {
    get size() {
      return hits.size;
    },

    /** @returns {{allowed: boolean, remaining: number, retryAfterSeconds: number}} */
    check(key) {
      const now = clock();

      // Bounded memory: evicting the oldest entry keeps one abusive client from
      // pushing everyone else's counters out of the map.
      if (!hits.has(key) && hits.size >= maxKeys) {
        prune(now);
        if (hits.size >= maxKeys) hits.delete(hits.keys().next().value);
      }

      const timestamps = (hits.get(key) ?? []).filter((time) => now - time < windowMs);
      if (timestamps.length >= limit) {
        const retryAfterMs = windowMs - (now - timestamps[0]);
        hits.set(key, timestamps);
        return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
      }

      timestamps.push(now);
      hits.set(key, timestamps);
      return { allowed: true, remaining: limit - timestamps.length, retryAfterSeconds: 0 };
    },
  };
}
