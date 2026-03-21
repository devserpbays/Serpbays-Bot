/**
 * humanize.ts — Anti-detection utility for Playwright automation.
 *
 * Provides human-like delays, randomised browser fingerprints, mouse movement,
 * backoff calculation, and hard per-platform safety limits.
 */

import type { Page } from 'playwright';

// ─── Platform hard daily safety limits ────────────────────────────────────────
// These are absolute maximums — no plan or user setting can exceed them.
// Values are intentionally conservative to avoid platform bans.
export const PLATFORM_SAFE_LIMITS: Record<string, number> = {
  twitter:   20,
  reddit:    10,
  facebook:  15,
  quora:      8,
  youtube:   25,
  pinterest: 20,
};

// ─── Realistic browser fingerprint pools ──────────────────────────────────────
const VIEWPORTS = [
  { width: 1366, height: 768  },
  { width: 1440, height: 900  },
  { width: 1920, height: 1080 },
  { width: 1280, height: 800  },
  { width: 1536, height: 864  },
];

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
];

// ─── Internal helpers ─────────────────────────────────────────────────────────
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ─── Exported primitives ──────────────────────────────────────────────────────

/** Sleep for a random duration between min and max milliseconds. */
export function randomDelay(minMs: number, maxMs: number): Promise<void> {
  return new Promise(r => setTimeout(r, randInt(minMs, maxMs)));
}

/** Pick a random viewport from the realistic pool. */
export function randomViewport(): { width: number; height: number } {
  return pick(VIEWPORTS);
}

/** Pick a random user-agent from the realistic pool. */
export function randomUserAgent(): string {
  return pick(USER_AGENTS);
}

/**
 * Human-like click: move the mouse near the element with slight jitter,
 * pause briefly, then click.
 */
export async function humanClick(page: Page, selector: string): Promise<void> {
  const el = await page.$(selector);
  if (!el) throw new Error(`humanClick: element not found — ${selector}`);

  const box = await el.boundingBox();
  if (box) {
    const x = box.x + box.width  / 2 + randInt(-4, 4);
    const y = box.y + box.height / 2 + randInt(-3, 3);
    await page.mouse.move(x, y, { steps: randInt(8, 18) });
    await randomDelay(80, 350);
  }
  await el.click();
}

/**
 * Simulate a human reading the page before acting:
 * scroll down slightly, pause, scroll back a bit.
 */
export async function readingPause(page: Page): Promise<void> {
  const scrollDown = randInt(100, 420);
  await page.evaluate((amt: number) => window.scrollBy(0, amt), scrollDown);
  await randomDelay(1200, 3800);
  await page.evaluate((amt: number) => window.scrollBy(0, -Math.floor(amt / 3)), scrollDown);
  await randomDelay(400, 1100);
}

/**
 * Humanised typing: type each character with a small random delay between
 * keystrokes to mimic natural typing speed.
 */
export async function humanType(page: Page, selector: string, text: string): Promise<void> {
  await page.click(selector);
  await randomDelay(200, 600);
  for (const char of text) {
    await page.keyboard.type(char);
    await randomDelay(28, 110);
  }
}

// ─── Backoff logic ────────────────────────────────────────────────────────────

/**
 * Return the backoff duration in ms for the given cumulative error count.
 *   1 error  → 1 hour
 *   2 errors → 4 hours
 *   3+ errors → 24 hours
 */
export function getBackoffMs(errorCount: number): number {
  if (errorCount <= 0) return 0;
  if (errorCount === 1) return 60 * 60 * 1000;        // 1 h
  if (errorCount === 2) return 4 * 60 * 60 * 1000;    // 4 h
  return 24 * 60 * 60 * 1000;                          // 24 h
}

/**
 * Check whether an account is currently inside a backoff window.
 * Returns { blocked: true, retryAt } when blocked, { blocked: false } when clear.
 */
export function checkBackoff(
  backoffUntil: Date | null | undefined
): { blocked: true; retryAt: Date } | { blocked: false } {
  if (!backoffUntil) return { blocked: false };
  if (backoffUntil > new Date()) return { blocked: true, retryAt: backoffUntil };
  return { blocked: false };
}
