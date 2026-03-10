/**
 * File-based browser semaphore — limits concurrent Chromium instances
 * across all child processes to prevent OOM on limited servers.
 *
 * Works across separate Node.js processes because it uses the filesystem.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync, statSync } from 'fs';
import { join } from 'path';

const SEMAPHORE_DIR = join(process.cwd(), 'data', 'browser-slots');
const MAX_BROWSERS = parseInt(process.env.MAX_BROWSER_CONCURRENCY || '3', 10);
const SLOT_TTL_MS = 10 * 60 * 1000; // 10 min — auto-expire stale slots

let _mySlotFile: string | null = null;

function ensureDir() {
  mkdirSync(SEMAPHORE_DIR, { recursive: true });
}

function cleanStaleSlots() {
  try {
    const files = readdirSync(SEMAPHORE_DIR);
    const now = Date.now();
    for (const f of files) {
      const fullPath = join(SEMAPHORE_DIR, f);
      try {
        const stat = statSync(fullPath);
        if (now - stat.mtimeMs > SLOT_TTL_MS) {
          unlinkSync(fullPath);
        }
      } catch {}
    }
  } catch {}
}

function activeSlotCount(): number {
  try {
    return readdirSync(SEMAPHORE_DIR).filter(f => f.endsWith('.slot')).length;
  } catch {
    return 0;
  }
}

/**
 * Try to acquire a browser slot. Returns true if acquired, false if at capacity.
 * Non-blocking — caller should skip or retry later.
 */
export function acquireBrowserSlot(label: string = 'unknown'): boolean {
  ensureDir();
  cleanStaleSlots();

  if (activeSlotCount() >= MAX_BROWSERS) {
    return false;
  }

  const slotFile = `${Date.now()}-${process.pid}-${label}.slot`;
  const fullPath = join(SEMAPHORE_DIR, slotFile);
  try {
    writeFileSync(fullPath, JSON.stringify({ pid: process.pid, label, ts: new Date().toISOString() }));
    _mySlotFile = fullPath;
    return true;
  } catch {
    return false;
  }
}

/**
 * Wait for a browser slot with timeout. Polls every 2s.
 */
export async function waitForBrowserSlot(label: string, timeoutMs: number = 60000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (acquireBrowserSlot(label)) return true;
    await new Promise(r => setTimeout(r, 2000));
  }
  return false;
}

/**
 * Release the browser slot held by this process.
 */
export function releaseBrowserSlot(): void {
  if (_mySlotFile) {
    try { unlinkSync(_mySlotFile); } catch {}
    _mySlotFile = null;
  }
}

/**
 * Get current usage stats.
 */
export function getBrowserSlotStats(): { active: number; max: number } {
  ensureDir();
  cleanStaleSlots();
  return { active: activeSlotCount(), max: MAX_BROWSERS };
}
