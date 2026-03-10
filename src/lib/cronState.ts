/**
 * File-based cron state tracker (multi-user).
 *
 * Locks, status, and logs are scoped per userId+platform so multiple users
 * can run cron jobs concurrently without blocking each other.
 *
 * Files in <cwd>/data/:
 *   cron-status.json  — current per-user-platform status (in-flight + last run info)
 *   cron-run-log.json — persisted ordered history (newest first, capped at 500)
 *   <userId>-<platform>.pid — per-user PID lock files
 *
 * Cron scripts call cronStart() at entry and cronFinish() on exit.
 * API routes read with readCronStatus() / readCronLog().
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';

const DATA_DIR = join(process.cwd(), 'data');
const STATUS_FILE = join(DATA_DIR, 'cron-status.json');
const LOG_FILE = join(DATA_DIR, 'cron-run-log.json');
const LOG_MAX = 500;

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
  [key: string]: CronPlatformStatus; // key = "userId:platform" or legacy "platform"
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

function ensureDataDir() {
  try { mkdirSync(DATA_DIR, { recursive: true }); } catch { /* already exists */ }
}

function defaultStatus(): CronPlatformStatus {
  return { running: false, lastStarted: null, lastFinished: null, lastExitCode: null, lastMessage: '', lastTrigger: null };
}

// Build a status key scoped to user+platform
function statusKey(platform: string, userId?: string): string {
  return userId ? `${userId}:${platform}` : platform;
}

// Build a lock file name scoped to user+platform
function lockFileName(platform: string, userId?: string): string {
  if (userId) {
    // Sanitize userId for filename (replace non-alphanumeric with _)
    const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `${safeUserId}-${platform}.pid`;
  }
  return `${platform}.pid`;
}

export function readCronStatus(): CronStatusMap {
  try {
    const raw = readFileSync(STATUS_FILE, 'utf-8');
    return JSON.parse(raw) as CronStatusMap;
  } catch {
    return {};
  }
}

function writeCronStatus(status: CronStatusMap) {
  ensureDataDir();
  writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2), 'utf-8');
}

export function readCronLog(): CronLogEntry[] {
  try {
    const raw = readFileSync(LOG_FILE, 'utf-8');
    return JSON.parse(raw) as CronLogEntry[];
  } catch {
    return [];
  }
}

function writeCronLog(log: CronLogEntry[]) {
  ensureDataDir();
  writeFileSync(LOG_FILE, JSON.stringify(log, null, 2), 'utf-8');
}

/**
 * Acquire a PID-based lock for the given user+platform.
 * Returns true if the lock was acquired (safe to proceed).
 * Returns false if another instance is already running for this user+platform.
 */
export function acquireCronLock(platform: string, userId?: string): boolean {
  ensureDataDir();
  const lockFile = join(DATA_DIR, lockFileName(platform, userId));

  if (existsSync(lockFile)) {
    try {
      const pid = parseInt(readFileSync(lockFile, 'utf-8').trim(), 10);
      if (!isNaN(pid)) {
        process.kill(pid, 0); // throws if process is dead
        return false; // process is alive — already running
      }
    } catch {
      // PID is dead or unreadable — stale lock, proceed
    }
  }

  writeFileSync(lockFile, String(process.pid), 'utf-8');
  return true;
}

/**
 * Release the PID lock for the given user+platform.
 * Call on exit (success or failure).
 */
export function releaseCronLock(platform: string, userId?: string): void {
  const lockFile = join(DATA_DIR, lockFileName(platform, userId));
  try { unlinkSync(lockFile); } catch { /* already gone */ }
}

/**
 * Call at the start of a cron run. Returns the entry id for use in cronFinish().
 */
export function cronStart(platform: string, trigger: 'auto' | 'manual' = 'auto', userId?: string): string {
  const id = `${Date.now()}-${randomBytes(3).toString('hex')}`;
  const now = new Date().toISOString();
  const key = statusKey(platform, userId);

  // Update status file
  const status = readCronStatus();
  if (!status[key]) status[key] = defaultStatus();
  status[key].running = true;
  status[key].lastStarted = now;
  status[key].lastTrigger = trigger;
  writeCronStatus(status);

  // Prepend to log
  const log = readCronLog();
  const entry: CronLogEntry = {
    id, platform, userId, trigger,
    startedAt: now, finishedAt: null,
    exitCode: null, message: '', status: 'running',
  };
  log.unshift(entry);
  if (log.length > LOG_MAX) log.length = LOG_MAX;
  writeCronLog(log);

  return id;
}

/**
 * Call at the end of a cron run (including error paths).
 */
export function cronFinish(entryId: string, platform: string, exitCode: number, message = '', userId?: string) {
  const now = new Date().toISOString();
  const key = statusKey(platform, userId);

  // Update status file
  const status = readCronStatus();
  if (!status[key]) status[key] = defaultStatus();
  status[key].running = false;
  status[key].lastFinished = now;
  status[key].lastExitCode = exitCode;
  status[key].lastMessage = message;
  writeCronStatus(status);

  // Update matching log entry
  const log = readCronLog();
  const entry = log.find(e => e.id === entryId);
  if (entry) {
    entry.finishedAt = now;
    entry.exitCode = exitCode;
    entry.message = message;
    entry.status = exitCode === 0 ? 'ok' : 'failed';
  }
  writeCronLog(log);
}
