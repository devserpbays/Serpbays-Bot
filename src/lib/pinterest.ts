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

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
  });

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

      // Extract pin elements
      const pinData = await page.evaluate(() => {
        const results: { url: string; description: string; creator: string; pinId: string }[] = [];

        // Try data-test-id="pin" selector
        const pinEls = document.querySelectorAll('[data-test-id="pin"], [data-grid-item="true"], div[role="listitem"]');

        for (const pin of pinEls) {
          const linkEl = pin.querySelector('a[href*="/pin/"]') as HTMLAnchorElement | null;
          if (!linkEl) continue;

          const href = linkEl.getAttribute('href') || '';
          const pinIdMatch = href.match(/\/pin\/(\d+)/);
          if (!pinIdMatch) continue;

          const pinId = pinIdMatch[1];
          const imgAlt = pin.querySelector('img')?.getAttribute('alt') || '';
          const descEl = pin.querySelector('[data-test-id="pin-description"], div[class*="description"]');
          const description = descEl?.textContent?.trim() || imgAlt.trim();

          if (description.length < 5) continue;

          results.push({
            url: `https://www.pinterest.com/pin/${pinId}/`,
            description,
            creator: '',
            pinId,
          });
        }
        return results;
      }).catch(() => [] as { url: string; description: string; creator: string; pinId: string }[]);

      for (const p of pinData) {
        pins.push({
          url: p.url,
          author: p.creator || 'Pinterest User',
          content: p.description.slice(0, 2000),
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

    // Human-like typing: variable delay, occasional natural pauses
    await sleep(700 + Math.random() * 600);
    for (let i = 0; i < comment.length; i++) {
      await page.keyboard.type(comment[i]);
      const isPause = comment[i] === ',' || comment[i] === '.' || comment[i] === '!' || (Math.random() < 0.04);
      await sleep(isPause ? 320 + Math.random() * 280 : 60 + Math.random() * 110);
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
