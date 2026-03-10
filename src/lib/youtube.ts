/**
 * YouTube Browser Automation via Playwright + Chromium
 *
 * Uses a persistent browser context so cookies survive between runs.
 * Profile data stored at: /var/www/ai-bot/bot-serp/.youtube-profile/
 */

import { chromium, type BrowserContext, type Page } from 'playwright';
import { join } from 'path';
import { unlinkSync, existsSync, readFileSync } from 'fs';

const NAVIGATION_TIMEOUT = 30000;
const SLOW_WAIT = 4000;

interface YouTubePost {
  url: string;
  author: string;
  content: string;
  platform: 'youtube';
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
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
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

// --- Check if logged in to YouTube ---
export async function ensureYouTubeLoggedIn(profileDir: string): Promise<boolean> {
  try {
    const page = await getPage(profileDir);
    await page.goto('https://www.youtube.com', { waitUntil: 'domcontentloaded' });
    await sleep(SLOW_WAIT);

    const url = page.url();
    if (url.includes('/signin') || url.includes('accounts.google.com')) {
      console.error('Not logged in to YouTube — redirected to sign-in.');
      return false;
    }

    // Check for avatar button (logged-in indicator)
    const loggedIn = await page
      .locator('#avatar-btn, yt-img-shadow#avatar, button[aria-label*="Account"], #avatar-btn yt-img-shadow')
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (loggedIn) return true;

    // Check for Sign In button (logged-out indicator)
    const hasSignIn = await page
      .locator('a[href*="signin"], yt-button-renderer:has-text("Sign in")')
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    if (hasSignIn) {
      console.error('Not logged in to YouTube — Sign in button visible.');
      return false;
    }

    // Fallback: body check
    const bodyText = await page.textContent('body').catch(() => '');
    const looksLoggedIn = bodyText && bodyText.length > 500 && !bodyText.includes('Sign in');
    if (looksLoggedIn) return true;

    console.warn('YouTube login state uncertain');
    return false;
  } catch (err) {
    console.error('Failed to check YouTube login:', (err as Error).message);
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

      // Look for channel link in navigation
      const channelLinks = document.querySelectorAll('a[href*="/channel/"], a[href*="/@"]');
      for (const link of channelLinks) {
        const href = link.getAttribute('href') || '';
        const handleMatch = href.match(/\/@([^/?]+)/);
        if (handleMatch) {
          username = handleMatch[1];
          break;
        }
      }

      // Try to get display name from account button
      const accountName = document.querySelector('#account-name, yt-formatted-string#account-name');
      if (accountName) {
        displayName = (accountName.textContent || '').trim();
      }

      return { username, displayName };
    }).catch(() => ({ username: '', displayName: '' }));

    const username = info.username || '';
    const accountId = username ? `yt_${username}` : `yt_${Date.now()}`;
    return { displayName: info.displayName || username, username, accountId };
  } catch {
    return { displayName: '', username: '', accountId: '' };
  }
}

// --- Scrape YouTube videos and community posts matching keywords ---
export async function scrapeYouTubeVideos(keywords: string[], profileDir: string): Promise<YouTubePost[]> {
  const posts: YouTubePost[] = [];

  for (const keyword of keywords) {
    try {
      const page = await getPage(profileDir);

      // Search for recent videos (sorted by upload date)
      const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(keyword)}&sp=EgIQAQ`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
      await sleep(SLOW_WAIT);

      // Scroll to load more results
      for (let i = 0; i < 2; i++) {
        await page.mouse.wheel(0, 800);
        await sleep(1500);
      }

      // Extract video cards
      const videoData = await page.evaluate(() => {
        const results: { url: string; title: string; channel: string }[] = [];
        const renderers = document.querySelectorAll('ytd-video-renderer, ytd-compact-video-renderer');

        for (const renderer of renderers) {
          const titleEl = renderer.querySelector('#video-title, a#video-title');
          const channelEl = renderer.querySelector('ytd-channel-name a, .ytd-channel-name a');
          const href = titleEl?.getAttribute('href') || '';

          if (!href.includes('/watch?v=')) continue;

          const title = (titleEl?.textContent || '').trim();
          const channel = (channelEl?.textContent || '').trim();

          if (title.length < 5) continue;

          results.push({
            url: href.startsWith('http') ? href : `https://www.youtube.com${href}`,
            title,
            channel,
          });
        }
        return results;
      }).catch(() => [] as { url: string; title: string; channel: string }[]);

      for (const v of videoData) {
        posts.push({
          url: v.url,
          author: v.channel || 'Unknown',
          content: v.title.slice(0, 2000),
          platform: 'youtube',
        });
      }

      // Also scrape community posts if any
      const communityUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(keyword)}`;
      await page.goto(communityUrl, { waitUntil: 'domcontentloaded' });
      await sleep(SLOW_WAIT);

      const communityData = await page.evaluate(() => {
        const results: { url: string; text: string; channel: string }[] = [];
        const postRenderers = document.querySelectorAll('ytd-post-renderer');

        for (const renderer of postRenderers) {
          const textEl = renderer.querySelector('#content-text, yt-formatted-string#content-text');
          const channelEl = renderer.querySelector('#author-text, a#author-text');
          const postLink = renderer.querySelector('a[href*="/post/"]');
          const href = postLink?.getAttribute('href') || '';

          const text = (textEl?.textContent || '').trim();
          const channel = (channelEl?.textContent || '').trim();

          if (text.length < 10 || !href) continue;

          results.push({
            url: href.startsWith('http') ? href : `https://www.youtube.com${href}`,
            text,
            channel,
          });
        }
        return results;
      }).catch(() => [] as { url: string; text: string; channel: string }[]);

      for (const cp of communityData) {
        posts.push({
          url: cp.url,
          author: cp.channel || 'Unknown',
          content: cp.text.slice(0, 2000),
          platform: 'youtube',
        });
      }

      await sleep(2000);
    } catch (err) {
      console.error(`Failed to search YouTube for "${keyword}":`, (err as Error).message);
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

// --- Post a comment on a YouTube video ---
export async function postYouTubeComment(videoUrl: string, comment: string, profileDir: string): Promise<{ success: boolean; error?: string }> {
  if (!comment || comment.trim().length < 5) {
    console.error('Invalid comment text, refusing to post.');
    return { success: false, error: 'Comment too short (less than 5 characters)' };
  }

  try {
    const page = await getPage(profileDir);
    await page.goto(videoUrl, { waitUntil: 'domcontentloaded' });
    await sleep(SLOW_WAIT);

    // Scroll down to the comment section
    await page.mouse.wheel(0, 600);
    await sleep(2000);

    // Click the comment box placeholder to activate it
    const placeholderSelectors = [
      '#placeholder-area',
      'ytd-comment-simplebox-renderer #placeholder-area',
      '[id="placeholder-area"]',
    ];

    let clicked = false;
    for (const sel of placeholderSelectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
        await el.click({ force: true });
        clicked = true;
        await sleep(1500);
        break;
      }
    }

    if (!clicked) {
      // Try scrolling more and clicking
      await page.mouse.wheel(0, 400);
      await sleep(1000);
      await page.locator('#placeholder-area').first().click({ force: true }).catch(() => {});
      await sleep(1500);
    }

    // Type the comment
    const editorSelectors = [
      '#contenteditable-root',
      'div[contenteditable="true"]#contenteditable-root',
      'yt-formatted-string[contenteditable="true"]',
    ];

    let editor = null;
    for (const sel of editorSelectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
        editor = el;
        break;
      }
    }

    if (!editor) {
      console.error('Could not find comment editor on:', videoUrl);
      await page.screenshot({ path: '/tmp/youtube-comment-failed.png', fullPage: false }).catch(() => {});
      return { success: false, error: 'Comment editor not found — video may have comments disabled, or login session expired' };
    }

    await editor.click({ force: true });
    await sleep(500);
    await page.keyboard.type(comment, { delay: 30 });
    await sleep(1000);

    // Click Submit button
    const submitSelectors = [
      '#submit-button',
      'yt-button-shape#submit-button button',
      'ytd-comment-simplebox-renderer #submit-button button',
    ];

    let submitted = false;
    for (const sel of submitSelectors) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await btn.click({ force: true });
        submitted = true;
        break;
      }
    }

    if (!submitted) {
      await page.keyboard.press('Control+Enter');
    }

    await sleep(4000);

    const pageText = await page.textContent('body').catch(() => '');
    const posted = pageText?.includes(comment.slice(0, 20)) ?? false;

    if (posted) {
      console.log(`YouTube comment posted successfully on: ${videoUrl}`);
      return { success: true };
    } else {
      console.warn(`YouTube comment may NOT have posted on: ${videoUrl}`);
      await page.screenshot({ path: '/tmp/youtube-post-failed.png', fullPage: false }).catch(() => {});
      return { success: false, error: 'Comment not confirmed on page — YouTube may have flagged it as spam or session expired' };
    }
  } catch (err) {
    const msg = (err as Error).message;
    console.error(`Failed to post YouTube comment on ${videoUrl}:`, msg);
    return { success: false, error: msg };
  }
}
