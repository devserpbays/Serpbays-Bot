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

// --- Launch or reuse persistent browser context ---
async function getPage(): Promise<Page> {
  if (_page && !_page.isClosed()) return _page;

  const profileDir = _activeProfileDir;

  // Remove stale browser lock from previous crash
  try { unlinkSync(join(profileDir, 'SingletonLock')); } catch {}

  _context = await chromium.launchPersistentContext(profileDir, {
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
      await upBtn.click({ force: true });
      await sleep(2000);
      console.log('Upvoted post successfully');
      return true;
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
    await sleep(SLOW_WAIT);

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
