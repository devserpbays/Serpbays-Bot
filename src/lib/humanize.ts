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
 * Builds the JS init script for a specific viewport.
 * Injected into every page via context.addInitScript — runs before any page JS.
 * Patches all common headless/automation signals that Twitter, Meta, etc. check for.
 */
function buildStealthScript(vw: number, vh: number): string {
  // Bake realistic values at Node time so they're stable per session
  const downlink = 8 + Math.floor(Math.random() * 42);  // 8–50 Mbps
  const rtt      = 20 + Math.floor(Math.random() * 55);  // 20–75 ms
  return `
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
  const fakePdf   = { name: 'PDF Viewer',   filename: 'internal-pdf-viewer', description: 'Portable Document Format', length: 1 };
  const fakeNaapi = { name: 'Native Client', filename: 'internal-nacl-plugin', description: '', length: 0 };
  Object.defineProperty(navigator, 'plugins', {
    get: () => Object.assign([fakePdf, fakeNaapi], { item: (i) => [fakePdf, fakeNaapi][i] || null, namedItem: () => null, length: 2 }),
  });

  // 4. Patch navigator.permissions to not reveal automation
  if (navigator.permissions && navigator.permissions.query) {
    const _q = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = (p) =>
      p.name === 'notifications'
        ? Promise.resolve({ state: 'default', onchange: null })
        : _q(p);
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

  // 7. Realistic hardware fingerprints
  const hwConcurrency = [4, 6, 8, 10, 12, 16][Math.floor(Math.random() * 6)];
  Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => hwConcurrency });
  const deviceMem = [4, 8, 8, 16][Math.floor(Math.random() * 4)];
  Object.defineProperty(navigator, 'deviceMemory', { get: () => deviceMem });

  // 8. WebGL — headless exposes SwiftShader which is a clear bot signal
  const _gpSel = [
    ['UNMASKED_VENDOR_WEBGL',   'Google Inc. (Intel)'],
    ['UNMASKED_RENDERER_WEBGL', 'ANGLE (Intel, Intel(R) UHD Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)'],
  ];
  function patchWebGL(ctx) {
    if (!ctx) return;
    const _gp = ctx.getParameter.bind(ctx);
    ctx.constructor.prototype.getParameter = function(p) {
      if (p === 37445) return 'Google Inc. (Intel)';
      if (p === 37446) return 'ANGLE (Intel, Intel(R) UHD Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)';
      return _gp(p);
    };
  }
  try { patchWebGL(document.createElement('canvas').getContext('webgl')); } catch(_) {}
  try { patchWebGL(document.createElement('canvas').getContext('webgl2')); } catch(_) {}

  // 9. AudioContext fingerprint noise
  try {
    const _createOsc = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function() {
      const o = _createOsc.call(this);
      const _c = o.connect.bind(o);
      o.connect = function(d, ...a) { try { _c(d, ...a); } catch(_) {} return d; };
      return o;
    };
  } catch(_) {}

  // 10. Notification.permission — headless returns 'denied', real users 'default'
  try { Object.defineProperty(Notification, 'permission', { get: () => 'default' }); } catch(_) {}

  // 11. screen dimensions — must match the viewport passed at launch
  try {
    Object.defineProperty(screen, 'width',       { get: () => ${vw} });
    Object.defineProperty(screen, 'height',      { get: () => ${vh} });
    Object.defineProperty(screen, 'availWidth',  { get: () => ${vw} });
    Object.defineProperty(screen, 'availHeight', { get: () => ${vh - 40} });
    Object.defineProperty(screen, 'colorDepth',  { get: () => 24 });
    Object.defineProperty(screen, 'pixelDepth',  { get: () => 24 });
  } catch(_) {}

  // 12. window.outerWidth / outerHeight — headless returns 0
  try {
    Object.defineProperty(window, 'outerWidth',  { get: () => ${vw} });
    Object.defineProperty(window, 'outerHeight', { get: () => ${vh + 85} }); // + browser chrome UI
  } catch(_) {}

  // 13. navigator.connection (NetworkInformation API — missing in headless)
  try {
    const conn = { effectiveType: '4g', downlink: ${downlink}, rtt: ${rtt}, saveData: false,
                   type: 'wifi', addEventListener: () => {}, removeEventListener: () => {} };
    Object.defineProperty(navigator, 'connection',      { get: () => conn });
    Object.defineProperty(navigator, 'mozConnection',   { get: () => conn });
    Object.defineProperty(navigator, 'webkitConnection',{ get: () => conn });
  } catch(_) {}

  // 14. navigator.maxTouchPoints (0 for desktop)
  try { Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 }); } catch(_) {}

  // 15. Object.keys(navigator) — some fingerprinters check for missing keys
  // Ensure getBattery exists (returns a fake promise)
  if (!navigator.getBattery) {
    try {
      navigator.getBattery = () => Promise.resolve({
        charging: true, chargingTime: 0, dischargingTime: Infinity, level: 1,
        addEventListener: () => {}, removeEventListener: () => {},
      });
    } catch(_) {}
  }
})();
`;
}

/**
 * Apply stealth patches to a Playwright BrowserContext.
 * Call once after launchPersistentContext — runs on every new page.
 * Pass the same viewport and UA that were used at launch for consistent fingerprinting.
 */
export async function applyStealth(
  context: BrowserContext,
  options?: { viewport?: { width: number; height: number }; ua?: string },
): Promise<void> {
  const vp = options?.viewport ?? { width: 1920, height: 1080 };
  const ua = options?.ua ?? '';

  // Extract Chrome version from UA for Sec-CH-UA headers
  const chromeVer = ua.match(/Chrome\/(\d+)/)?.[1] ?? '134';
  const isMac = ua.includes('Macintosh');
  const platform = isMac ? '"macOS"' : '"Windows"';
  const platformVer = isMac ? '"14.7.4"' : '"10.0.0"';

  await context.addInitScript(buildStealthScript(vp.width, vp.height));
  await context.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    // Client Hints — real Chrome sends all these; missing ones are a detection signal
    'Sec-CH-UA': `"Not(A:Brand";v="99", "Google Chrome";v="${chromeVer}", "Chromium";v="${chromeVer}"`,
    'Sec-CH-UA-Mobile': '?0',
    'Sec-CH-UA-Platform': platform,
    'Sec-CH-UA-Platform-Version': platformVer,
    'Sec-CH-UA-Full-Version-List': `"Not(A:Brand";v="99.0.0.0", "Google Chrome";v="${chromeVer}.0.0.0", "Chromium";v="${chromeVer}.0.0.0"`,
    'Sec-CH-UA-Arch': '"x86"',
    'Sec-CH-UA-Bitness': '"64"',
    'Sec-CH-UA-Model': '""',
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
  // Windows — Chrome 130–134 (current stable range as of early 2025)
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
  // macOS
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
  // Linux
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
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
 * Move mouse along a cubic Bézier curve to (toX, toY).
 * Mimics real human mouse trajectories — avoids straight-line movement that
 * ML-based bot detectors flag as synthetic.
 */
export async function bezierMouseMove(page: Page, toX: number, toY: number): Promise<void> {
  const vp = page.viewportSize() ?? { width: 1280, height: 800 };
  // Random start point near the viewport center (estimated current position)
  const startX = vp.width  / 2 + randInt(-250, 250);
  const startY = vp.height / 2 + randInt(-200, 200);

  // Two control points with random offsets — creates a natural curve
  const cp1x = startX + (toX - startX) * 0.25 + randInt(-90, 90);
  const cp1y = startY + (toY - startY) * 0.25 + randInt(-70, 70);
  const cp2x = startX + (toX - startX) * 0.75 + randInt(-90, 90);
  const cp2y = startY + (toY - startY) * 0.75 + randInt(-70, 70);

  const steps = randInt(18, 40);
  for (let i = 0; i <= steps; i++) {
    const t  = i / steps;
    const t1 = 1 - t;
    // Cubic Bézier formula
    const x = t1**3 * startX + 3*t1**2*t * cp1x + 3*t1*t**2 * cp2x + t**3 * toX;
    const y = t1**3 * startY + 3*t1**2*t * cp1y + 3*t1*t**2 * cp2y + t**3 * toY;
    await page.mouse.move(Math.round(x), Math.round(y));
    // Variable speed — faster in the middle of the move, slower near target
    const speedFactor = 1 + Math.sin(Math.PI * t) * 0.8;
    await new Promise(r => setTimeout(r, Math.round(randInt(8, 20) / speedFactor)));
  }
}

/**
 * Human-like click: move mouse via Bézier curve to element, micro-pause, click.
 */
export async function humanClick(page: Page, selector: string): Promise<void> {
  const el = await page.$(selector);
  if (!el) throw new Error(`humanClick: element not found — ${selector}`);

  const box = await el.boundingBox();
  if (box) {
    const x = box.x + box.width  / 2 + randInt(-4, 4);
    const y = box.y + box.height / 2 + randInt(-3, 3);
    await bezierMouseMove(page, x, y);
    await randomDelay(60, 220);
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
 * Humanised typing with realistic cadence:
 * - Variable speed (faster in word bursts, pauses at spaces/punctuation)
 * - ~4% typo rate: types wrong char then corrects with Backspace
 * - Occasional "thinking" pause mid-text
 */
export async function humanType(page: Page, selector: string, text: string): Promise<void> {
  await page.click(selector);
  await randomDelay(200, 600);

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    // Occasional typo — mistype then backspace-correct
    if (Math.random() < 0.04 && i < text.length - 2) {
      const wrong = String.fromCharCode(char.charCodeAt(0) + (Math.random() < 0.5 ? 1 : -1));
      if (wrong !== char && /\w/.test(wrong)) {
        await page.keyboard.type(wrong);
        await new Promise(r => setTimeout(r, randInt(90, 220)));
        await page.keyboard.press('Backspace');
        await new Promise(r => setTimeout(r, randInt(80, 180)));
      }
    }

    await page.keyboard.type(char);

    // Speed: fast in bursts, slower after spaces/punctuation, rare thinking pauses
    const isPunct = /[\s.,!?;:]/.test(char);
    const base = isPunct ? randInt(80, 220) : randInt(30, 100);
    const think = Math.random() < 0.04 ? randInt(500, 1400) : 0; // 4% thinking pause
    await new Promise(r => setTimeout(r, base + think));
  }
}

/**
 * Randomly inject a long "distraction" pause (tab switch simulation).
 * Call this before a posting action — fires ~12% of the time.
 * Spreads posting times and breaks mechanical regularity.
 */
export async function maybeDistractionPause(probability = 0.12): Promise<void> {
  if (Math.random() > probability) return;
  const ms = randInt(90_000, 480_000); // 1.5 – 8 minutes
  console.log(`[humanize] Distraction pause: ${Math.round(ms / 60000)}m (simulating tab switch)`);
  await new Promise(r => setTimeout(r, ms));
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

/**
 * Parse a proxy URL into the format Playwright's launchPersistentContext expects.
 * Supports: http://user:pass@host:port  socks5://user:pass@host:port  http://host:port
 * Returns undefined if proxyUrl is empty — browser launches without a proxy.
 */
export function parseProxyConfig(proxyUrl: string | undefined | null):
  { server: string; username?: string; password?: string } | undefined
{
  if (!proxyUrl || !proxyUrl.trim()) return undefined;
  try {
    const url = new URL(proxyUrl.trim());
    const server = `${url.protocol}//${url.hostname}:${url.port}`;
    const config: { server: string; username?: string; password?: string } = { server };
    if (url.username) config.username = decodeURIComponent(url.username);
    if (url.password) config.password = decodeURIComponent(url.password);
    return config;
  } catch {
    // Malformed URL — skip proxy
    console.warn('[proxy] Invalid proxy URL, skipping:', proxyUrl);
    return undefined;
  }
}
