import { existsSync } from 'fs';
import { execSync } from 'child_process';

const CANDIDATE_PATHS: Record<string, string[]> = {
  linux: [
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/snap/bin/chromium',
  ],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  ],
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ],
};

let _cached: string | undefined;

/**
 * Detect a locally installed Chromium/Chrome executable.
 * Returns undefined if none found — Playwright will use its bundled browser.
 */
export function detectChromiumPath(): string | undefined {
  if (_cached !== undefined) return _cached || undefined;

  const platform = process.platform as string;

  // Check env override first
  if (process.env.CHROMIUM_PATH) {
    if (existsSync(process.env.CHROMIUM_PATH)) {
      _cached = process.env.CHROMIUM_PATH;
      return _cached;
    }
  }

  // Try candidate paths for current platform
  const candidates = CANDIDATE_PATHS[platform] || [];
  for (const p of candidates) {
    if (existsSync(p)) {
      _cached = p;
      return _cached;
    }
  }

  // Try `which` on unix systems
  if (platform !== 'win32') {
    for (const cmd of ['chromium-browser', 'chromium', 'google-chrome-stable', 'google-chrome']) {
      try {
        const result = execSync(`which ${cmd} 2>/dev/null`, { encoding: 'utf8' }).trim();
        if (result && existsSync(result)) {
          _cached = result;
          return _cached;
        }
      } catch { /* not found */ }
    }
  }

  // Return undefined — Playwright will use its bundled Chromium
  _cached = '';
  return undefined;
}
