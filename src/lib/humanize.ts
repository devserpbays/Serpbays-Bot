/**
 * humanize.ts — Anti-detection utility for Playwright automation.
 *
 * Provides human-like delays, randomised browser fingerprints, mouse movement,
 * backoff calculation, and hard per-platform safety limits.
 */

import type { Page, BrowserContext } from 'playwright';

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

// ─── Realistic timezones (match common English-speaking user pools) ───────────
const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'Europe/London',
  'Australia/Sydney',
];

export function randomTimezone(): string {
  return pick(TIMEZONES);
}

// ─── Hardened Chromium launch args ────────────────────────────────────────────
/**
 * Returns the recommended Chromium launch args for anti-detection.
 * Removes automation flags, disables telemetry, and adds realistic Chrome hints.
 */
export function buildLaunchArgs(): string[] {
  return [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--disable-infobars',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-default-apps',
    '--disable-extensions-except',
    '--password-store=basic',
    '--use-mock-keychain',
    '--disable-background-networking',
    '--disable-sync',
    '--metrics-recording-only',
    '--disable-translate',
    '--hide-scrollbars',
    '--mute-audio',
  ];
}

// ─── Stealth page script ──────────────────────────────────────────────────────
/**
 * The JS injected into every page via addInitScript.
 * Patches common browser automation signals that platforms check for.
 */
const STEALTH_SCRIPT = `
(function () {
  // 1. Hide navigator.webdriver
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

  // 2. Fake window.chrome (absent in headless)
  if (!window.chrome) {
    Object.defineProperty(window, 'chrome', {
      value: { runtime: {}, loadTimes: function(){}, csi: function(){}, app: {} },
      writable: true, configurable: true,
    });
  }

  // 3. Override navigator.plugins with realistic values
  const fakePdf  = { name: 'PDF Viewer',   filename: 'internal-pdf-viewer', description: 'Portable Document Format', length: 1 };
  const fakeNaapi = { name: 'Native Client', filename: 'internal-nacl-plugin', description: '', length: 0 };
  Object.defineProperty(navigator, 'plugins', {
    get: () => Object.assign([fakePdf, fakeNaapi], { item: (i) => [fakePdf, fakeNaapi][i] || null, namedItem: () => null, length: 2 }),
  });

  // 4. Patch navigator.permissions to not reveal automation
  if (navigator.permissions && navigator.permissions.query) {
    const _query = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = (params) =>
      params.name === 'notifications'
        ? Promise.resolve({ state: 'default', onchange: null } as unknown as PermissionStatus)
        : _query(params);
  }

  // 5. Realistic navigator.languages
  Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });

  // 6. Subtle canvas fingerprint noise (±1 on a few pixels)
  const _toDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function (type, ...args) {
    const ctx = this.getContext('2d');
    if (ctx) {
      const d = ctx.getImageData(0, 0, this.width, this.height);
      for (let i = 0; i < 8; i++) {
        const idx = Math.floor(Math.random() * (d.data.length / 4)) * 4;
        d.data[idx] = Math.max(0, Math.min(255, d.data[idx] + (Math.random() < 0.5 ? 1 : -1)));
      }
      ctx.putImageData(d, 0, 0);
    }
    return _toDataURL.call(this, type, ...args);
  };
})();
`;

/**
 * Apply stealth patches to a Playwright BrowserContext.
 * Call this once after launchPersistentContext — it runs on every new page.
 */
export async function applyStealth(context: BrowserContext): Promise<void> {
  await context.addInitScript(STEALTH_SCRIPT);
  await context.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
  });
}

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

// ─── Warm-up schedule ─────────────────────────────────────────────────────────

/**
 * Daily post cap based on how long the account has been connected.
 * New accounts ramp up slowly to avoid triggering platform spam filters.
 *
 *   Days 1–3   → max 2 posts/day   (brand-new, very cautious)
 *   Days 4–7   → max 5 posts/day   (still warming up)
 *   Days 8–14  → max 10 posts/day  (almost warmed up)
 *   Day 15+    → null (no warm-up cap — plan limit applies)
 */
export function getWarmupLimit(connectedAt: Date | null | undefined): number | null {
  if (!connectedAt) return null;
  const daysSince = Math.floor((Date.now() - new Date(connectedAt).getTime()) / (1000 * 60 * 60 * 24));
  if (daysSince < 3)  return 2;
  if (daysSince < 7)  return 5;
  if (daysSince < 14) return 10;
  return null; // fully warmed up
}

/**
 * Returns the current warm-up stage info for display in the UI.
 */
export function getWarmupStatus(connectedAt: Date | null | undefined): {
  isWarmingUp: boolean;
  daysSince: number;
  dailyLimit: number | null;
  daysRemaining: number;
  progressPct: number;
} {
  if (!connectedAt) return { isWarmingUp: false, daysSince: 0, dailyLimit: null, daysRemaining: 0, progressPct: 100 };
  const daysSince = Math.floor((Date.now() - new Date(connectedAt).getTime()) / (1000 * 60 * 60 * 24));
  const dailyLimit = getWarmupLimit(connectedAt);
  const isWarmingUp = dailyLimit !== null;
  const daysRemaining = isWarmingUp ? Math.max(0, 14 - daysSince) : 0;
  const progressPct = Math.min(100, Math.round((daysSince / 14) * 100));
  return { isWarmingUp, daysSince, dailyLimit, daysRemaining, progressPct };
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
