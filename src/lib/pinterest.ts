/**
 * Pinterest Browser Automation via Playwright + Chromium
 *
 * Uses a persistent browser context so cookies survive between runs.
 * Profile data stored at: /var/www/ai-bot/bot-serp/.pinterest-profile/
 */

import { chromium, type BrowserContext, type Page } from 'playwright';
import { join } from 'path';
import { unlinkSync, existsSync, readFileSync } from 'fs';
import { isValidComment } from './validateComment';
import { debugScreenshot } from './debugScreenshot';
import { buildLaunchArgs, randomTimezone, applyStealth, randomUserAgent, randomViewport } from './humanize';

const NAVIGATION_TIMEOUT = 30000;
const SLOW_WAIT = 4000;

interface PinterestPin {
  url: string;
  author: string;
  content: string;
  platform: 'pinterest';
}

const _contexts = new Map<string, BrowserContext>();
const _pages = new Map<string, Page>();

// --- Launch or reuse persistent browser context ---
async function getPage(profileDir: string): Promise<Page> {
  const existingPage = _pages.get(profileDir);
  if (existingPage && !existingPage.isClosed()) return existingPage;

  // Remove stale browser lock from previous crash
  try { unlinkSync(join(profileDir, 'SingletonLock')); } catch {}

  const ua = randomUserAgent();
  const vp = randomViewport();
  const tz = process.env.ACCOUNT_TIMEZONE || randomTimezone();

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    args: buildLaunchArgs(),
    userAgent: ua,
    viewport: vp,
    locale: 'en-US',
    timezoneId: tz,
  });

  await applyStealth(context, { viewport: vp, ua });

  // Inject cookies from cookies.json if available
  const cookiesJsonPath = join(profileDir, 'cookies.json');
  if (existsSync(cookiesJsonPath)) {
    try {
      const savedCookies = JSON.parse(readFileSync(cookiesJsonPath, 'utf8'));
      if (Array.isArray(savedCookies) && savedCookies.length > 0) {
        await context.addCookies(savedCookies);
      }
    } catch (e) {
      console.error('Failed to load cookies.json:', e);
    }
  }

  _contexts.set(profileDir, context);
  const page = context.pages()[0] || (await context.newPage());
  page.setDefaultTimeout(NAVIGATION_TIMEOUT);
  _pages.set(profileDir, page);
  return page;
}

// --- Cleanup ---
export async function closeBrowser(profileDir: string): Promise<void> {
  const context = _contexts.get(profileDir);
  if (context) {
    await context.close().catch(() => {});
    _contexts.delete(profileDir);
    _pages.delete(profileDir);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// --- Check if logged in to Pinterest ---
export async function ensurePinterestLoggedIn(profileDir: string): Promise<boolean> {
  try {
    const page = await getPage(profileDir);
    await page.goto('https://www.pinterest.com', { waitUntil: 'domcontentloaded' });
    await sleep(SLOW_WAIT);

    const url = page.url();
    if (url.includes('/login') || url.includes('/auth/')) {
      console.error('Not logged in to Pinterest — redirected to login page.');
      return false;
    }

    // Check for logged-in avatar indicator
    const loggedIn = await page
      .locator('[data-test-id="header-avatar"], [data-test-id="header-profile-link"]')
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (loggedIn) return true;

    // Check for login button (logged-out indicator)
    const hasLoginBtn = await page
      .locator('[data-test-id="login-button"], a[href*="/login/"]')
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    if (hasLoginBtn) {
      console.error('Not logged in to Pinterest — login button visible.');
      return false;
    }

    // Fallback body check
    const bodyText = await page.textContent('body').catch(() => '');
    const looksLoggedIn = bodyText && bodyText.length > 500 && !bodyText.includes('Log in');
    if (looksLoggedIn) return true;

    console.warn('Pinterest login state uncertain');
    return false;
  } catch (err) {
    console.error('Failed to check Pinterest login:', (err as Error).message);
    return false;
  }
}

// --- Scrape profile identity of the logged-in user ---
export async function scrapeProfileIdentity(profileDir: string): Promise<{ displayName: string; username: string; accountId: string }> {
  try {
    const page = await getPage(profileDir);

    const info = await page.evaluate(() => {
      let username = '';
      let displayName = '';

      // Try to get username from profile link
      const avatarLink = document.querySelector('[data-test-id="header-avatar"]') as HTMLAnchorElement | null;
      if (avatarLink) {
        const href = avatarLink.getAttribute('href') || '';
        const m = href.match(/\/([^/]+)\/?$/);
        if (m && m[1] && m[1] !== 'settings') username = m[1];
      }

      // Try profile links
      if (!username) {
        const profileLinks = document.querySelectorAll('a[href*="/"]');
        for (const link of profileLinks) {
          const href = link.getAttribute('href') || '';
          if (href.match(/^\/[a-zA-Z0-9_-]+\/$/) && !href.includes('/settings') && !href.includes('/login')) {
            username = href.replace(/\//g, '');
            break;
          }
        }
      }

      return { username, displayName };
    }).catch(() => ({ username: '', displayName: '' }));

    const username = info.username || '';
    const accountId = username ? `pt_${username}` : `pt_${Date.now()}`;
    return { displayName: info.displayName || username, username, accountId };
  } catch {
    return { displayName: '', username: '', accountId: '' };
  }
}

// --- Scrape Pinterest pins matching keywords ---
export async function scrapePinterestPins(keywords: string[], profileDir: string): Promise<PinterestPin[]> {
  const pins: PinterestPin[] = [];

  for (const keyword of keywords) {
    try {
      const page = await getPage(profileDir);
      const searchUrl = `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(keyword)}&rs=typed`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
      await sleep(SLOW_WAIT);

      // Scroll to load more pins
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.scrollBy({ top: 1000, behavior: 'smooth' }));
        await sleep(2000);
      }

      // Extract pin elements with better content and author extraction
      const pinData = await page.evaluate((kw: string) => {
        const results: { url: string; description: string; creator: string; pinId: string }[] = [];
        const kwLower = kw.toLowerCase();

        const pinEls = document.querySelectorAll('[data-test-id="pin"], [data-grid-item="true"], div[role="listitem"]');

        for (const pin of pinEls) {
          const linkEl = pin.querySelector('a[href*="/pin/"]') as HTMLAnchorElement | null;
          if (!linkEl) continue;

          const href = linkEl.getAttribute('href') || '';
          const pinIdMatch = href.match(/\/pin\/(\d+)/);
          if (!pinIdMatch) continue;

          const pinId = pinIdMatch[1];

          // Extract description from multiple sources
          const imgAlt = pin.querySelector('img')?.getAttribute('alt') || '';
          const descEl = pin.querySelector('[data-test-id="pin-description"], div[class*="description"], [data-test-id="truncated-description"]');
          const titleEl = pin.querySelector('[data-test-id="pin-title"], h3, [data-test-id="pinTitle"]');
          const ariaLabel = linkEl.getAttribute('aria-label') || '';

          // Combine all text sources for richer content
          const texts = [
            titleEl?.textContent?.trim(),
            descEl?.textContent?.trim(),
            ariaLabel.trim(),
            imgAlt.trim(),
          ].filter(Boolean);
          const description = [...new Set(texts)].join(' — ');

          if (description.length < 10) continue;

          // Extract creator/pinner name
          const creatorEl = pin.querySelector('[data-test-id="pinner-name"], [data-test-id="creator-name"], a[href*="/"]:not([href*="/pin/"])');
          let creator = creatorEl?.textContent?.trim() || '';
          // Clean up — sometimes includes "Saved by" prefix
          creator = creator.replace(/^(saved by|pinned by|by)\s*/i, '').trim();

          // Relevance filter: description must contain at least one keyword word
          const kwWords = kwLower.split(/\s+/).filter(w => w.length > 2);
          const descLower = description.toLowerCase();
          const isRelevant = kwWords.some(w => descLower.includes(w));
          if (!isRelevant) continue;

          results.push({
            url: `https://www.pinterest.com/pin/${pinId}/`,
            description,
            creator,
            pinId,
          });
        }
        return results;
      }, keyword).catch(() => [] as { url: string; description: string; creator: string; pinId: string }[]);

      for (const p of pinData) {
        pins.push({
          url: p.url,
          author: p.creator || 'pinterest_user',
          content: `${p.description.slice(0, 2000)} — found via Pinterest search for '${keyword}'`,
          platform: 'pinterest',
        });
      }

      await sleep(2000);
    } catch (err) {
      console.error(`Failed to search Pinterest for "${keyword}":`, (err as Error).message);
    }
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  return pins.filter((p) => {
    if (seen.has(p.url)) return false;
    seen.add(p.url);
    return true;
  });
}

// --- Save (like) a Pinterest pin ---
export async function savePinterestPin(
  pinUrl: string,
  profileDir: string
): Promise<{ success: boolean }> {
  try {
    const page = await getPage(profileDir);
    // Normalize regional Pinterest domains
    const normalizedUrl = pinUrl.replace(/^https?:\/\/(in|uk|au|de|fr|br|mx|jp|kr)\.pinterest\./, 'https://www.pinterest.');
    await page.goto(normalizedUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000 + Math.random() * 2000);

    // Find the Save button on the pin detail page
    const saveSelectors = [
      'button[aria-label="Save"]',
      'button[aria-label="save"]',
      'div[data-test-id="pin-action-button"] button',
      'button:has-text("Save")',
    ];

    for (const sel of saveSelectors) {
      try {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
          // Check if already saved
          const text = await btn.textContent().catch(() => '') || '';
          const label = await btn.getAttribute('aria-label').catch(() => '') || '';
          if (text.toLowerCase().includes('saved') || label.toLowerCase().includes('saved')) {
            console.log('[pinterest] Pin already saved');
            return { success: true };
          }

          // Human-like: move mouse, pause, native click
          const box = await btn.boundingBox();
          if (box) {
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
            await sleep(300 + Math.random() * 500);
            await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
          } else {
            await btn.click();
          }
          await sleep(2000 + Math.random() * 1500);

          // May show a board picker — pick the first board or dismiss
          const boardBtn = page.locator('[data-test-id="board-row"], [data-test-id="boardPickerSaveButton"], button:has-text("Save")').first();
          if (await boardBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            const bbBox = await boardBtn.boundingBox();
            if (bbBox) await page.mouse.click(bbBox.x + bbBox.width / 2, bbBox.y + bbBox.height / 2);
            else await boardBtn.click().catch(() => {});
            await sleep(1500);
          }

          console.log(`[pinterest] Saved pin: ${pinUrl.slice(0, 60)}`);
          return { success: true };
        }
      } catch { /* try next selector */ }
    }

    console.warn('[pinterest] Save button not found on:', pinUrl);
    return { success: false };
  } catch (err) {
    console.error('[pinterest] savePinterestPin error:', (err as Error).message);
    return { success: false };
  }
}

// --- Like (heart) a Pinterest pin ---
export async function likePinterestPin(
  pinUrl: string,
  profileDir: string
): Promise<{ success: boolean }> {
  try {
    const page = await getPage(profileDir);
    const normalizedUrl = pinUrl.replace(/^https?:\/\/(in|uk|au|de|fr|br|mx|jp|kr)\.pinterest\./, 'https://www.pinterest.');
    await page.goto(normalizedUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000 + Math.random() * 2000);

    // Find the Heart/Like button — Pinterest uses various selectors
    const heartPositions = await page.evaluate(() => {
      const positions: { x: number; y: number }[] = [];
      const allEls = document.querySelectorAll('button, [role="button"], div[data-test-id]');
      for (const el of allEls) {
        const label = el.getAttribute('aria-label') || '';
        const testId = el.getAttribute('data-test-id') || '';

        // Match heart/like/reaction button
        if (
          label.toLowerCase().includes('react') ||
          label.toLowerCase().includes('like') ||
          label.toLowerCase().includes('heart') ||
          label.toLowerCase().includes('love') ||
          testId.includes('react') ||
          testId.includes('heart')
        ) {
          // Skip if already liked
          const pressed = el.getAttribute('aria-pressed');
          if (pressed === 'true') continue;

          const rect = (el as HTMLElement).getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0 && rect.top > 0 && rect.top < window.innerHeight) {
            positions.push({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
          }
        }
      }
      return positions;
    }).catch(() => []);

    if (heartPositions.length > 0) {
      const pos = heartPositions[0];
      await page.mouse.move(pos.x, pos.y, { steps: 8 });
      await sleep(300 + Math.random() * 400);
      await page.mouse.click(pos.x, pos.y);
      await sleep(1500 + Math.random() * 1000);
      console.log(`[pinterest] Liked pin: ${pinUrl.slice(0, 60)}`);
      return { success: true };
    }

    // Fallback: try Playwright selectors
    const fallbackSelectors = [
      'button[aria-label*="react" i]',
      'button[aria-label*="like" i]',
      '[data-test-id*="react"]',
      '[data-test-id*="heart"]',
    ];
    for (const sel of fallbackSelectors) {
      try {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
          const pressed = await btn.getAttribute('aria-pressed').catch(() => null);
          if (pressed === 'true') {
            console.log('[pinterest] Pin already liked');
            return { success: true };
          }
          const box = await btn.boundingBox();
          if (box) {
            const cx = box.x + box.width / 2;
            const cy = box.y + box.height / 2;
            await page.mouse.move(cx, cy, { steps: 6 });
            await sleep(200 + Math.random() * 300);
            await page.mouse.click(cx, cy);
          } else {
            await btn.click();
          }
          await sleep(1500 + Math.random() * 1000);
          // Verify the like registered
          const afterPressed = await btn.getAttribute('aria-pressed').catch(() => null);
          if (afterPressed === 'true') {
            console.log(`[pinterest] Liked pin (fallback verified): ${pinUrl.slice(0, 60)}`);
            return { success: true };
          }
          console.warn(`[pinterest] Fallback like click did not register for: ${pinUrl.slice(0, 60)}`);
          return { success: false };
        }
      } catch { /* try next */ }
    }

    console.warn('[pinterest] Heart/Like button not found on:', pinUrl);
    return { success: false };
  } catch (err) {
    console.error('[pinterest] likePinterestPin error:', (err as Error).message);
    return { success: false };
  }
}

// --- Post a comment on a Pinterest pin ---
export async function postPinterestComment(pinUrl: string, comment: string, profileDir: string): Promise<{ success: boolean; error?: string }> {
  if (!isValidComment(comment)) {
    console.error('Invalid comment text (error/code detected), refusing to post:', comment.slice(0, 100));
    return { success: false, error: 'Invalid comment text detected (contains code/error patterns)' };
  }

  try {
    const page = await getPage(profileDir);

    // Normalize ALL regional Pinterest subdomains (in., uk., au., de., fr., etc.) to www
    const normalizedUrl = pinUrl.replace(/^https?:\/\/(?:[a-z]{2,5}\.)?pinterest\.[a-z.]+\//, 'https://www.pinterest.com/');

    // Use 'load' so the SPA fully renders the pin detail before we interact
    await page.goto(normalizedUrl, { waitUntil: 'load', timeout: 35000 }).catch(() =>
      page.goto(normalizedUrl, { waitUntil: 'domcontentloaded', timeout: 20000 })
    );
    await sleep(5000); // Let Pinterest SPA render the pin detail modal

    // Check if redirected to login
    const curUrl = page.url();
    if (curUrl.includes('/login') || curUrl.includes('/auth/')) {
      return { success: false, error: 'Pinterest session expired — re-upload cookies from the Accounts page' };
    }

    // Pinterest renders pin detail as a modal overlay on the feed.
    // DO NOT use mouse.wheel — it scrolls the background feed and collapses the modal.
    // Instead, scroll INSIDE the right-side detail panel using JavaScript.
    await page.evaluate(() => {
      // The right panel of the pin detail contains description + comments
      // Pinterest uses various container structures — try multiple selectors
      const panelSelectors = [
        '[data-test-id="pin-closeup-container"]',
        '[data-test-id="closeup-description"]',
        'div[class*="closeup"]',
        // Generic: find the tallest scrollable div that isn't the body
        ...Array.from(document.querySelectorAll('div')).filter(d => {
          const s = window.getComputedStyle(d);
          return (s.overflowY === 'auto' || s.overflowY === 'scroll') && d.scrollHeight > d.clientHeight + 100;
        }).map(() => ''),
      ].filter(Boolean);

      for (const sel of panelSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          el.scrollTop = el.scrollHeight;
          return;
        }
      }

      // Fallback: find the tallest scrollable div and scroll it
      let tallest: Element | null = null;
      let maxScroll = 0;
      document.querySelectorAll('div').forEach(d => {
        const scrollable = d.scrollHeight - d.clientHeight;
        if (scrollable > maxScroll) {
          const style = window.getComputedStyle(d);
          if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
            maxScroll = scrollable;
            tallest = d;
          }
        }
      });
      if (tallest) (tallest as HTMLElement).scrollTop = (tallest as HTMLElement).scrollHeight;
    }).catch(() => {});
    await sleep(2500);

    // Comment box selectors — ordered from most to least specific
    const commentBoxSelectors = [
      '[data-test-id="comment-input"]',
      'input[placeholder*="Add a comment" i]',
      'input[placeholder*="comment" i]',
      'textarea[placeholder*="comment" i]',
      '[data-test-id="inline-comment-composer-container"] input',
      '[data-test-id="comment-editor-container"] input',
      '[aria-label*="Add a comment" i]',
      '[aria-label*="comment" i][contenteditable="true"]',
      '[data-test-id="inline-comment-composer-container"] div[contenteditable="true"]',
      '[data-test-id="comment-editor-container"] div[contenteditable="true"]',
      'div.public-DraftEditor-content[contenteditable="true"]',
    ];

    let commentBox = null;

    // First pass: look for comment box directly after scrolling
    for (const sel of commentBoxSelectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
        commentBox = el;
        console.log(`Pinterest comment box found (pass 1) via: ${sel}`);
        break;
      }
    }

    // Second pass: click the "Add a comment" text/placeholder to activate the input
    if (!commentBox) {
      await page.evaluate(() => {
        const allEls = Array.from(document.querySelectorAll('span, div, p, button'));
        for (const el of allEls) {
          const text = (el.textContent || '').trim();
          if (text === 'Add a comment' || text === 'Write a comment') {
            (el as HTMLElement).click();
            break;
          }
        }
      }).catch(() => {});
      await sleep(1500);

      for (const sel of commentBoxSelectors) {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
          commentBox = el;
          console.log(`Pinterest comment box found (pass 2) via: ${sel}`);
          break;
        }
      }
    }

    // Third pass: use evaluate to find and focus any visible input inside the page
    if (!commentBox) {
      const found = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input, textarea'));
        for (const inp of inputs) {
          const rect = (inp as HTMLElement).getBoundingClientRect();
          const style = window.getComputedStyle(inp);
          if (rect.width > 80 && rect.height > 10 && style.display !== 'none' && style.visibility !== 'hidden') {
            (inp as HTMLElement).click();
            (inp as HTMLElement).focus();
            return true;
          }
        }
        return false;
      }).catch(() => false);

      if (found) {
        await sleep(1000);
        for (const sel of commentBoxSelectors) {
          const el = page.locator(sel).first();
          if (await el.isVisible({ timeout: 1500 }).catch(() => false)) {
            commentBox = el;
            console.log(`Pinterest comment box found (pass 3) via: ${sel}`);
            break;
          }
        }
      }
    }

    if (!commentBox) {
      console.error('Could not find Pinterest comment box on:', normalizedUrl);
      await debugScreenshot(page, 'pinterest', 'comment-failed');
      return { success: false, error: 'Comment box not found — pin may not allow comments, or login session expired' };
    }

    // Click to focus
    await commentBox.click({ force: true });
    await sleep(1000);

    // Human-like typing: variable delay, typos, punctuation pauses
    await sleep(700 + Math.random() * 600);
    for (let i = 0; i < comment.length; i++) {
      const char = comment[i];
      // Occasional typo: wrong char → pause → backspace → retype (4%, not on spaces)
      if (char !== ' ' && Math.random() < 0.04) {
        const typo = 'qwertyuiopasdfghjklzxcvbnm'[Math.floor(Math.random() * 26)];
        await page.keyboard.type(typo);
        await sleep(120 + Math.random() * 180);
        await page.keyboard.press('Backspace');
        await sleep(80 + Math.random() * 100);
      }
      await page.keyboard.type(char);
      if ('.!?,;:'.includes(char)) {
        await sleep(250 + Math.random() * 400);
      } else if (char === ' ' && Math.random() < 0.08) {
        await sleep(300 + Math.random() * 500);
      } else {
        const burst = Math.random() < 0.3;
        await sleep(burst ? 20 + Math.random() * 40 : 50 + Math.random() * 90);
      }
    }
    await sleep(1800 + Math.random() * 1500);

    // Pinterest shows a "Post" button (aria-label="Post") after typing
    const submitSelectors = [
      'button[aria-label="Post"]',
      'button[aria-label="post"]',
      '[data-test-id="comment-submit-button"]',
      'button:has-text("Post")',
    ];

    let submitted = false;
    for (const sel of submitSelectors) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await btn.click({ force: true });
        submitted = true;
        break;
      }
    }

    if (!submitted) {
      await page.keyboard.press('Enter');
    }

    await sleep(5000);

    // Verify: check if "No comments yet" is gone or our text appears
    const noComments = await page.evaluate(() => {
      const h2s = document.querySelectorAll('h2');
      for (const h of h2s) {
        if (h.textContent && /no comments yet/i.test(h.textContent)) return true;
      }
      return false;
    }).catch(() => false);

    const pageText = await page.textContent('body').catch(() => '');
    const textFound = !!(pageText && pageText.includes(comment.slice(0, 25)));

    if (textFound || !noComments) {
      console.log(`Pinterest comment posted successfully on: ${pinUrl}`);
      return { success: true };
    } else {
      console.warn(`Pinterest comment not confirmed on: ${pinUrl}`);
      await debugScreenshot(page, 'pinterest', 'post-failed');
      return { success: false, error: 'Comment not confirmed — "No comments yet" still showing. Pinterest may have blocked it.' };
    }
  } catch (err) {
    const msg = (err as Error).message;
    console.error(`Failed to post Pinterest comment on ${pinUrl}:`, msg);
    return { success: false, error: msg };
  }
}
