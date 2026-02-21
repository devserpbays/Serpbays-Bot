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
import { unlinkSync } from 'fs';

const PROFILE_DIR = join(process.cwd(), '.fb-profile');
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

// --- Launch or reuse persistent browser context ---
async function getPage(): Promise<Page> {
  if (_page && !_page.isClosed()) return _page;

  // Remove stale browser lock from previous crash
  try { unlinkSync(join(PROFILE_DIR, 'SingletonLock')); } catch {}

  _context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
  });

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

    console.warn('Facebook login state uncertain');
    return false;
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
    await sleep(2000);

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
    await sleep(SLOW_WAIT);

    // Scroll down a couple times to load more posts
    for (let i = 0; i < 3; i++) {
      await page.mouse.wheel(0, 1000);
      await sleep(1500);
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
      await page.mouse.wheel(0, 800);
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
          await sleep(2000);
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

// --- Validate comment text before posting ---
function isValidComment(text: string): boolean {
  if (!text || text.trim().length < 5) return false;
  if (text.trim().length > 500) return false;

  // Reject anything that looks like an error or code
  const errorPatterns = [
    /error/i,
    /Error:/,
    /ERR_/,
    /failed/i,
    /exception/i,
    /stack\s*trace/i,
    /undefined/i,
    /null/i,
    /NaN/,
    /\b(500|404|403|401|400)\b.*\b(status|code|error)\b/i,
    /at\s+\w+\s*\(/,           // stack trace lines
    /^\s*\{[\s\S]*\}\s*$/,     // raw JSON
    /^\s*\[[\s\S]*\]\s*$/,     // raw JSON array
    /TypeError|ReferenceError|SyntaxError/,
    /ECONNREFUSED|ETIMEDOUT|ENOTFOUND/,
    /Could not parse/i,
    /OpenClaw.*failed/i,
  ];

  for (const pattern of errorPatterns) {
    if (pattern.test(text)) return false;
  }

  return true;
}

// --- Post a comment on a Facebook post ---
export async function postComment(
  postUrl: string,
  comment: string
): Promise<boolean> {
  // Validate comment before attempting to post
  if (!isValidComment(comment)) {
    console.error('Invalid comment text (error/code detected), refusing to post:', comment.slice(0, 100));
    return false;
  }

  try {
    const page = await getPage();
    await page.goto(postUrl, { waitUntil: 'domcontentloaded' });
    await sleep(SLOW_WAIT);

    // Post may open in a modal — scroll down inside it to reveal comment box
    const modal = await page.$('[role="dialog"]');
    if (modal) {
      await page.evaluate(() => {
        const dialogs = document.querySelectorAll('[role="dialog"]');
        dialogs.forEach((d) => {
          const children = d.querySelectorAll('div');
          children.forEach((c) => {
            if (c.scrollHeight > c.clientHeight) {
              c.scrollTop = c.scrollHeight;
            }
          });
        });
      });
      await sleep(2000);
    }

    // Find comment box — try multiple selectors, check visibility
    const commentSelectors = [
      '[aria-label*="Comment as"]',
      '[aria-label="Write a comment"]',
      '[aria-label="Write a comment…"]',
      '[aria-label="Write a comment\u2026"]',
      'div[contenteditable="true"][role="textbox"]',
    ];

    let commentBox = null;
    for (const sel of commentSelectors) {
      const elements = await page.$$(sel);
      for (const el of elements) {
        if (await el.isVisible().catch(() => false)) {
          commentBox = el;
          break;
        }
      }
      if (commentBox) break;
    }

    // If not found, try clicking a "Comment" button to expand
    if (!commentBox) {
      const commentBtns = await page.$$('div[role="button"]');
      for (const btn of commentBtns) {
        const text = await btn.textContent().catch(() => '');
        if (text?.trim() === 'Comment') {
          await btn.click({ force: true });
          await sleep(2000);
          break;
        }
      }

      // Retry finding comment box
      for (const sel of commentSelectors) {
        const elements = await page.$$(sel);
        for (const el of elements) {
          if (await el.isVisible().catch(() => false)) {
            commentBox = el;
            break;
          }
        }
        if (commentBox) break;
      }
    }

    if (!commentBox) {
      console.error('Could not find comment input box on post:', postUrl);
      return false;
    }

    // Click to focus (force to bypass any overlay)
    await commentBox.click({ force: true });
    await sleep(1000);

    // Type the comment with human-like delay
    await page.keyboard.type(comment, { delay: 40 });
    await sleep(1000);

    // Submit with Enter
    await page.keyboard.press('Enter');
    await sleep(5000);

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
    } else {
      console.warn(`Comment may NOT have posted on: ${postUrl} (box not cleared, text not found in comments)`);
      // Save a screenshot for debugging
      await page.screenshot({ path: '/tmp/fb-post-failed.png', fullPage: false }).catch(() => {});
    }

    return posted;
  } catch (err) {
    console.error(`Failed to post comment on ${postUrl}:`, (err as Error).message);
    return false;
  }
}
