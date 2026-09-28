import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter } from '../../src/app/rate-limiter.js';

function fakeClock(startAt = 0) {
  let now = startAt;
  return { now: () => now, advance: (ms) => (now += ms) };
}

test('allows up to the limit inside one window', () => {
  const clock = fakeClock();
  const limiter = createRateLimiter({ limit: 3, windowMs: 60_000, clock: clock.now });

  assert.equal(limiter.check('a').allowed, true);
  assert.equal(limiter.check('a').allowed, true);
  assert.equal(limiter.check('a').allowed, true);

  const blocked = limiter.check('a');
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds > 0 && blocked.retryAfterSeconds <= 60);
});

test('counters are isolated per key', () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, clock: fakeClock().now });
  assert.equal(limiter.check('a').allowed, true);
  assert.equal(limiter.check('b').allowed, true);
  assert.equal(limiter.check('a').allowed, false);
});

test('the window slides instead of resetting on a fixed schedule', () => {
  const clock = fakeClock();
  const limiter = createRateLimiter({ limit: 2, windowMs: 1000, clock: clock.now });

  limiter.check('a');
  clock.advance(600);
  limiter.check('a');
  assert.equal(limiter.check('a').allowed, false);

  clock.advance(500); // first hit leaves the window, the second is still inside it
  assert.equal(limiter.check('a').allowed, true);
  assert.equal(limiter.check('a').allowed, false);
});

test('evicts entries instead of growing without bound', () => {
  const clock = fakeClock();
  const limiter = createRateLimiter({ limit: 5, windowMs: 60_000, maxKeys: 10, clock: clock.now });

  for (let index = 0; index < 50; index += 1) limiter.check(`client-${index}`);
  assert.ok(limiter.size <= 10, `expected at most 10 tracked keys, got ${limiter.size}`);
});

test('expired entries are dropped so memory returns to zero', () => {
  const clock = fakeClock();
  const limiter = createRateLimiter({ limit: 5, windowMs: 1000, maxKeys: 2, clock: clock.now });

  limiter.check('a');
  limiter.check('b');
  clock.advance(2000);
  limiter.check('c');
  assert.ok(limiter.size <= 2);
});
