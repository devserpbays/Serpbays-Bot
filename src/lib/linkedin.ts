/**
 * LinkedIn Browser Automation via Playwright + Chromium
 *
 * Uses a persistent browser context so cookies survive between runs.
 * Profile data stored at: /var/www/ai-bot/bot-serp/.linkedin-profile/
 */

import { chromium, type BrowserContext, type Page } from 'playwright';
import { join } from 'path';
import { unlinkSync } from 'fs';

const PROFILE_DIR = join(process.cwd(), '.linkedin-profile');
const NAVIGATION_TIMEOUT = 30000;
const SLOW_WAIT = 4000;

interface LinkedInPost {
  url: string;
  author: string;
  content: string;
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

// --- Check if logged in to LinkedIn ---
export async function ensureLinkedInLoggedIn(): Promise<boolean> {
  try {
    const page = await getPage();
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded' });
    await sleep(SLOW_WAIT);

    const url = page.url();

    // If redirected to login page
    if (url.includes('/login') || url.includes('/authwall') || url.includes('/checkpoint')) {
      console.error('Not logged in to LinkedIn.');
      return false;
    }

    // Check for logged-in indicators
    const loggedIn = await page
      .locator('.feed-identity-module, .global-nav__me, [data-control-name="identity_welcome_message"], img.global-nav__me-photo')
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (loggedIn) {
      return true;
    }

    // Fallback: check for login form
    const hasLoginForm = await page
      .locator('input[name="session_key"], form.login__form, #username')
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    if (hasLoginForm) {
      console.error('Not logged in to LinkedIn — login form detected.');
      return false;
    }

    // Fallback: check page body
    const bodyText = await page.textContent('body').catch(() => '');
    const looksLoggedIn = bodyText && bodyText.length > 500 && !bodyText.includes('Sign in');
    if (looksLoggedIn) {
      return true;
    }

    console.warn('LinkedIn login state uncertain');
    return false;
  } catch (err) {
    console.error('Failed to check LinkedIn login:', (err as Error).message);
    return false;
  }
}

// --- Scrape profile identity from the already-loaded page ---
export async function scrapeProfileIdentity(): Promise<{ displayName: string; username: string; accountId: string }> {
  try {
    const page = await getPage();
    const info = await page.evaluate(() => {
      let name = '';
      let slug = '';
      const navImg = document.querySelector('.global-nav__me img, .global-nav__me-photo');
      if (navImg) {
        const alt = navImg.getAttribute('alt') || '';
        if (alt && alt.length > 1) name = alt;
      }
      if (!name) {
        const feedIdentity = document.querySelector('.feed-identity-module__actor-node, .feed-identity-module a');
        if (feedIdentity) {
          const text = (feedIdentity.textContent || '').trim();
          if (text && text.length > 1 && text.length < 60) name = text;
        }
      }
      const profileLink = document.querySelector('a[href*="/in/"]');
      if (profileLink) {
        const m = profileLink.getAttribute('href')?.match(/\/in\/([^/?]+)/);
        if (m) slug = m[1];
      }
      return { displayName: name, username: slug };
    }).catch(() => ({ displayName: '', username: '' }));

    const username = info.username || '';
    const accountId = username ? `li_${username}` : '';
    return { displayName: info.displayName, username, accountId };
  } catch {
    return { displayName: '', username: '', accountId: '' };
  }
}

// --- Scrape LinkedIn search results for posts matching keywords ---
export async function scrapeLinkedInPosts(
  keywords: string[]
): Promise<LinkedInPost[]> {
  const posts: LinkedInPost[] = [];

  for (const keyword of keywords) {
    try {
      const page = await getPage();
      const searchUrl = `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(keyword)}&sortBy=%22date_posted%22`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
      await sleep(SLOW_WAIT);

      // Scroll to load more results
      for (let i = 0; i < 3; i++) {
        await page.mouse.wheel(0, 1000);
        await sleep(1500);
      }

      // Extract post containers
      const postElements = await page.$$('.feed-shared-update-v2, .update-components-actor, div[data-urn*="activity"]');

      for (const el of postElements) {
        try {
          const text = (await el.textContent()) || '';
          if (text.length < 15) continue;

          // Extract post URL from activity URN or link
          let postUrl = '';
          const links = await el.$$('a[href*="/feed/update/"], a[href*="/posts/"]');
          for (const link of links) {
            const href = await link.getAttribute('href');
            if (href && (href.includes('/feed/update/') || href.includes('/posts/'))) {
              postUrl = href.startsWith('http') ? href : `https://www.linkedin.com${href}`;
              postUrl = postUrl.split('?')[0];
              break;
            }
          }

          // Try extracting from data-urn attribute
          if (!postUrl) {
            const urn = await el.getAttribute('data-urn').catch(() => null);
            if (urn) {
              const activityId = urn.split(':').pop();
              if (activityId) {
                postUrl = `https://www.linkedin.com/feed/update/urn:li:activity:${activityId}`;
              }
            }
          }

          if (!postUrl) continue;

          // Extract author
          let author = 'Unknown';
          const authorEl = await el.$('.update-components-actor__name span, .feed-shared-actor__name span, a.app-aware-link span');
          if (authorEl) {
            author = ((await authorEl.textContent()) || 'Unknown').trim();
          }

          posts.push({
            url: postUrl,
            author,
            content: text.slice(0, 2000),
          });
        } catch {
          // Individual post extraction failed, continue
        }
      }

      await sleep(2000);
    } catch (err) {
      console.error(`Failed to search LinkedIn for "${keyword}":`, (err as Error).message);
    }
  }

  // Deduplicate by URL
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
    await page.goto(postUrl, { waitUntil: 'domcontentloaded' });
    await sleep(SLOW_WAIT);

    // Scroll to load comments
    for (let i = 0; i < 3; i++) {
      await page.mouse.wheel(0, 800);
      await sleep(1500);
    }

    const snippet = commentText.slice(0, 25).toLowerCase();

    const result = await page.evaluate((snippet: string) => {
      const comments = document.querySelectorAll('.comments-comment-item, article.comments-comment-item');
      for (const comment of comments) {
        const text = (comment.textContent || '').toLowerCase();
        if (!text.includes(snippet)) continue;

        // Try to find reaction count
        const reactionBtn = comment.querySelector('button[aria-label*="reaction"], button[aria-label*="like"], .social-details-social-counts__reactions-count');
        let likes = 0;
        if (reactionBtn) {
          const label = reactionBtn.getAttribute('aria-label') || reactionBtn.textContent || '';
          const m = label.match(/(\d+)/);
          if (m) likes = parseInt(m[1], 10);
        }

        // Find replies to our comment
        const replyEls = comment.querySelectorAll('.comments-comment-item__reply, .replies-to-comment .comments-comment-item');
        const replyTexts: Array<{ author: string; content: string }> = [];
        replyEls.forEach(reply => {
          const authorEl = reply.querySelector('.comments-post-meta__name-text span, .update-components-actor__name span');
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

// --- Like a LinkedIn post (warm-up engagement) ---
export async function likeLinkedInPost(postUrl: string): Promise<boolean> {
  try {
    const page = await getPage();
    await page.goto(postUrl, { waitUntil: 'domcontentloaded' });
    await sleep(SLOW_WAIT);

    // LinkedIn Like button selectors
    const likeSelectors = [
      'button[aria-label*="Like"]',
      'button.react-button__trigger[aria-label*="Like"]',
      'span.react-button__text:has-text("Like")',
    ];

    for (const sel of likeSelectors) {
      const btns = await page.$$(sel);
      for (const btn of btns) {
        if (await btn.isVisible().catch(() => false)) {
          // Check if already liked
          const pressed = await btn.getAttribute('aria-pressed').catch(() => null);
          if (pressed === 'true') {
            console.log('Post already liked');
            return true;
          }
          const parentBtn = await btn.$('xpath=ancestor-or-self::button') || btn;
          await parentBtn.click({ force: true });
          await sleep(2000);
          console.log('Liked LinkedIn post successfully');
          return true;
        }
      }
    }

    console.warn('Could not find Like button on LinkedIn post');
    return false;
  } catch (err) {
    console.error('Failed to like LinkedIn post:', (err as Error).message);
    return false;
  }
}

// --- Validate comment text before posting ---
function isValidComment(text: string): boolean {
  if (!text || text.trim().length < 5) return false;
  if (text.trim().length > 500) return false;

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
    /at\s+\w+\s*\(/,
    /^\s*\{[\s\S]*\}\s*$/,
    /^\s*\[[\s\S]*\]\s*$/,
    /TypeError|ReferenceError|SyntaxError/,
    /ECONNREFUSED|ETIMEDOUT|ENOTFOUND/,
    /Could not parse/i,
  ];

  for (const pattern of errorPatterns) {
    if (pattern.test(text)) return false;
  }

  return true;
}

// --- Post a comment on a LinkedIn post ---
export async function postLinkedInComment(
  postUrl: string,
  comment: string
): Promise<boolean> {
  if (!isValidComment(comment)) {
    console.error('Invalid comment text (error/code detected), refusing to post:', comment.slice(0, 100));
    return false;
  }

  try {
    const page = await getPage();
    await page.goto(postUrl, { waitUntil: 'domcontentloaded' });
    await sleep(SLOW_WAIT);

    // Scroll to reveal comment section
    await page.mouse.wheel(0, 400);
    await sleep(2000);

    // Click the "Comment" button to open comment box if needed
    const commentBtns = await page.$$('button.comment-button, button[aria-label*="Comment"], button:has-text("Comment"), span.comment-button__text');
    for (const btn of commentBtns) {
      const text = await btn.textContent().catch(() => '');
      if (text && /comment/i.test(text.trim())) {
        await btn.click({ force: true });
        await sleep(2000);
        break;
      }
    }

    // Find comment box
    const commentSelectors = [
      '.ql-editor[contenteditable="true"]',
      'div[role="textbox"][contenteditable="true"]',
      'div[data-placeholder*="comment" i][contenteditable="true"]',
      'div.comments-comment-box__form div[contenteditable="true"]',
      'div[contenteditable="true"]',
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

    if (!commentBox) {
      console.error('Could not find comment input box on post:', postUrl);
      await page.screenshot({ path: '/tmp/linkedin-comment-failed.png', fullPage: false }).catch(() => {});
      return false;
    }

    // Click to focus
    await commentBox.click({ force: true });
    await sleep(1000);

    // Type the comment with human-like delay
    await page.keyboard.type(comment, { delay: 40 });
    await sleep(1000);

    // Find and click submit button
    const submitSelectors = [
      'button.comments-comment-box__submit-button',
      'button[type="submit"]:has-text("Post")',
      'button:has-text("Post")',
      'button[aria-label*="Post comment"]',
    ];

    let submitted = false;
    for (const sel of submitSelectors) {
      const btns = await page.$$(sel);
      for (const btn of btns) {
        if (await btn.isVisible().catch(() => false)) {
          const isDisabled = await btn.getAttribute('disabled').catch(() => null);
          if (isDisabled === null) {
            await btn.click({ force: true });
            submitted = true;
            break;
          }
        }
      }
      if (submitted) break;
    }

    if (!submitted) {
      // Try Enter as fallback (LinkedIn uses Enter to submit in some UIs)
      await page.keyboard.press('Control+Enter');
    }

    await sleep(5000);

    // Verify: check if comment appears on the page
    const pageText = await page.textContent('body').catch(() => '');
    const posted = pageText?.includes(comment.slice(0, 30)) ?? false;

    if (posted) {
      console.log(`Comment posted successfully on: ${postUrl}`);
    } else {
      console.warn(`Comment may NOT have posted on: ${postUrl}`);
      await page.screenshot({ path: '/tmp/linkedin-post-failed.png', fullPage: false }).catch(() => {});
    }

    return posted;
  } catch (err) {
    console.error(`Failed to post comment on ${postUrl}:`, (err as Error).message);
    return false;
  }
}
