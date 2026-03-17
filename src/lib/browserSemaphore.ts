/**
 * Redis-based browser semaphore — limits concurrent Chromium instances
 * across all workers to prevent OOM on limited servers.
 *
 * Cluster-safe: uses Redis INCR/DECR with TTL auto-cleanup.
 */

import { getRedis } from './redis';

const SEMAPHORE_KEY = 'browser-slots:count';
const MAX_BROWSERS = parseInt(process.env.MAX_BROWSER_CONCURRENCY || '3', 10);
const SLOT_TTL = 600; // 10 min — auto-expire if worker crashes

// Atomic Lua script: INCR + EXPIRE + capacity check in one round-trip
const ACQUIRE_LUA = `
local count = redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
if count > tonumber(ARGV[2]) then
  redis.call('DECR', KEYS[1])
  return 0
end
return 1
`;

/**
 * Try to acquire a browser slot. Returns true if acquired, false if at capacity.
 * Uses atomic Lua script to prevent race conditions between INCR and capacity check.
 */
export async function acquireBrowserSlot(label: string = 'unknown'): Promise<boolean> {
  const redis = getRedis();
  const result = await redis.eval(ACQUIRE_LUA, 1, SEMAPHORE_KEY, SLOT_TTL, MAX_BROWSERS);

  if (result === 0) return false;

  // Track individual slot for debugging
  const slotKey = `browser-slot:${process.pid}:${Date.now()}`;
  await redis.set(slotKey, JSON.stringify({ pid: process.pid, label, ts: new Date().toISOString() }), 'EX', SLOT_TTL);

  return true;
}

/**
 * Wait for a browser slot with timeout. Polls every 2s.
 */
export async function waitForBrowserSlot(label: string, timeoutMs: number = 60000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await acquireBrowserSlot(label)) return true;
    await new Promise(r => setTimeout(r, 2000));
  }
  return false;
}

/**
 * Release a browser slot.
 */
export async function releaseBrowserSlot(): Promise<void> {
  const redis = getRedis();
  const val = await redis.decr(SEMAPHORE_KEY);
  if (val < 0) await redis.set(SEMAPHORE_KEY, '0', 'EX', SLOT_TTL);
}

/**
 * Get current usage stats.
 */
export async function getBrowserSlotStats(): Promise<{ active: number; max: number }> {
  const redis = getRedis();
  const count = parseInt(await redis.get(SEMAPHORE_KEY) || '0', 10);
  return { active: Math.max(0, count), max: MAX_BROWSERS };
}
