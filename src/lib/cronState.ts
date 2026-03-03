/**
 * File-based cron state tracker.
 *
 * Two files in <cwd>/data/:
 *   cron-status.json  — current per-platform status (in-flight + last run info)
 *   cron-run-log.json — persisted ordered history (newest first, capped at 200)
 *
 * Cron scripts call cronStart() at entry and cronFinish() on exit.
 * API routes read with readCronStatus() / readCronLog().
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';

const DATA_DIR = join(process.cwd(), 'data');
const STATUS_FILE = join(DATA_DIR, 'cron-status.json');
const LOG_FILE = join(DATA_DIR, 'cron-run-log.json');
const LOG_MAX = 200;

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
  [platform: string]: CronPlatformStatus;
}

export interface CronLogEntry {
  id: string;
  platform: string;
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

export function readCronStatus(): CronStatusMap {
  try {
    const raw = readFileSync(STATUS_FILE, 'utf-8');
    return JSON.parse(raw) as CronStatusMap;
  } catch {
    const status: CronStatusMap = {};
    for (const p of ALL_PLATFORMS) status[p] = defaultStatus();
    return status;
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
 * Call at the start of a cron run. Returns the entry id for use in cronFinish().
 */
export function cronStart(platform: string, trigger: 'auto' | 'manual' = 'auto'): string {
  const id = `${Date.now()}-${randomBytes(3).toString('hex')}`;
  const now = new Date().toISOString();

  // Update status file
  const status = readCronStatus();
  if (!status[platform]) status[platform] = defaultStatus();
  status[platform].running = true;
  status[platform].lastStarted = now;
  status[platform].lastTrigger = trigger;
  writeCronStatus(status);

  // Prepend to log
  const log = readCronLog();
  const entry: CronLogEntry = {
    id, platform, trigger,
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
export function cronFinish(entryId: string, platform: string, exitCode: number, message = '') {
  const now = new Date().toISOString();

  // Update status file
  const status = readCronStatus();
  if (!status[platform]) status[platform] = defaultStatus();
  status[platform].running = false;
  status[platform].lastFinished = now;
  status[platform].lastExitCode = exitCode;
  status[platform].lastMessage = message;
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
