/**
 * Redis-based cron state tracker (multi-user).
 *
 * Locks, status, and logs are scoped per userId+platform so multiple users
 * can run cron jobs concurrently without blocking each other.
 *
 * Redis keys:
 *   cron:status  — hash: key=userId:platform, value=JSON status
 *   cron:log     — sorted set: score=timestamp, member=JSON entry
 *   cron:lock:<userId>:<platform> — SET NX EX 600 lock
 */

import { getRedis } from './redis';
import { randomBytes } from 'crypto';

const STATUS_HASH = 'cron:status';
const LOG_KEY = 'cron:log';
const LOG_ENTRY_HASH = 'cron:entries'; // hash: entryId → {score, json} for O(1) lookup
const LOG_MAX = 5000;
const LOCK_TTL = 600; // 10 min

export const ALL_PLATFORMS = ['twitter', 'facebook', 'reddit', 'quora', 'pinterest', 'youtube'] as const;
export type Platform = typeof ALL_PLATFORMS[number];

export interface CronPlatformStatus {
  running: boolean;
  lastStarted: string | null;
  lastFinished: string | null;
  lastExitCode: number | null;
  lastMessage: string;
  lastTrigger: 'auto' | 'manual' | null;
}

export interface CronStatusMap {
  [key: string]: CronPlatformStatus;
}

export interface CronLogEntry {
  id: string;
  platform: string;
  userId?: string;
  trigger: 'auto' | 'manual';
  startedAt: string;
  finishedAt: string | null;
  exitCode: number | null;
  message: string;
  status: 'running' | 'ok' | 'failed' | 'error';
}

function defaultStatus(): CronPlatformStatus {
  return { running: false, lastStarted: null, lastFinished: null, lastExitCode: null, lastMessage: '', lastTrigger: null };
}

function statusKey(platform: string, userId?: string): string {
  return userId ? `${userId}:${platform}` : platform;
}

function lockKey(platform: string, userId?: string): string {
  const base = userId ? `${userId}:${platform}` : platform;
  return `cron:lock:${base}`;
}

export async function readCronStatus(): Promise<CronStatusMap> {
  try {
    const redis = getRedis();
    const all = await redis.hgetall(STATUS_HASH);
    const result: CronStatusMap = {};
    for (const [key, val] of Object.entries(all)) {
      try { result[key] = JSON.parse(val); } catch { }
    }
    return result;
  } catch {
    return {};
  }
}

export async function readCronLog(): Promise<CronLogEntry[]> {
  try {
    const redis = getRedis();
    // Get newest first (reverse range by score, highest score = newest)
    const entries = await redis.zrevrange(LOG_KEY, 0, LOG_MAX - 1);
    return entries.map(e => { try { return JSON.parse(e); } catch { return null; } }).filter(Boolean) as CronLogEntry[];
  } catch {
    return [];
  }
}

/**
 * Acquire a distributed lock for the given user+platform.
 * Returns true if the lock was acquired (safe to proceed).
 */
export async function acquireCronLock(platform: string, userId?: string): Promise<boolean> {
  try {
    const redis = getRedis();
    const result = await redis.set(lockKey(platform, userId), String(process.pid), 'EX', LOCK_TTL, 'NX');
    return result === 'OK';
  } catch {
    // Redis down — allow the request
    return true;
  }
}

/**
 * Release the lock for the given user+platform.
 */
export async function releaseCronLock(platform: string, userId?: string): Promise<void> {
  try {
    const redis = getRedis();
    await redis.del(lockKey(platform, userId));
  } catch { /* best effort */ }
}

/**
 * Call at the start of a cron run. Returns the entry id for use in cronFinish().
 */
export async function cronStart(platform: string, trigger: 'auto' | 'manual' = 'auto', userId?: string): Promise<string> {
  const id = `${Date.now()}-${randomBytes(3).toString('hex')}`;
  const now = new Date().toISOString();
  const key = statusKey(platform, userId);

  try {
    const redis = getRedis();

    // Update status hash
    const existing = await redis.hget(STATUS_HASH, key);
    const status: CronPlatformStatus = existing ? JSON.parse(existing) : defaultStatus();
    status.running = true;
    status.lastStarted = now;
    status.lastTrigger = trigger;
    await redis.hset(STATUS_HASH, key, JSON.stringify(status));

    // Add to log sorted set (score = timestamp for ordering)
    const entry: CronLogEntry = {
      id, platform, userId, trigger,
      startedAt: now, finishedAt: null,
      exitCode: null, message: '', status: 'running',
    };
    const score = Date.now();
    const entryJson = JSON.stringify(entry);
    await redis.zadd(LOG_KEY, score, entryJson);
    // Store in hash for O(1) lookup by entryId
    await redis.hset(LOG_ENTRY_HASH, id, JSON.stringify({ score, json: entryJson }));

    // Trim log to max size
    const count = await redis.zcard(LOG_KEY);
    if (count > LOG_MAX) {
      await redis.zremrangebyrank(LOG_KEY, 0, count - LOG_MAX - 1);
    }
  } catch { /* best effort */ }

  return id;
}

/**
 * Call at the end of a cron run (including error paths).
 */
export async function cronFinish(entryId: string, platform: string, exitCode: number, message = '', userId?: string): Promise<void> {
  const now = new Date().toISOString();
  const key = statusKey(platform, userId);

  try {
    const redis = getRedis();

    // Update status hash
    const existing = await redis.hget(STATUS_HASH, key);
    const status: CronPlatformStatus = existing ? JSON.parse(existing) : defaultStatus();
    status.running = false;
    status.lastFinished = now;
    status.lastExitCode = exitCode;
    status.lastMessage = message;
    await redis.hset(STATUS_HASH, key, JSON.stringify(status));

    // O(1) lookup via entry hash instead of scanning sorted set
    const stored = await redis.hget(LOG_ENTRY_HASH, entryId);
    if (stored) {
      const { score, json: oldJson } = JSON.parse(stored);
      const entry: CronLogEntry = JSON.parse(oldJson);
      // Remove old entry from sorted set
      await redis.zrem(LOG_KEY, oldJson);
      // Update entry
      entry.finishedAt = now;
      entry.exitCode = exitCode;
      entry.message = message;
      entry.status = exitCode === 0 ? 'ok' : 'failed';
      const newJson = JSON.stringify(entry);
      await redis.zadd(LOG_KEY, score, newJson);
      // Update hash
      await redis.hset(LOG_ENTRY_HASH, entry.id, JSON.stringify({ score, json: newJson }));
    }
  } catch { /* best effort */ }
}

/**
 * Force-stop a running cron job for the given user+platform.
 * Resets the status hash, updates the running log entry to 'failed',
 * releases the distributed lock, and sets an abort signal for the worker.
 */
export async function forceStopCron(platform: string, userId?: string): Promise<void> {
  const key = statusKey(platform, userId);

  try {
    const redis = getRedis();

    // 1. Update status hash — mark as stopped
    const existing = await redis.hget(STATUS_HASH, key);
    if (existing) {
      const status: CronPlatformStatus = JSON.parse(existing);
      status.running = false;
      status.lastFinished = new Date().toISOString();
      status.lastExitCode = 1;
      status.lastMessage = 'Stopped by user';
      await redis.hset(STATUS_HASH, key, JSON.stringify(status));
    }

    // 2. Find and update the running log entry for this platform
    const allEntries = await redis.zrevrange(LOG_KEY, 0, 200);
    for (const raw of allEntries) {
      try {
        const entry: CronLogEntry = JSON.parse(raw);
        if (
          entry.status === 'running' &&
          entry.platform === platform &&
          (!userId || entry.userId === userId)
        ) {
          // Remove old entry, add updated one
          await redis.zrem(LOG_KEY, raw);
          entry.status = 'failed';
          entry.finishedAt = new Date().toISOString();
          entry.exitCode = 1;
          entry.message = 'Stopped by user';
          const score = new Date(entry.startedAt).getTime();
          const newJson = JSON.stringify(entry);
          await redis.zadd(LOG_KEY, score, newJson);
          // Update entry hash too
          await redis.hset(LOG_ENTRY_HASH, entry.id, JSON.stringify({ score, json: newJson }));
          break; // only one running entry per platform
        }
      } catch { /* skip malformed */ }
    }

    // 3. Release the distributed lock
    await redis.del(lockKey(platform, userId));

    // 4. Set abort signal so the worker kills the child process
    const abortKey = `cron:abort:${userId ?? 'global'}:${platform}`;
    await redis.set(abortKey, '1', 'EX', 60); // 60s TTL
  } catch { /* best effort */ }
}
