/**
 * YouTube Browser Automation via Playwright + Chromium
 *
 * Uses a persistent browser context so cookies survive between runs.
 * Profile data stored at: /var/www/ai-bot/bot-serp/.youtube-profile/
 */

import { chromium, type BrowserContext, type Page } from 'playwright';
import { join } from 'path';
import { unlinkSync, existsSync, readFileSync } from 'fs';
import { isValidComment } from './validateComment';
import { debugScreenshot } from './debugScreenshot';
import { buildLaunchArgs, randomTimezone, applyStealth, randomUserAgent, randomViewport } from './humanize';

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

  // Inject cookies from cookies.json — Google SSO requires cookies on BOTH domains
  // (.google.com for auth, .youtube.com for session). Duplicate auth cookies to both.
  const cookiesJsonPath = join(profileDir, 'cookies.json');
  if (existsSync(cookiesJsonPath)) {
    try {
      const savedCookies = JSON.parse(readFileSync(cookiesJsonPath, 'utf8'));
      if (Array.isArray(savedCookies) && savedCookies.length > 0) {
        const GOOGLE_AUTH_NAMES = new Set([
          'SID', 'HSID', 'SSID', 'APISID', 'SAPISID', 'NID',
          '__Secure-1PSID', '__Secure-3PSID', '__Secure-1PAPISID', '__Secure-3PAPISID',
          '__Secure-1PSIDTS', '__Secure-3PSIDTS', '__Secure-1PSIDCC', '__Secure-3PSIDCC',
          'SIDCC', '__Secure-ENID',
        ]);

        // Duplicate auth cookies to both .google.com and .youtube.com
        const expandedCookies: typeof savedCookies = [];
        for (const c of savedCookies) {
          expandedCookies.push(c);
          if (GOOGLE_AUTH_NAMES.has(c.name)) {
            // Add to .google.com if only on .youtube.com
            if (c.domain === '.youtube.com') {
              expandedCookies.push({ ...c, domain: '.google.com' });
            }
            // Add to .youtube.com if only on .google.com
            if (c.domain === '.google.com') {
              expandedCookies.push({ ...c, domain: '.youtube.com' });
            }
          }
        }
        await context.addCookies(expandedCookies);
        console.log(`[youtube] Loaded ${savedCookies.length} cookies (expanded to ${expandedCookies.length} with dual-domain auth)`);
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

      // Scroll to load more results — use JS scroll, not mouse.wheel
      await page.evaluate(() => window.scrollBy({ top: 800, behavior: 'smooth' }));
      await sleep(1800 + Math.random() * 800);
      await page.evaluate(() => window.scrollBy({ top: 600, behavior: 'smooth' }));
      await sleep(1200 + Math.random() * 600);

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

/**
 * Human-like typing: variable delay per character, occasional pauses mid-word.
 * Mimics real user typing rhythm to avoid automation detection.
 */
async function humanType(page: Page, text: string): Promise<void> {
  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    // Occasional typo: type wrong char, pause, backspace, retype (4% chance, not on spaces)
    if (char !== ' ' && Math.random() < 0.04) {
      const typoChar = 'qwertyuiopasdfghjklzxcvbnm'[Math.floor(Math.random() * 26)];
      await page.keyboard.type(typoChar);
      await sleep(120 + Math.random() * 180);
      await page.keyboard.press('Backspace');
      await sleep(80 + Math.random() * 100);
    }

    await page.keyboard.type(char);

    // Variable delay: punctuation = thinking pause, spaces = occasional pause, else normal typing
    if ('.!?,;:'.includes(char)) {
      await sleep(250 + Math.random() * 400);
    } else if (char === ' ' && Math.random() < 0.08) {
      await sleep(300 + Math.random() * 500);
    } else {
      const burst = Math.random() < 0.3;
      await sleep(burst ? 20 + Math.random() * 40 : 50 + Math.random() * 90);
    }
  }
}

/**
 * Smooth JS scroll — more natural than mouse.wheel which can look mechanical.
 */
async function smoothScroll(page: Page, targetY: number): Promise<void> {
  const steps = 5 + Math.floor(Math.random() * 4);
  const current = await page.evaluate(() => window.scrollY);
  const distance = targetY - current;
  for (let i = 1; i <= steps; i++) {
    const y = current + (distance * i) / steps;
    await page.evaluate((scrollY) => window.scrollTo({ top: scrollY, behavior: 'smooth' }), y);
    await sleep(150 + Math.random() * 200);
  }
}

// --- Post a comment on a YouTube video ---
export async function postYouTubeComment(videoUrl: string, comment: string, profileDir: string): Promise<{ success: boolean; error?: string }> {
  if (!isValidComment(comment)) {
    console.error('Invalid comment text (error/code detected), refusing to post:', comment.slice(0, 100));
    return { success: false, error: 'Invalid comment text detected (contains code/error patterns)' };
  }

  try {
    const page = await getPage(profileDir);
    await page.goto(videoUrl, { waitUntil: 'domcontentloaded' });

    // Simulate reading the video page for a realistic duration (8–18s)
    const readTime = 8000 + Math.random() * 10000;
    await sleep(readTime);

    // Scroll slowly through the video description (natural reading behavior)
    await smoothScroll(page, 300 + Math.random() * 100);
    await sleep(1500 + Math.random() * 1000);
    await smoothScroll(page, 650 + Math.random() * 150);
    await sleep(2000 + Math.random() * 1500);

    // Scroll past description to reveal comment section
    await smoothScroll(page, 950 + Math.random() * 100);
    await sleep(1500 + Math.random() * 1000);

    // Click the comment box placeholder to activate it
    const placeholderSelectors = [
      '#placeholder-area',
      'ytd-comment-simplebox-renderer #placeholder-area',
      '[id="placeholder-area"]',
    ];

    let clicked = false;
    for (const sel of placeholderSelectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 4000 }).catch(() => false)) {
        await el.click({ force: true });
        clicked = true;
        await sleep(1200 + Math.random() * 800);
        break;
      }
    }

    if (!clicked) {
      await smoothScroll(page, 1100);
      await sleep(1000);
      await page.locator('#placeholder-area').first().click({ force: true }).catch(() => {});
      await sleep(1200 + Math.random() * 800);
    }

    // Find comment editor
    const editorSelectors = [
      '#contenteditable-root',
      'div[contenteditable="true"]#contenteditable-root',
      'yt-formatted-string[contenteditable="true"]',
    ];

    let editor = null;
    for (const sel of editorSelectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 4000 }).catch(() => false)) {
        editor = el;
        break;
      }
    }

    if (!editor) {
      console.error('Could not find comment editor on:', videoUrl);
      await debugScreenshot(page, 'youtube', 'comment-failed');
      return { success: false, error: 'Comment editor not found — video may have comments disabled, or login session expired' };
    }

    await editor.click({ force: true });
    // Short pause before typing — humans don't start immediately
    await sleep(800 + Math.random() * 600);

    // Type with human-like rhythm
    await humanType(page, comment);

    // Pause to "review" what was typed (1.5–4s)
    await sleep(1500 + Math.random() * 2500);

    // Click Submit
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

    // Wait for comment to appear
    await sleep(5000 + Math.random() * 2000);

    const pageText = await page.textContent('body').catch(() => '');
    const posted = pageText?.includes(comment.slice(0, 20)) ?? false;

    if (posted) {
      console.log(`YouTube comment posted successfully on: ${videoUrl}`);
      return { success: true };
    } else {
      console.warn(`YouTube comment may NOT have posted on: ${videoUrl}`);
      await debugScreenshot(page, 'youtube', 'post-failed');
      return { success: false, error: 'Comment not confirmed on page — YouTube may have flagged it as spam or session expired' };
    }
  } catch (err) {
    const msg = (err as Error).message;
    console.error(`Failed to post YouTube comment on ${videoUrl}:`, msg);
    return { success: false, error: msg };
  }
}

// ─── Passive engagement ────────────────────────────────────────────────────────

/**
 * Like a YouTube video (thumbs up).
 */
export async function likeYouTubeVideo(
  videoUrl: string,
  profileDir: string
): Promise<{ success: boolean }> {
  try {
    const page = await getPage(profileDir);
    await page.goto(videoUrl, { waitUntil: 'domcontentloaded' });
    await sleep(SLOW_WAIT);

    await smoothScroll(page, 300);
    await sleep(1000 + Math.random() * 1000);

    const likeSelectors = [
      'button[aria-label*="like this video" i]',
      'ytd-toggle-button-renderer button[aria-label*="like" i]',
      '#top-level-buttons-computed ytd-toggle-button-renderer:first-child button',
      'yt-button-shape button[aria-label*="like" i]',
    ];

    for (const sel of likeSelectors) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
        const pressed = await btn.getAttribute('aria-pressed').catch(() => null);
        if (pressed === 'true') {
          console.log('[youtube] Video already liked');
          return { success: true };
        }
        const box = await btn.boundingBox();
        if (box) {
          // Use native mouse click — YouTube's React handlers need real events
          const cx = box.x + box.width / 2;
          const cy = box.y + box.height / 2;
          await page.mouse.move(cx, cy, { steps: 8 });
          await sleep(300 + Math.random() * 400);
          await page.mouse.click(cx, cy);
        } else {
          await btn.click();
        }
        await sleep(1500 + Math.random() * 1000);
        // Verify like registered
        const confirmed = await btn.getAttribute('aria-pressed').catch(() => null);
        if (confirmed === 'true') {
          console.log(`[youtube] Liked video (verified): ${videoUrl.slice(0, 60)}`);
          return { success: true };
        }
        console.warn(`[youtube] Like click did not register: ${videoUrl.slice(0, 60)}`);
        return { success: false };
      }
    }

    console.warn('[youtube] Like button not found on:', videoUrl);
    return { success: false };
  } catch (err) {
    console.error('[youtube] likeYouTubeVideo error:', (err as Error).message);
    return { success: false };
  }
}

/**
 * Subscribe to a YouTube channel from a video page.
 * Only subscribes if not already subscribed.
 */
export async function subscribeToChannel(
  videoUrl: string,
  profileDir: string
): Promise<{ success: boolean; alreadySubscribed?: boolean }> {
  try {
    const page = await getPage(profileDir);
    await page.goto(videoUrl, { waitUntil: 'domcontentloaded' });
    await sleep(SLOW_WAIT);

    await smoothScroll(page, 200);
    await sleep(1500 + Math.random() * 1500);

    // Find subscribe button — multiple selectors for different YouTube layouts
    const subSelectors = [
      'ytd-subscribe-button-renderer button',
      'yt-button-shape button[aria-label*="Subscribe" i]',
      '#subscribe-button button',
      'button[aria-label*="Subscribe to" i]',
      'tp-yt-paper-button[subscribed]',
    ];

    for (const sel of subSelectors) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Check if already subscribed
        const label = await btn.getAttribute('aria-label').catch(() => '') || '';
        const subscribed = await btn.getAttribute('subscribed').catch(() => null);
        const text = await btn.textContent().catch(() => '') || '';

        if (subscribed !== null || label.toLowerCase().includes('unsubscribe') || text.toLowerCase().includes('subscribed')) {
          console.log('[youtube] Already subscribed to this channel');
          return { success: true, alreadySubscribed: true };
        }

        // Human-like: move mouse to button, pause, native click
        const box = await btn.boundingBox();
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
          await sleep(400 + Math.random() * 600);
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        } else {
          await btn.click();
        }
        await sleep(2000 + Math.random() * 1500);

        // Verify subscription registered
        const postLabel = await btn.getAttribute('aria-label').catch(() => '') || '';
        const postText = await btn.textContent().catch(() => '') || '';
        const postSubscribed = await btn.getAttribute('subscribed').catch(() => null);
        if (postSubscribed !== null || postLabel.toLowerCase().includes('unsubscribe') || postText.toLowerCase().includes('subscribed')) {
          console.log(`[youtube] Subscribed to channel from: ${videoUrl.slice(0, 60)}`);
          return { success: true };
        }

        // Might show a confirmation dialog — dismiss it
        const confirmBtn = page.locator('button[aria-label*="Subscribe" i], yt-button-renderer button').first();
        if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await confirmBtn.click({ force: true }).catch(() => {});
          await sleep(1000);
        }

        console.log(`[youtube] Subscribed (unconfirmed) to channel from: ${videoUrl.slice(0, 60)}`);
        return { success: true };
      }
    }

    console.warn('[youtube] Subscribe button not found on:', videoUrl);
    return { success: false };
  } catch (err) {
    console.error('[youtube] subscribeToChannel error:', (err as Error).message);
    return { success: false };
  }
}

/**
 * Watch a YouTube video passively for a realistic duration, then optionally like it.
 * Does NOT comment — pure viewing simulation.
 *
 * @param videoUrl    Full YouTube video URL
 * @param profileDir  Playwright profile directory
 * @param watchMs     How long to "watch" (default: 2–4 min random)
 * @param andLike     Whether to like after watching (default: true)
 */
export async function watchAndLike(
  videoUrl: string,
  profileDir: string,
  watchMs?: number,
  andLike: boolean = true
): Promise<{ watched: boolean; liked: boolean }> {
  const ms = watchMs ?? (120_000 + Math.random() * 120_000); // 2–4 min
  let watched = false;
  let liked = false;

  try {
    const page = await getPage(profileDir);
    await page.goto(videoUrl, { waitUntil: 'domcontentloaded' });
    await sleep(3000 + Math.random() * 2000);

    // Dismiss consent/cookie dialogs
    for (const sel of ['button[aria-label*="Accept" i]', 'button[aria-label*="Agree" i]']) {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 1500 }).catch(() => false)) {
        await el.click({ force: true }).catch(() => {});
      }
    }

    // Scroll through description (reading simulation)
    await smoothScroll(page, 200 + Math.random() * 100);
    await sleep(2000 + Math.random() * 2000);
    await smoothScroll(page, 400 + Math.random() * 100);
    await sleep(1500 + Math.random() * 1500);
    await smoothScroll(page, 0);
    await sleep(1000);

    // "Watch" by waiting — split into chunks with occasional micro-scrolls
    const chunks = 4 + Math.floor(Math.random() * 3);
    const chunkMs = ms / chunks;
    for (let i = 0; i < chunks; i++) {
      await sleep(chunkMs);
      if (Math.random() < 0.4) {
        const scrollAmt = 150 + Math.random() * 200;
        await smoothScroll(page, scrollAmt);
        await sleep(2000 + Math.random() * 3000);
        await smoothScroll(page, 0);
      }
    }

    watched = true;
    console.log(`[youtube] Finished watching ${Math.round(ms / 1000)}s of: ${videoUrl}`);

    if (andLike) {
      const result = await likeYouTubeVideo(videoUrl, profileDir);
      liked = result.success;
    }
  } catch (err) {
    console.error('[youtube] watchAndLike error:', (err as Error).message);
  }

  return { watched, liked };
}

/**
 * Watch a YouTube Short — swipe-style viewing simulation.
 * Shorts are 15-60s vertical videos; watching them builds engagement signals.
 */
export async function watchShort(
  shortUrl: string,
  profileDir: string,
  andLike: boolean = true
): Promise<{ watched: boolean; liked: boolean }> {
  let watched = false;
  let liked = false;
  try {
    const page = await getPage(profileDir);
    await page.goto(shortUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(3000 + Math.random() * 2000);

    // Watch the Short for 8-30 seconds (realistic for short-form content)
    const watchMs = 8000 + Math.random() * 22000;
    await sleep(watchMs);
    watched = true;
    console.log(`[youtube] Watched Short ${Math.round(watchMs / 1000)}s: ${shortUrl.slice(0, 50)}`);

    if (andLike) {
      // Shorts like button — different selectors than regular videos
      const likeSelectors = [
        '#like-button button',
        'ytd-like-button-renderer button',
        'button[aria-label*="like" i]',
        '#segmented-like-button button',
        'like-button-view-model button',
      ];
      for (const sel of likeSelectors) {
        try {
          const btn = page.locator(sel).first();
          if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
            const pressed = await btn.getAttribute('aria-pressed').catch(() => null);
            if (pressed === 'true') { liked = true; break; }
            // Use native mouse click for Shorts like button
            const sBox = await btn.boundingBox();
            if (sBox) {
              await page.mouse.move(sBox.x + sBox.width / 2, sBox.y + sBox.height / 2, { steps: 6 });
              await sleep(200 + Math.random() * 300);
              await page.mouse.click(sBox.x + sBox.width / 2, sBox.y + sBox.height / 2);
            } else {
              await btn.click();
            }
            await sleep(1000 + Math.random() * 500);
            const shortConfirmed = await btn.getAttribute('aria-pressed').catch(() => null);
            if (shortConfirmed === 'true') {
              liked = true;
              console.log(`[youtube] Liked Short (verified): ${shortUrl.slice(0, 50)}`);
            } else {
              console.warn(`[youtube] Short like did not register: ${shortUrl.slice(0, 50)}`);
            }
            break;
          }
        } catch { /* try next */ }
      }
    }
  } catch (err) {
    console.error('[youtube] watchShort error:', (err as Error).message);
  }
  return { watched, liked };
}

/**
 * Browse YouTube Shorts feed — discover and watch Shorts by keyword.
 * Simulates a user scrolling through Shorts.
 */
export async function browseShorts(
  profileDir: string,
  keywords: string[],
  maxShorts: number = 3
): Promise<{ watched: number; liked: number; urls: string[]; likedUrls: string[] }> {
  let watched = 0;
  let liked = 0;
  const urls: string[] = [];
  const likedUrls: string[] = [];
  try {
    const page = await getPage(profileDir);

    // Search for keyword + "shorts" or go to Shorts feed
    const keyword = keywords[Math.floor(Math.random() * keywords.length)];
    const useSearch = Math.random() < 0.6; // 60% search, 40% browse feed

    if (useSearch && keyword) {
      await page.goto(`https://www.youtube.com/results?search_query=${encodeURIComponent(keyword)}&sp=EgIYAQ%253D%253D`, { waitUntil: 'domcontentloaded' });
    } else {
      await page.goto('https://www.youtube.com/shorts', { waitUntil: 'domcontentloaded' });
    }
    await sleep(3000 + Math.random() * 2000);

    // Scroll to load Shorts
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy({ top: 800, behavior: 'smooth' }));
      await sleep(1500 + Math.random() * 1000);
    }

    // Find Short links
    const shortLinks = await page.evaluate(() => {
      const links: string[] = [];
      const els = document.querySelectorAll('a[href*="/shorts/"]');
      for (const el of els) {
        const href = (el as HTMLAnchorElement).href;
        if (href && !links.includes(href)) links.push(href);
      }
      return links;
    }).catch(() => []);

    console.log(`[youtube] Found ${shortLinks.length} Shorts${useSearch ? ` for "${keyword}"` : ' on feed'}`);

    // Watch random selection
    const selected = shortLinks.sort(() => Math.random() - 0.5).slice(0, maxShorts);
    for (const shortUrl of selected) {
      const shouldLike = Math.random() < 0.5; // 50% like rate for Shorts
      const result = await watchShort(shortUrl, profileDir, shouldLike);
      if (result.watched) { watched++; urls.push(shortUrl); }
      if (result.liked) { liked++; likedUrls.push(shortUrl); }
      // Short pause between Shorts (like swiping)
      await sleep(1000 + Math.random() * 2000);
    }
  } catch (err) {
    console.error('[youtube] browseShorts error:', (err as Error).message);
  }
  return { watched, liked, urls, likedUrls };
}

/**
 * Browse the YouTube homepage, pick random videos, and watch them passively.
 * Does NOT comment — pure browse-and-watch simulation.
 */
export async function browseAndWatch(
  profileDir: string,
  maxVideos: number = 2
): Promise<{ watched: number }> {
  let watched = 0;

  try {
    const page = await getPage(profileDir);
    await page.goto('https://www.youtube.com', { waitUntil: 'domcontentloaded' });
    await sleep(3000 + Math.random() * 2000);

    for (let i = 0; i < 3; i++) {
      await smoothScroll(page, (i + 1) * 600);
      await sleep(1200 + Math.random() * 800);
    }

    const videoLinks: string[] = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a#video-title-link, ytd-rich-item-renderer a[href*="/watch?v="]'));
      return links
        .map(a => (a as HTMLAnchorElement).href)
        .filter(href => href && href.includes('/watch?v='))
        .slice(0, 10);
    }).catch(() => []);

    if (videoLinks.length === 0) {
      console.warn('[youtube] No videos found on home feed');
      return { watched: 0 };
    }

    const picks = [...videoLinks].sort(() => Math.random() - 0.5).slice(0, maxVideos);
    for (const url of picks) {
      const watchMs = 60_000 + Math.random() * 60_000; // 1–2 min browse watch
      const result = await watchAndLike(url, profileDir, watchMs, Math.random() > 0.5);
      if (result.watched) watched++;
      await sleep(3000 + Math.random() * 3000);
    }
  } catch (err) {
    console.error('[youtube] browseAndWatch error:', (err as Error).message);
  }

  return { watched };
}
