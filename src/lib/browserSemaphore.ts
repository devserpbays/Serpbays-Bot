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

// Atomic Lua script: INCR + EXPIRE + capacity check + slot tracking in one round-trip
const ACQUIRE_LUA = `
local count = redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
if count > tonumber(ARGV[2]) then
  redis.call('DECR', KEYS[1])
  return 0
end
local slotKey = 'browser-slot:' .. ARGV[3] .. ':' .. ARGV[4]
redis.call('SET', slotKey, ARGV[5], 'EX', tonumber(ARGV[1]))
return 1
`;

/**
 * Try to acquire a browser slot. Returns true if acquired, false if at capacity.
 * Uses atomic Lua script to prevent race conditions between INCR and capacity check.
 */
export async function acquireBrowserSlot(label: string = 'unknown'): Promise<boolean> {
  const redis = getRedis();
  const now = Date.now();
  const slotData = JSON.stringify({ pid: process.pid, label, ts: new Date(now).toISOString() });
  const result = await redis.eval(
    ACQUIRE_LUA, 1, SEMAPHORE_KEY,
    SLOT_TTL, MAX_BROWSERS, process.pid.toString(), now.toString(), slotData
  );

  return result !== 0;
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
