import { join } from 'path';
import { tmpdir } from 'os';
import type { Page } from 'playwright';

/**
 * Take a debug screenshot with a unique filename.
 * Saves to OS temp dir with platform, action, and timestamp.
 */
export async function debugScreenshot(
  page: Page,
  platform: string,
  action: string,
): Promise<void> {
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${platform}-${action}-${ts}.png`;
    const filepath = join(tmpdir(), filename);
    await page.screenshot({ path: filepath, fullPage: false });
    console.log(`[debug] Screenshot saved: ${filepath}`);
  } catch {
    // Best effort — don't fail the caller
  }
}
