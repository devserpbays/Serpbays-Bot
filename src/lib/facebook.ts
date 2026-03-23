/**
 * Facebook Group Browser Automation via Playwright + Chromium
 *
 * Uses a persistent browser context so cookies survive between runs.
 * One-time setup: run `npx tsx scripts/fb-login.ts` to log in manually.
 *
 * Profile data stored at: /var/www/ai-bot/bot-serp/.fb-profile/
 */

import { chromium, type BrowserContext, type Page } from 'playwright';
import { join } from 'path';
import { unlinkSync, existsSync, readFileSync } from 'fs';
import { isValidComment } from './validateComment';
import { debugScreenshot } from './debugScreenshot';
import { randomViewport, randomUserAgent, randomDelay, readingPause, buildLaunchArgs, randomTimezone, applyStealth } from './humanize';

const PROFILE_DIR = process.env.FACEBOOK_PROFILE_DIR
  ? join(process.cwd(), process.env.FACEBOOK_PROFILE_DIR)
  : join(process.cwd(), '.fb-profile');
const NAVIGATION_TIMEOUT = 30000;
const SLOW_WAIT = 4000; // time to let Facebook SPA render

interface FacebookPost {
  url: string;
  author: string;
  content: string;
  groupUrl: string;
}

let _context: BrowserContext | null = null;
let _page: Page | null = null;
let _activeProfileDir: string = PROFILE_DIR;

/**
 * Set the profile directory for the next browser session.
 * If the profile dir changes, the current browser is closed and a new one opened.
 */
export function setProfileDir(profileDir: string): void {
  const resolved = profileDir.startsWith('/') ? profileDir : join(process.cwd(), profileDir);
  if (resolved !== _activeProfileDir) {
    if (_context) {
      _context.close().catch(() => {});
      _context = null;
      _page = null;
    }
    _activeProfileDir = resolved;
  }
}

// --- Launch or reuse persistent browser context ---
async function getPage(): Promise<Page> {
  if (_page && !_page.isClosed()) return _page;

  const profileDir = _activeProfileDir;

  // Remove stale browser lock from previous crash
  try { unlinkSync(join(profileDir, 'SingletonLock')); } catch {}

  _context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    args: buildLaunchArgs(),
    userAgent: randomUserAgent(),
    viewport: randomViewport(),
    locale: 'en-US',
    timezoneId: randomTimezone(),
  });
  await applyStealth(_context);

  // Inject cookies from cookies.json if available (normalize sameSite for Playwright)
  const cookiesJsonPath = join(profileDir, 'cookies.json');
  if (existsSync(cookiesJsonPath)) {
    try {
      const savedCookies = JSON.parse(readFileSync(cookiesJsonPath, 'utf8'));
      if (Array.isArray(savedCookies) && savedCookies.length > 0) {
        const normalized = savedCookies.map((c: Record<string, unknown>) => {
          const ss = String(c.sameSite || 'Lax').toLowerCase();
          const sameSite = ss === 'no_restriction' || ss === 'none' ? 'None'
            : ss === 'strict' ? 'Strict' : 'Lax';
          return {
            name: String(c.name), value: String(c.value), domain: String(c.domain),
            path: String(c.path || '/'),
            expires: Math.floor(Number(c.expirationDate || c.expires || 0)) || undefined,
            secure: c.secure !== false, httpOnly: !!c.httpOnly,
            sameSite: sameSite as 'Strict' | 'Lax' | 'None',
          };
        });
        await _context.addCookies(normalized);
      }
    } catch (e) {
      console.error('Failed to load cookies.json:', (e as Error).message);
    }
  }

  _page = _context.pages()[0] || (await _context.newPage());
  _page.setDefaultTimeout(NAVIGATION_TIMEOUT);
  return _page;
}

// --- Cleanup ---
export async function closeBrowser(): Promise<void> {
  if (_context) {
    await _context.close().catch(() => {});
    _context = null;
    _page = null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Random delay between min and max ms to mimic human behavior */
function humanDelay(minMs: number = 1500, maxMs: number = 4000): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise(r => setTimeout(r, ms));
}

// --- Check if logged in to Facebook ---
export async function ensureFacebookLoggedIn(): Promise<boolean> {
  try {
    const page = await getPage();
    await page.goto('https://www.facebook.com', { waitUntil: 'commit', timeout: 30000 });

    // Wait for Facebook SPA to render (body content > 500 chars or 15s max)
    for (let i = 0; i < 15; i++) {
      await sleep(1000);
      const bodyLen = await page.evaluate(() => document.body?.textContent?.length || 0).catch(() => 0);
      if (bodyLen > 500) break;
    }

    const url = page.url();

    // If redirected to login page
    if (url.includes('/login') || url.includes('checkpoint')) {
      console.error('Not logged in to Facebook. Use cookie login from the dashboard.');
      return false;
    }

    // Check for login form indicators
    const hasLoginForm = await page
      .locator('input[name="email"], input#email, form[action*="login"]')
      .first()
      .isVisible()
      .catch(() => false);

    if (hasLoginForm) {
      console.error('Not logged in to Facebook. Use cookie login from the dashboard.');
      return false;
    }

    // Look for logged-in indicators
    const loggedIn = await page
      .locator(
        '[aria-label="Your profile"], [aria-label="Account"], [aria-label="Menu"], [data-pagelet="Stories"]'
      )
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (loggedIn) return true;

    // Fallback: check if page body has substantial content (not just login form)
    const bodyText = await page.textContent('body').catch(() => '');
    if (bodyText && bodyText.length > 500 && !bodyText.includes('Create new account')) {
      return true;
    }

    // Final fallback: check for c_user cookie (set by Facebook when logged in)
    const cookies = await page.context().cookies('https://www.facebook.com');
    const hasCUser = cookies.some(c => c.name === 'c_user' && c.value);
    if (hasCUser) {
      console.log('Facebook login confirmed via c_user cookie');
      return true;
    }

    console.warn('Facebook login state uncertain — assuming logged in');
    return true;
  } catch (err) {
    console.error('Failed to check Facebook login:', (err as Error).message);
    return false;
  }
}

// --- Scrape profile identity from the already-loaded page ---
export async function scrapeProfileIdentity(): Promise<{ displayName: string; username: string; accountId: string }> {
  try {
    const page = await getPage();
    const ctx = page.context();
    const cookies = await ctx.cookies('https://www.facebook.com');
    const cUser = cookies.find((c) => c.name === 'c_user')?.value || '';
    const accountId = cUser ? `fb_${cUser}` : '';

    const info = await page.evaluate(() => {
      let name = '';
      let uname = '';
      const profileLinks = document.querySelectorAll('a[href*="/profile.php"], a[href*="facebook.com/"]');
      for (const link of profileLinks) {
        const href = link.getAttribute('href') || '';
        const text = (link.textContent || '').trim();
        if (text && text.length > 1 && text.length < 60 && !href.includes('/groups/') && !href.includes('/pages/')) {
          if (href.includes('/profile.php')) {
            if (!name) name = text;
          } else {
            const m = href.match(/facebook\.com\/([a-zA-Z0-9.]+)\/?$/);
            if (m && !['home','watch','marketplace','groups','gaming'].includes(m[1])) {
              if (!uname) uname = m[1];
              if (!name) name = text;
            }
          }
        }
      }
      if (!name) {
        const navLinks = document.querySelectorAll('[aria-label]');
        for (const el of navLinks) {
          const label = el.getAttribute('aria-label') || '';
          if (label.includes('profile') || label.includes('Profile')) {
            const text = (el.textContent || '').trim();
            if (text && text.length > 1 && text.length < 60) { name = text; break; }
          }
        }
      }
      return { displayName: name, username: uname };
    }).catch(() => ({ displayName: '', username: '' }));

    return { displayName: info.displayName, username: info.username, accountId };
  } catch {
    return { displayName: '', username: '', accountId: '' };
  }
}

// --- Get list of joined Facebook groups ---
export async function getJoinedGroups(): Promise<string[]> {
  try {
    const page = await getPage();
    await page.goto('https://www.facebook.com/groups/feed/', {
      waitUntil: 'domcontentloaded',
    });
    await sleep(SLOW_WAIT);

    // Scroll a bit to load more groups in the sidebar
    await page.mouse.wheel(0, 800);
    await humanDelay(1500, 3000);

    // Extract group links from the page
    const hrefs = await page.$$eval('a[href*="/groups/"]', (anchors) =>
      anchors.map((a) => (a as HTMLAnchorElement).href)
    );

    const groups = new Set<string>();
    const excluded = new Set(['feed', 'discover', 'create', 'join', 'suggests']);

    for (const href of hrefs) {
      const match = href.match(
        /https?:\/\/(?:www\.)?facebook\.com\/groups\/([a-zA-Z0-9._-]+)/
      );
      if (match && !excluded.has(match[1])) {
        groups.add(`https://www.facebook.com/groups/${match[1]}`);
      }
    }

    return Array.from(groups);
  } catch (err) {
    console.error('Failed to get joined groups:', (err as Error).message);
    return [];
  }
}

// --- Scrape posts from a Facebook group matching keywords ---
export async function scrapeGroupPosts(
  groupUrl: string,
  keywords: string[]
): Promise<FacebookPost[]> {
  const posts: FacebookPost[] = [];

  try {
    const page = await getPage();
    await page.goto(groupUrl, { waitUntil: 'domcontentloaded' });
    await humanDelay(3000, 5000);

    // Scroll down a couple times to load more posts
    for (let i = 0; i < 3; i++) {
      await page.mouse.wheel(0, 1000);
      await humanDelay(1200, 2500);
    }

    // Facebook renders posts in feed containers — extract post elements
    // Each post typically lives in a [role="article"] or a div with data-pagelet
    const postElements = await page.$$('[role="article"]');

    const lowerKeywords = keywords.map((k) => k.toLowerCase());

    for (const el of postElements) {
      try {
        const text = (await el.textContent()) || '';
        if (text.length < 15) continue;

        // Check keyword match
        const lowerText = text.toLowerCase();
        const matched = lowerKeywords.some((kw) => lowerText.includes(kw));
        if (!matched) continue;

        // Try to extract post permalink
        let postUrl = '';
        const links = await el.$$('a[href*="/posts/"], a[href*="/permalink/"]');
        for (const link of links) {
          const href = await link.getAttribute('href');
          if (href && (href.includes('/posts/') || href.includes('/permalink/'))) {
            postUrl = href.startsWith('http') ? href : `https://www.facebook.com${href}`;
            // Clean off query params
            postUrl = postUrl.split('?')[0];
            break;
          }
        }

        // Try to extract timestamp link as fallback URL
        if (!postUrl) {
          const timeLinks = await el.$$('a[href*="facebook.com"]');
          for (const link of timeLinks) {
            const href = await link.getAttribute('href');
            if (href && href.includes('/groups/') && /\/\d+/.test(href)) {
              postUrl = href.startsWith('http') ? href : `https://www.facebook.com${href}`;
              postUrl = postUrl.split('?')[0];
              break;
            }
          }
        }

        if (!postUrl) continue; // Skip posts we can't link to

        // Extract author name (usually the first strong/span with the poster's name)
        let author = 'Unknown';
        const authorEl = await el.$('strong a, h3 a, h4 a');
        if (authorEl) {
          author = ((await authorEl.textContent()) || 'Unknown').trim();
        }

        posts.push({
          url: postUrl,
          author,
          content: text.slice(0, 2000),
          groupUrl,
        });
      } catch {
        // Individual post extraction failed, continue
      }
    }

    // Deduplicate by URL
    const seen = new Set<string>();
    return posts.filter((p) => {
      if (seen.has(p.url)) return false;
      seen.add(p.url);
      return true;
    });
  } catch (err) {
    console.error(`Failed to scrape group ${groupUrl}:`, (err as Error).message);
    return [];
  }
}

// --- Scrape engagement on our posted comment ---
export async function scrapeCommentEngagement(
  postUrl: string,
  commentText: string
): Promise<{ likes: number; replies: number; replyTexts: Array<{ author: string; content: string }> }> {
  try {
    const page = await getPage();
    await page.goto(postUrl, { waitUntil: 'domcontentloaded' });
    await sleep(SLOW_WAIT);

    // Scroll to load comments
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy({ top: 800, behavior: 'smooth' }));
      await sleep(1500);
    }

    const snippet = commentText.slice(0, 25).toLowerCase();

    const result = await page.evaluate((snippet: string) => {
      const articles = document.querySelectorAll('[role="article"]');
      for (const article of articles) {
        const text = (article.textContent || '').toLowerCase();
        if (!text.includes(snippet)) continue;

        // Try to find reaction count
        const reactionEls = article.querySelectorAll('[aria-label*="reaction"], [aria-label*="like"]');
        let likes = 0;
        for (const el of reactionEls) {
          const label = el.getAttribute('aria-label') || '';
          const m = label.match(/(\d+)/);
          if (m) { likes = parseInt(m[1], 10); break; }
        }

        // Try to find reply count
        const replyEls = article.querySelectorAll('[role="article"]');
        const replyTexts: Array<{ author: string; content: string }> = [];
        replyEls.forEach(reply => {
          if (reply === article) return;
          const authorEl = reply.querySelector('a[role="link"] span');
          replyTexts.push({
            author: authorEl?.textContent?.trim() || 'Unknown',
            content: (reply.textContent || '').trim().slice(0, 500),
          });
        });

        return { likes, replies: replyTexts.length, replyTexts };
      }
      return { likes: 0, replies: 0, replyTexts: [] };
    }, snippet);

    return result;
  } catch (err) {
    console.error('Failed to scrape comment engagement:', (err as Error).message);
    return { likes: 0, replies: 0, replyTexts: [] };
  }
}

// --- Like a Facebook post (warm-up engagement) ---
export async function likeFacebookPost(postUrl: string): Promise<boolean> {
  try {
    const page = await getPage();
    await page.goto(postUrl, { waitUntil: 'domcontentloaded' });
    await sleep(SLOW_WAIT);

    // Look for the Like button — Facebook uses aria-label="Like"
    const likeSelectors = [
      '[aria-label="Like"]',
      '[aria-label="Like"][role="button"]',
      'div[aria-label="Like"]',
      'span:has-text("Like"):not(:has(span))',
    ];

    for (const sel of likeSelectors) {
      const btns = await page.$$(sel);
      for (const btn of btns) {
        if (await btn.isVisible().catch(() => false)) {
          // Check if already liked (aria-pressed or different label)
          const pressed = await btn.getAttribute('aria-pressed').catch(() => null);
          if (pressed === 'true') {
            console.log('Post already liked');
            return true;
          }
          await btn.click({ force: true });
          await humanDelay(1500, 3000);
          console.log('Liked Facebook post successfully');
          return true;
        }
      }
    }

    console.warn('Could not find Like button on Facebook post');
    return false;
  } catch (err) {
    console.error('Failed to like Facebook post:', (err as Error).message);
    return false;
  }
}

// --- Post a comment on a Facebook post ---
export async function postComment(
  postUrl: string,
  comment: string
): Promise<{ success: boolean; error?: string }> {
  // Validate comment before attempting to post
  if (!isValidComment(comment)) {
    console.error('Invalid comment text (error/code detected), refusing to post:', comment.slice(0, 100));
    return { success: false, error: 'Invalid comment text detected (contains code/error patterns)' };
  }

  try {
    const page = await getPage();

    // Navigate with a longer wait for group post permalinks (Facebook SPA is slow)
    await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    // Human-like: variable wait + simulate reading the post before commenting
    await randomDelay(4000, 7000);
    await readingPause(page);

    // Check if the page redirected to login or a "join group" gate
    const currentUrl = page.url();
    if (currentUrl.includes('/login') || currentUrl.includes('accounts.google') || currentUrl.includes('/checkpoint/')) {
      return { success: false, error: 'Facebook session expired — re-upload cookies from dashboard' };
    }

    // Check for "See more on Facebook" login modal (session expired but no URL redirect)
    const hasLoginModal = await page.evaluate(() => {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      for (const d of dialogs) {
        const text = (d.textContent || '').toLowerCase();
        if (text.includes('see more on facebook') || text.includes('log in to facebook') || text.includes('log in or sign up')) {
          return true;
        }
      }
      // Also check for login form injected into the page
      const loginHeadings = document.querySelectorAll('h2, h1');
      for (const h of loginHeadings) {
        const t = (h.textContent || '').toLowerCase();
        if (t.includes('see more on facebook') || t.includes('log in to facebook')) return true;
      }
      return false;
    }).catch(() => false);
    if (hasLoginModal) {
      return { success: false, error: 'Facebook session expired — re-upload cookies from dashboard' };
    }

    // Check for "join group" / membership requirement
    const requiresMembership = await page.evaluate(() => {
      const bodyText = document.body?.innerText || '';
      return /join (this )?group|become a member|request to join/i.test(bodyText.slice(0, 3000));
    }).catch(() => false);
    if (requiresMembership) {
      return { success: false, error: 'Post is in a private group — account must be a member to comment' };
    }

    // Scroll incrementally to trigger lazy-loading of the comment section
    for (let i = 1; i <= 4; i++) {
      await page.evaluate((pct) => window.scrollTo(0, document.body.scrollHeight * pct), i * 0.25);
      await sleep(1000);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(1200);

    // Post may open in a modal — scroll down inside it to reveal comment box
    const modal = await page.$('[role="dialog"]');
    if (modal) {
      await page.evaluate(() => {
        const dialogs = document.querySelectorAll('[role="dialog"]');
        dialogs.forEach((d) => {
          const children = d.querySelectorAll('div');
          children.forEach((c) => {
            if (c.scrollHeight > c.clientHeight) c.scrollTop = c.scrollHeight;
          });
        });
      });
      await sleep(2000);
    }

    // Find comment box — try multiple selectors, check visibility
    const commentSelectors = [
      '[aria-label*="comment" i][contenteditable="true"]',
      '[aria-label*="Comment as"]',
      '[aria-label="Write a comment"]',
      '[aria-label="Write a comment…"]',
      '[aria-label="Write a comment\u2026"]',
      '[aria-label*="Write a comment"]',
      '[aria-label*="Write a public comment"]',
      '[placeholder*="comment" i]',
      'div[contenteditable="true"][role="textbox"]',
      'form div[contenteditable="true"]',
    ];

    // Helper: find visible comment box from known selectors
    async function findCommentBox() {
      for (const sel of commentSelectors) {
        const elements = await page.$$(sel);
        for (const el of elements) {
          if (await el.isVisible().catch(() => false)) {
            return el;
          }
        }
      }

      // Try multiple button patterns
      const buttonTexts = ['Comment', 'comment', 'Write a comment'];
      const allButtons = await page.$$('[role="button"], button, span[role="button"]');
      for (const btn of allButtons) {
        const text = (await btn.textContent().catch(() => ''))?.trim() || '';
        if (buttonTexts.some(t => text.includes(t))) {
          await btn.click({ force: true });
          await humanDelay(2000, 4000);
          break;
        }
      }

      // Also try clicking the comment icon (SVG near like/share buttons)
      const commentIcons = await page.$$('[aria-label*="comment" i], [aria-label*="Comment" i]');
      for (const icon of commentIcons) {
        const tag = await icon.evaluate(el => el.tagName.toLowerCase()).catch(() => '');
        if (tag === 'div' || tag === 'span' || tag === 'i') {
          await icon.click({ force: true }).catch(() => {});
          await humanDelay(1500, 3000);
          break;
        }
      }

      // Retry finding comment box with all selectors
      for (const sel of commentSelectors) {
        const elements = await page.$$(sel);
        for (const el of elements) {
          if (await el.isVisible().catch(() => false)) {
            const parentRole = await el.evaluate((e: Element) => {
              const p = e.closest('[data-pagelet="FeedUnit"], [data-pagelet="ProfileTimeline"]');
              return p ? 'post-feed' : '';
            }).catch(() => '');
            if (parentRole === 'post-feed') continue;
            return el;
          }
        }
      }
      return null;
    }

    let commentBox = await findCommentBox();

    // Helper: click the Comment action button using multiple approaches
    async function clickCommentButton(): Promise<boolean> {
      // Approach 1: aria-label based triggers (non-contenteditable)
      const triggerSelectors = [
        '[aria-label="Leave a comment"]',
        '[aria-label="Write a comment"]',
        '[aria-label="Comment"]',
      ];
      for (const sel of triggerSelectors) {
        const els = await page.$$(sel);
        for (const el of els) {
          const editable = await el.evaluate((e: Element) => e.getAttribute('contenteditable')).catch(() => null);
          if (editable === 'true') continue; // skip the editor itself
          if (await el.isVisible().catch(() => false)) {
            await el.click({ force: true }).catch(() => {});
            return true;
          }
        }
      }
      // Approach 2: text-match any role=button with "Comment"
      return page.evaluate(() => {
        const allEls = Array.from(document.querySelectorAll('[role="button"], span[role="button"], div[role="button"]'));
        for (const el of allEls) {
          const text = (el.textContent || '').trim().toLowerCase();
          if (text === 'comment' || text === 'write a comment' || text === 'leave a comment') {
            (el as HTMLElement).click();
            return true;
          }
        }
        return false;
      }).catch(() => false);
    }

    commentBox = await findCommentBox();

    // Strategy A: click the Comment action button then wait for editor to appear
    if (!commentBox) {
      const clicked = await clickCommentButton();
      if (clicked) {
        // Wait for editor to appear (up to 5s)
        await page.waitForSelector('div[contenteditable="true"]', { timeout: 5000 }).catch(() => sleep(3000));
        commentBox = await findCommentBox();
      }
    }

    // Strategy B: click any visible comment-related element that could be a trigger
    if (!commentBox) {
      const commentTriggers = await page.$$('[aria-label*="comment" i], [aria-label*="Comment" i]');
      for (const el of commentTriggers) {
        if (!await el.isVisible().catch(() => false)) continue;
        const isEditable = await el.evaluate((e: Element) => e.getAttribute('contenteditable') === 'true').catch(() => false);
        if (isEditable) { commentBox = el; break; }
        await el.click({ force: true }).catch(() => {});
        await page.waitForSelector('div[contenteditable="true"]', { timeout: 4000 }).catch(() => sleep(2500));
        commentBox = await findCommentBox();
        if (commentBox) break;
      }
    }

    // Strategy C: click the comment count link (e.g. "12 comments") to expand the section
    if (!commentBox) {
      const clicked = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('span, a'));
        for (const el of els) {
          const t = (el.textContent || '').trim().toLowerCase();
          if (/^\d+\s+comment/.test(t) || /view\s+\d+\s+comment/i.test(t)) {
            (el as HTMLElement).click();
            return true;
          }
        }
        return false;
      }).catch(() => false);
      if (clicked) {
        await page.waitForSelector('div[contenteditable="true"]', { timeout: 5000 }).catch(() => sleep(3500));
        commentBox = await findCommentBox();
      }
    }

    // Strategy D: scroll to bottom, try comment button again, wait longer
    if (!commentBox) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await sleep(3000);
      const clicked = await clickCommentButton();
      if (clicked) {
        await page.waitForSelector('div[contenteditable="true"]', { timeout: 5000 }).catch(() => sleep(3000));
        commentBox = await findCommentBox();
      }
    }

    // Strategy E: Tab-focus into comment input from bottom of page
    if (!commentBox) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await sleep(2000);
      await page.keyboard.press('Tab');
      await sleep(1000);
      commentBox = await findCommentBox();
    }

    if (!commentBox) {
      // Check if comments are disabled / locked on this post
      const commentsDisabled = await page.evaluate(() => {
        const body = document.body.innerText.toLowerCase();
        return /comment(s|ing)? (turned off|disabled|not allowed|are off)|no one can comment/i.test(body);
      }).catch(() => false);

      console.error('Could not find comment input box on post:', postUrl);
      await page.screenshot({ path: '/tmp/fb-comment-notfound.png', fullPage: false }).catch(() => {});
      return {
        success: false,
        error: commentsDisabled
          ? 'Comments are disabled on this post'
          : 'Comment box not found — post may be restricted, members-only, or comments are turned off',
      };
    }

    // Click to focus (force to bypass any overlay)
    await commentBox.click({ force: true });
    await humanDelay(800, 1800);

    // Type the comment with human-like delay
    await page.keyboard.type(comment, { delay: 30 + Math.random() * 60 });
    await humanDelay(800, 2000);

    // Submit with Enter
    await page.keyboard.press('Enter');
    await humanDelay(4000, 7000);

    // Verify submission: the comment box should be empty after a successful post
    const boxTextAfter = await commentBox.textContent().catch(() => comment);
    const boxCleared = !boxTextAfter || boxTextAfter.trim().length === 0;

    // Secondary check: look for our comment text in the comments section
    // (not in the input box — use a more specific selector)
    const commentSectionText = await page.evaluate((snippet: string) => {
      // Look for the text in elements that are NOT contenteditable
      const allText = Array.from(document.querySelectorAll('[role="article"] span, [data-testid*="comment"] span'))
        .map(el => el.textContent || '')
        .join(' ');
      return allText.toLowerCase().includes(snippet.toLowerCase());
    }, comment.slice(0, 25)).catch(() => false);

    const posted = boxCleared || commentSectionText;

    if (posted) {
      console.log(`Comment posted successfully on: ${postUrl}`);
      return { success: true };
    } else {
      console.warn(`Comment may NOT have posted on: ${postUrl} (box not cleared, text not found in comments)`);
      await debugScreenshot(page, 'facebook', 'post-failed');
      return { success: false, error: 'Comment not confirmed after posting — Facebook may have blocked it or session expired' };
    }
  } catch (err) {
    const msg = (err as Error).message;
    console.error(`Failed to post comment on ${postUrl}:`, msg);
    return { success: false, error: msg };
  }
}

// ─── Passive engagement ────────────────────────────────────────────────────────

export type FbReaction = 'Like' | 'Love' | 'Care' | 'Haha' | 'Wow' | 'Sad' | 'Angry';

/**
 * React to a Facebook post with a specific reaction.
 * To use non-Like reactions: hover over the Like button to reveal the picker,
 * wait for it to appear, then click the desired reaction.
 */
export async function reactToPost(
  postUrl: string,
  reaction: FbReaction = 'Like'
): Promise<{ success: boolean; reaction: FbReaction }> {
  try {
    const page = await getPage();
    await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await randomDelay(3000, 6000);
    await readingPause(page);

    if (reaction === 'Like') {
      // Simple like — find Like button and click
      const likeBtn = await page.$('[aria-label="Like"][role="button"], div[aria-label="Like"]');
      if (likeBtn && await likeBtn.isVisible().catch(() => false)) {
        const pressed = await likeBtn.getAttribute('aria-pressed').catch(() => null);
        if (pressed !== 'true') {
          await likeBtn.click({ force: true });
          await randomDelay(1000, 2500);
        }
      }
    } else {
      // Non-Like reaction: hover over Like button to trigger reaction picker
      const likeBtn = await page.$('[aria-label="Like"][role="button"], div[aria-label="Like"]');
      if (!likeBtn || !await likeBtn.isVisible().catch(() => false)) {
        return { success: false, reaction };
      }

      // Hover and hold to trigger reaction picker (Facebook shows it after ~0.6s)
      const box = await likeBtn.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
        await randomDelay(700, 1200); // wait for picker to appear
      }

      // Reaction picker aria-labels: Love, Care, Haha, Wow, Sad, Angry
      const reactionBtn = await page.$(`[aria-label="${reaction}"][role="button"]`);
      if (reactionBtn && await reactionBtn.isVisible().catch(() => false)) {
        await reactionBtn.click({ force: true });
        await randomDelay(1000, 2500);
        console.log(`[facebook] Reacted with ${reaction} on: ${postUrl}`);
        return { success: true, reaction };
      }

      // Fallback: try text-based search for reaction
      const fallback = await page.evaluate((label: string) => {
        const els = Array.from(document.querySelectorAll('[role="button"]'));
        for (const el of els) {
          if (el.getAttribute('aria-label') === label) {
            (el as HTMLElement).click();
            return true;
          }
        }
        return false;
      }, reaction);

      if (fallback) {
        await randomDelay(1000, 2000);
        return { success: true, reaction };
      }
    }

    return { success: true, reaction };
  } catch (err) {
    console.error(`[facebook] reactToPost error:`, (err as Error).message);
    return { success: false, reaction };
  }
}

// Reactions weighted toward positive/neutral — matches real human behavior
const REACTION_WEIGHTS: Array<{ reaction: FbReaction; weight: number }> = [
  { reaction: 'Like',  weight: 45 },
  { reaction: 'Love',  weight: 20 },
  { reaction: 'Haha',  weight: 15 },
  { reaction: 'Wow',   weight: 10 },
  { reaction: 'Care',  weight:  7 },
  { reaction: 'Sad',   weight:  2 },
  { reaction: 'Angry', weight:  1 },
];

function pickReaction(): FbReaction {
  const total = REACTION_WEIGHTS.reduce((s, r) => s + r.weight, 0);
  let rand = Math.random() * total;
  for (const { reaction, weight } of REACTION_WEIGHTS) {
    rand -= weight;
    if (rand <= 0) return reaction;
  }
  return 'Like';
}

/**
 * Browse a Facebook group feed and react to a few posts without commenting.
 * Picks reactions based on weighted probability matching real user distribution.
 */
export async function browseFeedAndReact(
  groupUrls: string[],
  maxReactions: number = 2
): Promise<{ reacted: number; reactions: FbReaction[] }> {
  let reacted = 0;
  const reactions: FbReaction[] = [];

  for (const groupUrl of groupUrls) {
    if (reacted >= maxReactions) break;
    try {
      const page = await getPage();
      await page.goto(groupUrl, { waitUntil: 'domcontentloaded' });
      await randomDelay(3000, 6000);
      await readingPause(page);

      // Scroll through to load posts
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => window.scrollBy({ top: 700, behavior: 'smooth' }));
        await randomDelay(1500, 3000);
      }

      // Find Like buttons on visible posts
      const likeBtns = await page.$$('[aria-label="Like"][role="button"]');

      for (const btn of likeBtns) {
        if (reacted >= maxReactions) break;
        if (!await btn.isVisible().catch(() => false)) continue;

        const pressed = await btn.getAttribute('aria-pressed').catch(() => null);
        if (pressed === 'true') continue; // already reacted

        const reaction = pickReaction();
        if (reaction === 'Like') {
          await btn.click({ force: true });
        } else {
          // Hover to open picker
          const box = await btn.boundingBox();
          if (box) {
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
            await randomDelay(700, 1200);
            const picker = await page.$(`[aria-label="${reaction}"][role="button"]`);
            if (picker && await picker.isVisible().catch(() => false)) {
              await picker.click({ force: true });
            } else {
              // Picker didn't show — fall back to like
              await btn.click({ force: true });
            }
          }
        }

        reacted++;
        reactions.push(reaction);
        await randomDelay(2000, 5000);
        await readingPause(page);
      }
    } catch (err) {
      console.error(`[facebook] browseFeedAndReact error on ${groupUrl}:`, (err as Error).message);
    }
  }

  return { reacted, reactions };
}
