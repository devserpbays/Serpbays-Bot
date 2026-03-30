/**
 * Reddit Browser Automation via Playwright + Chromium
 *
 * Uses a persistent browser context so cookies survive between runs.
 * Profile data stored at: /var/www/ai-bot/bot-serp/.reddit-profile/
 */

import { chromium, type BrowserContext, type Page } from 'playwright';
import { join } from 'path';
import { unlinkSync, existsSync, readFileSync } from 'fs';
import { isValidComment } from './validateComment';
import { debugScreenshot } from './debugScreenshot';
import { randomViewport, randomUserAgent, randomDelay, readingPause, buildLaunchArgs, randomTimezone, applyStealth, parseProxyConfig } from './humanize';

const DEFAULT_PROFILE_DIR = process.env.REDDIT_PROFILE_DIR
  ? join(process.cwd(), process.env.REDDIT_PROFILE_DIR)
  : join(process.cwd(), '.reddit-profile');
const NAVIGATION_TIMEOUT = 30000;
const SLOW_WAIT = 4000;

interface RedditPost {
  url: string;
  author: string;
  content: string;
  subreddit: string;
}

let _context: BrowserContext | null = null;
let _page: Page | null = null;
let _activeProfileDir: string = DEFAULT_PROFILE_DIR;
let _activeProxyUrl: string = '';

/**
 * Set the profile directory for the next browser session.
 * Must be called BEFORE getPage() if you want a user-specific profile.
 * If the profile dir changes, the current browser is closed and a new one opened.
 */
export function setProfileDir(profileDir: string): void {
  const resolved = profileDir.startsWith('/') ? profileDir : join(process.cwd(), profileDir);
  if (resolved !== _activeProfileDir) {
    // Force close so next getPage() opens with the new profile
    if (_context) {
      _context.close().catch(() => {});
      _context = null;
      _page = null;
    }
    _activeProfileDir = resolved;
  }
}

/** Set the proxy URL for this account's browser session. Call before getPage(). */
export function setProxy(proxyUrl: string): void {
  if (proxyUrl !== _activeProxyUrl) {
    if (_context) {
      _context.close().catch(() => {});
      _context = null;
      _page = null;
    }
    _activeProxyUrl = proxyUrl;
  }
}

// --- Launch or reuse persistent browser context ---
async function getPage(): Promise<Page> {
  if (_page && !_page.isClosed()) return _page;

  const profileDir = _activeProfileDir;

  // Remove stale browser lock from previous crash
  try { unlinkSync(join(profileDir, 'SingletonLock')); } catch {}

  const proxyConfig = parseProxyConfig(_activeProxyUrl);
  const ua = randomUserAgent();
  const vp = randomViewport();
  const tz = process.env.ACCOUNT_TIMEZONE || randomTimezone();
  _context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    args: buildLaunchArgs(),
    userAgent: ua,
    viewport: vp,
    locale: 'en-US',
    timezoneId: tz,
    ...(proxyConfig && { proxy: proxyConfig }),
  });
  await applyStealth(_context, { viewport: vp, ua });

  // Inject cookies from cookies.json if available
  const cookiesJsonPath = join(profileDir, 'cookies.json');
  if (existsSync(cookiesJsonPath)) {
    try {
      const savedCookies = JSON.parse(readFileSync(cookiesJsonPath, 'utf8'));
      if (Array.isArray(savedCookies) && savedCookies.length > 0) {
        await _context.addCookies(savedCookies);
      }
    } catch (e) {
      console.error('Failed to load cookies.json:', e);
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

// --- Check if logged in to Reddit ---
export async function ensureRedditLoggedIn(): Promise<boolean> {
  try {
    const page = await getPage();
    await page.goto('https://www.reddit.com', { waitUntil: 'domcontentloaded' });
    await sleep(SLOW_WAIT);

    const url = page.url();

    // If redirected to login page
    if (url.includes('/login') || url.includes('/register')) {
      console.error('Not logged in to Reddit.');
      return false;
    }

    // Check for login button (not logged in)
    const hasLoginBtn = await page
      .locator('a[href*="/login"], button:has-text("Log In"), [data-testid="login-button"]')
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    // Check for logged-in indicators
    const loggedIn = await page
      .locator('#USER_DROPDOWN_ID, button[id*="USER_DROPDOWN"], [data-testid="user-drawer-button"], a[href*="/user/"]')
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (loggedIn) {
      return true;
    }

    // Fallback: check page content
    const bodyText = await page.textContent('body').catch(() => '');
    const looksLoggedIn = bodyText && bodyText.length > 500 && !bodyText.includes('Log In');
    if (looksLoggedIn && !hasLoginBtn) {
      return true;
    }

    console.warn('Reddit login state uncertain');
    return false;
  } catch (err) {
    console.error('Failed to check Reddit login:', (err as Error).message);
    return false;
  }
}

// --- Scrape profile identity of the logged-in user ---
export async function scrapeProfileIdentity(): Promise<{ displayName: string; username: string; accountId: string }> {
  try {
    const page = await getPage();

    // Navigate to old.reddit.com — the logged-in username is in the header nav
    await page.goto('https://old.reddit.com', { waitUntil: 'domcontentloaded' });
    await sleep(3000);

    const info = await page.evaluate(() => {
      let username = '';

      // old.reddit.com shows logged-in user in: span.user a[href*="/user/"]
      const userSpan = document.querySelector('span.user a[href*="/user/"]');
      if (userSpan) {
        const m = userSpan.getAttribute('href')?.match(/\/user\/([^/?]+)/);
        if (m) username = m[1];
      }

      // Fallback: look at the header-bottom-right area
      if (!username) {
        const headerUser = document.querySelector('#header-bottom-right .user a');
        if (headerUser) {
          username = headerUser.textContent?.trim() || '';
        }
      }

      return { username };
    }).catch(() => ({ username: '' }));

    const username = info.username || '';
    const accountId = username ? `rd_${username}` : '';
    return { displayName: username, username, accountId };
  } catch {
    return { displayName: '', username: '', accountId: '' };
  }
}

// --- Scrape posts from a subreddit matching keywords ---
export async function scrapeSubredditPosts(
  subreddit: string,
  keywords: string[]
): Promise<RedditPost[]> {
  const posts: RedditPost[] = [];

  try {
    const page = await getPage();
    // Use old.reddit.com for simpler DOM structure
    const subredditUrl = subreddit.startsWith('http')
      ? subreddit
      : `https://old.reddit.com/r/${subreddit}/new/`;
    await page.goto(subredditUrl, { waitUntil: 'domcontentloaded' });
    await sleep(SLOW_WAIT);

    // Scroll to load more posts
    for (let i = 0; i < 2; i++) {
      await page.evaluate(() => window.scrollBy({ top: 800, behavior: 'smooth' }));
      await sleep(1500);
    }

    const lowerKeywords = keywords.map((k) => k.toLowerCase());

    // Try old.reddit.com selectors first
    const things = await page.$$('.thing.link, [data-testid="post-container"], article, .Post');

    for (const el of things) {
      try {
        const text = (await el.textContent()) || '';
        if (text.length < 15) continue;

        // Check keyword match
        const lowerText = text.toLowerCase();
        const matched = lowerKeywords.some((kw) => lowerText.includes(kw));
        if (!matched) continue;

        // Extract post permalink
        let postUrl = '';

        // old.reddit.com: data-url attribute or permalink link
        const dataUrl = await el.getAttribute('data-url').catch(() => null);
        if (dataUrl && dataUrl.includes('/comments/')) {
          postUrl = dataUrl.startsWith('http') ? dataUrl : `https://www.reddit.com${dataUrl}`;
        }

        if (!postUrl) {
          const links = await el.$$('a[href*="/comments/"]');
          for (const link of links) {
            const href = await link.getAttribute('href');
            if (href && href.includes('/comments/')) {
              postUrl = href.startsWith('http') ? href : `https://www.reddit.com${href}`;
              break;
            }
          }
        }

        if (!postUrl) continue;
        postUrl = postUrl.split('?')[0];

        // Extract author
        let author = 'Unknown';
        const authorEl = await el.$('a.author, [data-testid="post_author_link"], a[href*="/user/"]');
        if (authorEl) {
          author = ((await authorEl.textContent()) || 'Unknown').trim().replace(/^u\//, '');
        }

        // Extract subreddit name from URL
        const subMatch = postUrl.match(/\/r\/([^/]+)/);
        const sub = subMatch ? subMatch[1] : subreddit;

        posts.push({
          url: postUrl,
          author,
          content: text.slice(0, 2000),
          subreddit: sub,
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
    console.error(`Failed to scrape subreddit ${subreddit}:`, (err as Error).message);
    return [];
  }
}

// --- Scrape Reddit search results matching keywords ---
export async function scrapeRedditSearch(
  keywords: string[]
): Promise<RedditPost[]> {
  const posts: RedditPost[] = [];

  for (const keyword of keywords) {
    try {
      const page = await getPage();
      const searchUrl = `https://old.reddit.com/search?q=${encodeURIComponent(keyword)}&sort=new&t=day`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
      await sleep(SLOW_WAIT);

      const things = await page.$$('.thing.link, .search-result');

      for (const el of things) {
        try {
          const text = (await el.textContent()) || '';
          if (text.length < 15) continue;

          let postUrl = '';
          const dataUrl = await el.getAttribute('data-url').catch(() => null);
          if (dataUrl && dataUrl.includes('/comments/')) {
            postUrl = dataUrl.startsWith('http') ? dataUrl : `https://www.reddit.com${dataUrl}`;
          }

          if (!postUrl) {
            const links = await el.$$('a[href*="/comments/"]');
            for (const link of links) {
              const href = await link.getAttribute('href');
              if (href && href.includes('/comments/')) {
                postUrl = href.startsWith('http') ? href : `https://www.reddit.com${href}`;
                break;
              }
            }
          }

          if (!postUrl) continue;
          postUrl = postUrl.split('?')[0];

          let author = 'Unknown';
          const authorEl = await el.$('a.author, a[href*="/user/"]');
          if (authorEl) {
            author = ((await authorEl.textContent()) || 'Unknown').trim().replace(/^u\//, '');
          }

          const subMatch = postUrl.match(/\/r\/([^/]+)/);
          const sub = subMatch ? subMatch[1] : 'unknown';

          posts.push({
            url: postUrl,
            author,
            content: text.slice(0, 2000),
            subreddit: sub,
          });
        } catch {
          // continue
        }
      }

      await sleep(2000);
    } catch (err) {
      console.error(`Failed to search Reddit for "${keyword}":`, (err as Error).message);
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  return posts.filter((p) => {
    if (seen.has(p.url)) return false;
    seen.add(p.url);
    return true;
  });
}


// --- Scrape engagement on our posted comment ---
export async function scrapeCommentEngagement(
  postUrl: string,
  commentText: string
): Promise<{ likes: number; replies: number; replyTexts: Array<{ author: string; content: string }> }> {
  try {
    const page = await getPage();
    const oldUrl = postUrl.replace('www.reddit.com', 'old.reddit.com');
    await page.goto(oldUrl, { waitUntil: 'domcontentloaded' });
    await sleep(SLOW_WAIT);

    const snippet = commentText.slice(0, 30).toLowerCase();

    const result = await page.evaluate((snippet: string) => {
      const comments = document.querySelectorAll('.comment, .thing.comment');
      for (const comment of comments) {
        const body = comment.querySelector('.md, .usertext-body');
        if (!body) continue;
        const text = (body.textContent || '').toLowerCase();
        if (!text.includes(snippet)) continue;

        // Found our comment — get score
        const scoreEl = comment.querySelector('.score.unvoted, .score.likes, .score');
        const score = parseInt(scoreEl?.textContent || '0', 10) || 0;

        // Count direct replies
        const childComments = comment.querySelectorAll(':scope > .child > .listing > .comment, :scope > .child .thing.comment');
        const replyTexts: Array<{ author: string; content: string }> = [];
        childComments.forEach(child => {
          const authorEl = child.querySelector('a.author');
          const bodyEl = child.querySelector('.md, .usertext-body');
          replyTexts.push({
            author: authorEl?.textContent?.trim() || 'Unknown',
            content: (bodyEl?.textContent || '').trim().slice(0, 500),
          });
        });

        return { likes: score, replies: replyTexts.length, replyTexts };
      }
      return { likes: 0, replies: 0, replyTexts: [] };
    }, snippet);

    return result;
  } catch (err) {
    console.error('Failed to scrape comment engagement:', (err as Error).message);
    return { likes: 0, replies: 0, replyTexts: [] };
  }
}

// --- Upvote a Reddit post (warm-up engagement) ---
export async function upvoteRedditPost(postUrl: string): Promise<boolean> {
  try {
    const page = await getPage();
    // Use old.reddit.com for simpler upvote button
    const oldUrl = postUrl.replace('www.reddit.com', 'old.reddit.com');
    await page.goto(oldUrl, { waitUntil: 'domcontentloaded' });
    await sleep(SLOW_WAIT);

    // Try old Reddit upvote arrow
    const upvoteSelectors = [
      '.arrow.up:not(.upmod)',
      '.arrow.upmod',   // already upvoted check
      '[aria-label="upvote"]',
      'button[aria-label="upvote"]',
    ];

    // Check if already upvoted
    const alreadyUpvoted = await page.$('.arrow.upmod, [aria-pressed="true"][aria-label="upvote"]');
    if (alreadyUpvoted) {
      console.log('Post already upvoted');
      return true;
    }

    const upBtn = await page.$('.arrow.up:not(.upmod), button[aria-label="upvote"]:not([aria-pressed="true"])');
    if (upBtn) {
      // Use native mouse click — Reddit needs real events
      const upBox = await upBtn.boundingBox();
      if (upBox) {
        await page.mouse.move(upBox.x + upBox.width / 2, upBox.y + upBox.height / 2, { steps: 6 });
        await sleep(200 + Math.random() * 300);
        await page.mouse.click(upBox.x + upBox.width / 2, upBox.y + upBox.height / 2);
      } else {
        await upBtn.click();
      }
      await sleep(2000);
      // Verify the upvote registered by checking the DOM state changed
      const confirmed = await page.$('.arrow.upmod, [aria-pressed="true"][aria-label="upvote"]');
      if (confirmed) {
        console.log('Upvoted post successfully');
        return true;
      }
      console.warn('Upvote click did not register on platform');
      return false;
    }

    console.warn('Could not find upvote button');
    return false;
  } catch (err) {
    console.error('Failed to upvote post:', (err as Error).message);
    return false;
  }
}

// --- Post a comment on a Reddit post ---
export async function postRedditComment(
  postUrl: string,
  comment: string
): Promise<{ success: boolean; error?: string }> {
  if (!isValidComment(comment)) {
    console.error('Invalid comment text (error/code detected), refusing to post:', comment.slice(0, 100));
    return { success: false, error: 'Invalid comment text detected (contains code/error patterns)' };
  }

  try {
    const page = await getPage();
    // Use new Reddit for commenting
    const newRedditUrl = postUrl.replace('old.reddit.com', 'www.reddit.com');
    await page.goto(newRedditUrl, { waitUntil: 'domcontentloaded' });
    // Human-like: variable wait after page load
    await randomDelay(3000, 6000);
    // Simulate reading the post before commenting
    await readingPause(page);

    // Scroll down progressively to trigger lazy-loading of comment composer
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy({ top: 400, behavior: 'smooth' }));
      await sleep(1000);
    }
    // Scroll back up to where the comment box usually appears (below post, above comments)
    await page.evaluate(() => window.scrollTo(0, 300));
    await sleep(2000);

    // Comment box selectors for new Reddit (shreddit web components) + old Reddit
    const commentSelectors = [
      'shreddit-composer [contenteditable="true"]',
      'shreddit-comment-composer [contenteditable="true"]',
      'faceplate-tracker[noun="comment_composer"] [contenteditable="true"]',
      'div[contenteditable="true"][data-lexical-editor]',
      'div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="plaintext-only"]',
      'textarea[name="comment"]',
      'textarea[placeholder*="comment" i]',
      '.public-DraftEditor-content',
      'div[contenteditable="true"]',
    ];

    // Helper: try to find a visible comment box
    const findCommentBox = async () => {
      for (const sel of commentSelectors) {
        const elements = await page.$$(sel);
        for (const el of elements) {
          if (await el.isVisible().catch(() => false)) {
            return el;
          }
        }
      }
      return null;
    };

    let commentBox = await findCommentBox();

    // If not found, try clicking various activator elements
    if (!commentBox) {
      // Strategy 1: Click on the comment composer placeholder area
      const activators = [
        'shreddit-composer',
        'shreddit-comment-composer',
        'faceplate-tracker[noun="comment_composer"]',
        'div[data-click-id="text"]',
        '[placeholder*="comment" i]',
        '[placeholder*="conversation" i]',
      ];
      for (const sel of activators) {
        const el = await page.$(sel);
        if (el && await el.isVisible().catch(() => false)) {
          await el.click({ force: true });
          await sleep(2500);
          commentBox = await findCommentBox();
          if (commentBox) break;
        }
      }
    }

    // Strategy 2: Find text-based activators using evaluate
    if (!commentBox) {
      await page.evaluate(() => {
        const texts = ['Add a comment', 'Join the conversation', 'What are your thoughts'];
        const all = document.querySelectorAll('span, p, div, button, input');
        for (const el of all) {
          const t = el.textContent?.trim() || '';
          const placeholder = (el as HTMLInputElement).placeholder || '';
          if (texts.some(txt => t === txt || placeholder.includes(txt))) {
            (el as HTMLElement).click();
            return;
          }
        }
      });
      await sleep(3000);
      commentBox = await findCommentBox();
    }

    // Strategy 3: Tab into the comment box (keyboard navigation)
    if (!commentBox) {
      // Click the post body first to give the page focus context
      const postBody = await page.$('[data-click-id="body"], article, [slot="post-media-container"]');
      if (postBody) await postBody.click({ force: true }).catch(() => {});
      await sleep(500);
      // Tab forward to find an editable element
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('Tab');
        await sleep(300);
        commentBox = await findCommentBox();
        if (commentBox) break;
      }
    }

    if (!commentBox) {
      console.error('Could not find comment input box on post:', postUrl);
      await debugScreenshot(page, 'reddit', 'comment-failed');
      return { success: false, error: 'Comment box not found on page — post may be locked, archived, or login session expired' };
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

    // Find and click the submit button
    const submitSelectors = [
      'button[slot="submit-button"]',
      'shreddit-composer button[type="submit"]',
      'shreddit-comment-composer button[type="submit"]',
      'faceplate-tracker[noun="comment"] button',
      'button[type="submit"]:has-text("Comment")',
      'button:has-text("Comment")',
    ];

    let submitted = false;
    for (const sel of submitSelectors) {
      const btns = await page.$$(sel);
      for (const btn of btns) {
        const text = await btn.textContent().catch(() => '');
        if (text && /comment/i.test(text.trim()) && await btn.isVisible().catch(() => false)) {
          await btn.click({ force: true });
          submitted = true;
          break;
        }
      }
      if (submitted) break;
    }

    if (!submitted) {
      // Try Ctrl+Enter as fallback
      await page.keyboard.press('Control+Enter');
    }

    await sleep(5000);

    // Verify: check if comment text appears in page
    const pageText = await page.textContent('body').catch(() => '');
    const posted = pageText?.includes(comment.slice(0, 30)) ?? false;

    if (posted) {
      console.log(`Comment posted successfully on: ${postUrl}`);
      return { success: true };
    } else {
      console.warn(`Comment may NOT have posted on: ${postUrl}`);
      await debugScreenshot(page, 'reddit', 'post-failed');
      return { success: false, error: 'Comment not found on page after posting — may not have submitted. Check if logged in or if Reddit blocked it.' };
    }
  } catch (err) {
    const msg = (err as Error).message;
    console.error(`Failed to post comment on ${postUrl}:`, msg);
    return { success: false, error: msg };
  }
}

/**
 * Shadow-removal check: re-visit the post after a delay and verify the comment
 * is still visible on the page.  Reddit sometimes accepts the submission but
 * silently removes it (spam filter / mod-queue).  If the snippet we typed is
 * no longer in the page body, the comment was likely shadow-removed.
 *
 * @param postUrl      URL of the Reddit post we commented on
 * @param commentSnippet  First 30 characters of the comment we posted
 * @param waitMs       How long to wait before re-checking (default 40 s)
 * @returns 'visible' | 'removed' | 'unknown'
 */
export async function checkCommentShadowRemoved(
  postUrl: string,
  commentSnippet: string,
  waitMs = 40_000,
): Promise<'visible' | 'removed' | 'unknown'> {
  try {
    await sleep(waitMs);
    const page = await getPage();
    const url = postUrl.replace('old.reddit.com', 'www.reddit.com');
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await sleep(5000);

    const body = await page.textContent('body').catch(() => '');
    if (!body) return 'unknown';

    if (body.includes(commentSnippet)) return 'visible';

    // Snippet not found after confirmed successful submission → likely shadow-removed
    return 'removed';
  } catch {
    return 'unknown';
  }
}

// ─── Passive engagement ────────────────────────────────────────────────────────

/**
 * Browse one or more subreddits and upvote a few posts without commenting.
 * Simulates human browsing: scroll, read, upvote, move on.
 * @param subreddits List of subreddit names (e.g. ['startups', 'SaaS'])
 * @param maxUpvotes How many posts to upvote (1–3 recommended)
 */
export async function browseAndUpvote(
  subreddits: string[],
  maxUpvotes: number = 2
): Promise<{ upvoted: number }> {
  let upvoted = 0;

  for (const sub of subreddits) {
    if (upvoted >= maxUpvotes) break;
    try {
      const page = await getPage();
      const url = `https://old.reddit.com/r/${sub}/`;
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await randomDelay(3000, 5000);
      await readingPause(page);

      // Scroll through the feed a bit
      for (let i = 0; i < 3 && upvoted < maxUpvotes; i++) {
        await page.evaluate(() => window.scrollBy({ top: 600 + Math.random() * 300, behavior: 'smooth' }));
        await randomDelay(1500, 3000);

        // Find unvoted up-arrows
        const upArrows = await page.$$('.arrow.up:not(.upmod)');
        if (upArrows.length > 0) {
          // Pick a random post to upvote (not always the first)
          const target = upArrows[Math.floor(Math.random() * Math.min(upArrows.length, 5))];
          const visible = await target.isVisible().catch(() => false);
          if (visible) {
            const box = await target.boundingBox();
            if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 6 });
            await randomDelay(200, 600);
            await target.click({ force: true });
            upvoted++;
            await randomDelay(1500, 3500);
          }
        }
        await readingPause(page);
      }
    } catch (err) {
      console.error(`[reddit] browseAndUpvote error on r/${sub}:`, (err as Error).message);
    }
  }

  return { upvoted };
}

// --- Join a subreddit if not already a member ---
export async function joinSubreddit(subreddit: string): Promise<boolean> {
  try {
    const page = await getPage();
    await page.goto(`https://old.reddit.com/r/${subreddit}/`, { waitUntil: 'domcontentloaded' });
    await sleep(SLOW_WAIT);

    // Already a member?
    const joined = await page.$('.side .fancy-toggle-button .option.active, .side .unsubscribe-button').catch(() => null);
    if (joined) { console.log(`[Reddit] Already a member of r/${subreddit}`); return true; }

    // Click subscribe/join
    const btn = await page.$('.side .fancy-toggle-button .option:not(.active), .side .subscribe-button a, .side [data-testid="subscription-button"]').catch(() => null);
    if (btn) {
      await btn.scrollIntoViewIfNeeded().catch(() => {});
      await randomDelay(500, 1200);
      await btn.click({ force: true });
      await sleep(2000);
      console.log(`[Reddit] Joined r/${subreddit}`);
      return true;
    }

    console.log(`[Reddit] Could not find join button for r/${subreddit} (may already be joined)`);
    return false;
  } catch (err) {
    console.warn(`[Reddit] joinSubreddit r/${subreddit} failed:`, (err as Error).message);
    return false;
  }
}

// --- Read subreddit rules before posting — returns rule summaries ---
export async function readSubredditRules(subreddit: string): Promise<string[]> {
  try {
    const page = await getPage();
    await page.goto(`https://old.reddit.com/r/${subreddit}/about/rules/`, { waitUntil: 'domcontentloaded' });
    await sleep(SLOW_WAIT);

    const rules = await page.evaluate(() => {
      const items = document.querySelectorAll('.rules-list li h4, .rule-title, .rules-list li p, .md p');
      return Array.from(items).map(el => (el.textContent || '').trim()).filter(Boolean).slice(0, 6);
    });

    // Simulate reading time proportional to rule count
    await sleep(2000 + rules.length * 800);
    if (rules.length > 0) console.log(`[Reddit] r/${subreddit} rules: ${rules.slice(0, 2).join(' | ')}`);
    return rules;
  } catch (err) {
    console.warn(`[Reddit] readSubredditRules r/${subreddit} failed:`, (err as Error).message);
    return [];
  }
}

// --- Upvote 1-3 existing comments in a thread (pre-comment warm-up) ---
export async function upvoteCommentsInThread(postUrl: string, count = 2): Promise<number> {
  let upvoted = 0;
  try {
    const page = await getPage();
    const oldUrl = postUrl.replace('www.reddit.com', 'old.reddit.com');
    await page.goto(oldUrl, { waitUntil: 'domcontentloaded' });
    await sleep(SLOW_WAIT);

    // Scroll through comments to trigger loading
    await page.evaluate(() => window.scrollBy({ top: 600, behavior: 'smooth' }));
    await sleep(1500);

    const arrows = await page.$$('.comment .arrow.up:not(.upmod)');
    const targets = arrows.slice(0, Math.min(count, arrows.length));
    for (const arrow of targets) {
      try {
        const visible = await arrow.isVisible().catch(() => false);
        if (!visible) continue;
        await arrow.scrollIntoViewIfNeeded();
        await randomDelay(400, 900);
        await arrow.click({ force: true });
        upvoted++;
        await randomDelay(800, 1800);
      } catch { /* continue */ }
    }
  } catch (err) {
    console.warn('[Reddit] upvoteCommentsInThread failed:', (err as Error).message);
  }
  return upvoted;
}

// --- Visit a Reddit user's profile (human-like pre-comment behavior) ---
export async function visitRedditAuthorProfile(username: string): Promise<void> {
  if (!username || username === 'Unknown' || username === '[deleted]') return;
  try {
    const page = await getPage();
    await page.goto(`https://old.reddit.com/user/${username}`, { waitUntil: 'domcontentloaded' });
    await sleep(3000 + Math.random() * 3000);
    await page.evaluate(() => window.scrollBy({ top: 500 + Math.random() * 400, behavior: 'smooth' }));
    await sleep(1500 + Math.random() * 1000);
  } catch (err) {
    console.warn(`[Reddit] visitAuthorProfile u/${username} failed:`, (err as Error).message);
  }
}

/**
 * Crosspost a Reddit post to a target subreddit.
 * This is Reddit's equivalent of a retweet — shares an existing post into a new community.
 *
 * Uses the old.reddit.com crosspost submission page which is more automation-friendly
 * than new Reddit. The post title is kept as-is; only the target subreddit changes.
 */
export async function crosspostRedditPost(
  postUrl: string,
  targetSubreddit: string,
): Promise<{ success: boolean; error?: string }> {
  // Validate subreddit name — must be alphanumeric + underscores, no spaces
  if (!targetSubreddit || /\s/.test(targetSubreddit) || !/^[a-zA-Z0-9_]+$/.test(targetSubreddit)) {
    return { success: false, error: `Invalid subreddit name: "${targetSubreddit}" (contains spaces or special characters)` };
  }

  const postId = postUrl.match(/comments\/([a-z0-9]+)/i)?.[1];
  if (!postId) return { success: false, error: 'Could not extract post ID from URL' };

  try {
    const page = await getPage();

    // Navigate to the crosspost submission page (t3_ = link/post type in Reddit's fullname system)
    await page.goto(
      `https://old.reddit.com/submit?crosspost_fullname=t3_${postId}`,
      { waitUntil: 'domcontentloaded' },
    );
    await sleep(2500 + Math.random() * 1500);

    // Confirm we're on the submit page and not redirected to login
    const url = page.url();
    if (url.includes('/login') || url.includes('/register')) {
      return { success: false, error: 'Redirected to login — session may be expired' };
    }

    // Fill the subreddit field
    const subInput = await page.$('#sr-autocomplete, input[name="sr"], input[placeholder*="subreddit" i]');
    if (!subInput) return { success: false, error: 'Subreddit input not found on crosspost page' };

    await subInput.click({ clickCount: 3 }); // select-all
    await sleep(200);
    await page.keyboard.type(targetSubreddit, { delay: 80 + Math.random() * 50 });
    await sleep(1200 + Math.random() * 500);

    // Dismiss autocomplete and confirm subreddit (Tab out of field)
    await page.keyboard.press('Tab');
    await sleep(600);

    // Simulate a human reading the page before submitting
    await sleep(3000 + Math.random() * 2000);

    // Click submit
    const submitBtn = await page.$('button[type="submit"].btn, #submit-text-toggle, button[type="submit"]');
    if (!submitBtn) return { success: false, error: 'Submit button not found on crosspost page' };

    await submitBtn.click();
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    await sleep(2000);

    const finalUrl = page.url();
    // Success = navigated to the new post page
    const isNewPost = finalUrl.includes('/comments/') &&
      !finalUrl.includes(`crosspost_fullname=t3_${postId}`);

    if (isNewPost) {
      console.log(`[Reddit] Crossposted to r/${targetSubreddit}: ${finalUrl}`);
      return { success: true };
    }

    // Check for error message on page
    const errorEl = await page.$('.error, .status-msg.bad');
    const errorText = errorEl ? await errorEl.textContent() : null;
    return {
      success: false,
      error: errorText?.trim() || `Crosspost may have failed — still on: ${finalUrl}`,
    };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
