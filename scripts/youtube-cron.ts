/**
 * YouTube Auto-Commenter Cron Script
 *
 * Searches YouTube for keyword-matching videos, evaluates them with AI,
 * and auto-posts comments on high-scoring videos.
 *
 * Schedule: every 15 minutes via node-cron in server.js
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

const CRON_USER_ID = process.env.CRON_USER_ID;

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { connectDB } from '../src/lib/mongodb';
import { evaluatePost, askOpenClaw } from '../src/lib/openclaw';
import { isWithinSchedule, getTodayStartUTC } from '../src/lib/schedule';
import { logActivity, notifyAuthError } from '../src/lib/activityLog';
import Post from '../src/models/Post';
import Settings from '../src/models/Settings';
import { getAccountAge, capCooldown, jitterCooldown } from '../src/lib/antiBan';
import BrowserCookie from '../src/models/BrowserCookie';
import { getActivityProfile } from '../src/lib/accountHealth';
import { likeYouTubeVideo, subscribeToChannel, browseShorts } from '../src/lib/youtube';

if (CRON_USER_ID && !process.env.YOUTUBE_PROFILE_DIR) {
  console.log('No YouTube account connected for this user, skipping.');
  process.exit(0);
}
const PROFILE_DIR = process.env.YOUTUBE_PROFILE_DIR
  ? join(process.cwd(), process.env.YOUTUBE_PROFILE_DIR)
  : join(process.cwd(), '.youtube-profile');
const VERIFIED_FILE = join(PROFILE_DIR, '.verified');
const NAVIGATION_TIMEOUT = 30000;
const SLOW_WAIT = 4000;

const DEFAULT_DAILY_LIMIT = 5;           // 2-5 comments/day — balanced for engagement without flagging
const DEFAULT_AUTO_POST_THRESHOLD = 75;  // Higher threshold = only comment on very relevant videos

let _ctx: BrowserContext | null = null;
let _page: Page | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function getVerifiedData(): Record<string, string> {
  try {
    return JSON.parse(readFileSync(VERIFIED_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function getCurrentAccountId(): string {
  return getVerifiedData().accountId || 'youtube';
}


async function getPage(): Promise<Page> {
  if (_page && !_page.isClosed()) return _page;

  // Kill orphaned Chromium processes and clear lock files so the profile is free
  try { execSync(`pkill -f "${PROFILE_DIR}" 2>/dev/null || true`, { stdio: 'ignore' }); } catch {}
  await new Promise(r => setTimeout(r, 500));
  try { require('fs').unlinkSync(join(PROFILE_DIR, 'SingletonLock')); } catch {}
  try { require('fs').unlinkSync('/root/snap/chromium/common/chromium/SingletonLock'); } catch {}

  // Use persistent context — preserves localStorage, IndexedDB, service workers
  // so Google/YouTube sees the same "device" on every run → sessions last weeks not hours
  _ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
    ],
    // Windows UA — Linux is a strong bot signal to Google's detection systems
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
  });

  // Inject cookies from cookies.json if available (written by worker after validation)
  const cookiesJsonPath = join(PROFILE_DIR, 'cookies.json');
  if (existsSync(cookiesJsonPath)) {
    try {
      const savedCookies = JSON.parse(readFileSync(cookiesJsonPath, 'utf8'));
      if (Array.isArray(savedCookies) && savedCookies.length > 0) {
        // Normalize sameSite for Playwright (expects Strict|Lax|None)
        const normalized = savedCookies.map((c: Record<string, unknown>) => {
          const ss = String(c.sameSite || 'Lax').toLowerCase();
          const sameSite = ss === 'no_restriction' || ss === 'none' ? 'None'
            : ss === 'strict' ? 'Strict' : 'Lax';
          return {
            name: String(c.name),
            value: String(c.value),
            domain: String(c.domain),
            path: String(c.path || '/'),
            expires: Math.floor(Number(c.expirationDate || c.expires || 0)) || undefined,
            secure: c.secure !== false,
            httpOnly: !!c.httpOnly,
            sameSite: sameSite as 'Strict' | 'Lax' | 'None',
          };
        });
        await _ctx.addCookies(normalized);
      }
    } catch (e) {
      console.error('Failed to load cookies.json:', (e as Error).message);
    }
  }

  _page = _ctx.pages()[0] || (await _ctx.newPage());
  _page.setDefaultTimeout(NAVIGATION_TIMEOUT);
  return _page;
}

async function closeBrowser(): Promise<void> {
  if (_ctx) {
    await _ctx.close().catch(() => {});
    _ctx = null;
    _page = null;
  }
}

async function ensureYouTubeLoggedIn(): Promise<boolean> {
  try {
    const page = await getPage();
    await page.goto('https://www.youtube.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(SLOW_WAIT + 2000); // Extra wait for YouTube SPA to render

    const url = page.url();
    console.log('[YT Login] URL:', url);
    if (url.includes('/signin') || url.includes('accounts.google.com')) {
      console.log('[YT Login] Redirected to login page');
      await page.screenshot({ path: '/tmp/yt-login-check.png', fullPage: false }).catch(() => {});
      return false;
    }

    // Check for avatar button — definitive logged-in indicator
    const avatar = await page.$('#avatar-btn, ytd-masthead #avatar-btn, button#avatar-btn, img#avatar-btn').catch(() => null);
    if (avatar && await avatar.isVisible().catch(() => false)) {
      console.log('[YT Login] Avatar found — logged in');
      return true;
    }

    // Check for "Sign in" button only in the masthead/header
    const hasSignIn = await page.evaluate(() => {
      const header = document.querySelector('ytd-masthead, #masthead, #page-header');
      if (!header) return false;
      const els = header.querySelectorAll('a, button, yt-button-renderer, ytd-button-renderer');
      for (const el of els) {
        const text = (el.textContent || '').trim().toLowerCase();
        if (text === 'sign in') return true;
      }
      return false;
    }).catch(() => false);

    if (hasSignIn) {
      console.log('[YT Login] Sign in button found in header — not logged in');
      await page.screenshot({ path: '/tmp/yt-login-check.png', fullPage: false }).catch(() => {});
      return false;
    }

    // Fallback: check page body length + cookies
    const bodyLen = await page.evaluate(() => document.body?.textContent?.length ?? 0).catch(() => 0);
    const cookies = await page.context().cookies('https://www.youtube.com');
    const hasSID = cookies.some(c => c.name === 'SID' || c.name === '__Secure-1PSID' || c.name === 'LOGIN_INFO');
    console.log(`[YT Login] Body length: ${bodyLen}, Has SID/LOGIN_INFO: ${hasSID}`);

    if (hasSID && bodyLen > 500) {
      console.log('[YT Login] Session cookies present + content loaded — assuming logged in');
      return true;
    }

    await page.screenshot({ path: '/tmp/yt-login-check.png', fullPage: false }).catch(() => {});
    console.log('[YT Login] Uncertain state — saved screenshot to /tmp/yt-login-check.png');
    return bodyLen > 1000; // If substantial content loaded, probably logged in
  } catch (err) {
    console.error('YouTube login check failed:', (err as Error).message);
    return false;
  }
}

async function scrapeYouTubeVideos(keywords: string[]): Promise<Array<{ url: string; author: string; content: string }>> {
  const results: Array<{ url: string; author: string; content: string }> = [];
  const page = await getPage();

  for (const keyword of keywords.slice(0, 3)) {
    try {
      const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(keyword)}`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
      await sleep(SLOW_WAIT);

      // Extract video links and titles
      const videos = await page.$$eval(
        'a#video-title',
        (links) => links.slice(0, 10).map(a => ({
          href: (a as HTMLAnchorElement).href,
          title: (a as HTMLAnchorElement).getAttribute('title') || a.textContent?.trim() || '',
        }))
      ).catch(() => [] as Array<{ href: string; title: string }>);

      for (const video of videos) {
        if (video.href && video.href.includes('/watch?v=') && !results.find(r => r.url === video.href)) {
          results.push({
            url: video.href,
            author: 'youtube_creator',
            content: video.title || keyword,
          });
        }
      }

      console.log(`  YouTube "${keyword}": found ${videos.length} videos`);
    } catch (err) {
      console.error(`  Error scraping YouTube for "${keyword}":`, (err as Error).message);
    }
    // Longer random gap between keyword searches — avoids rapid-fire search patterns
    await sleep(4000 + Math.random() * 4000);
  }

  return results;
}

async function postYouTubeComment(videoUrl: string, comment: string): Promise<{ success: boolean; error?: string }> {
  const page = await getPage();
  try {
    await page.goto(videoUrl, { waitUntil: 'domcontentloaded' });
    await sleep(SLOW_WAIT);

    // Scroll down to reveal comment section
    await page.evaluate(() => window.scrollTo(0, 500));
    await sleep(2000);
    await page.evaluate(() => window.scrollTo(0, 900));
    await sleep(2000);

    // If page shows "Sign in" in the comment area, cookies are expired — abort
    const needsSignIn = await page.evaluate(() => {
      const el = document.querySelector('ytd-comment-simplebox-renderer, #comment-teaser');
      return !el || (el.textContent || '').toLowerCase().includes('sign in');
    }).catch(() => false);
    if (needsSignIn) {
      console.error('  YouTube not logged in — "Sign in" prompt in comment section. Refresh cookies via dashboard.');
      return { success: false, error: 'Not logged in — "Sign in" prompt detected in comment section. Re-set cookies from dashboard.' };
    }

    // Click on the comment box placeholder
    const commentPlaceholder = await page.$('#simplebox-placeholder, ytd-comment-simplebox-renderer #simplebox-placeholder').catch(() => null);
    if (commentPlaceholder && await commentPlaceholder.isVisible().catch(() => false)) {
      await commentPlaceholder.click();
      await sleep(2000);
    }

    // Find actual editable comment box
    const commentSelectors = [
      '#contenteditable-root',
      'div#contenteditable-root[contenteditable="true"]',
      'ytd-comment-simplebox-renderer div[contenteditable="true"]',
    ];

    let commentBox = null;
    for (const sel of commentSelectors) {
      const el = await page.$(sel).catch(() => null);
      if (el && await el.isVisible().catch(() => false)) {
        commentBox = el;
        break;
      }
    }

    if (!commentBox) {
      console.log('  No comment box found on video');
      return { success: false, error: 'Comment box not found — video may have comments disabled, or login session expired' };
    }

    await commentBox.click();
    // Realistic pause before typing — humans don't start immediately
    await sleep(900 + Math.random() * 700);
    // Human-like typing: variable delay per character, occasional mid-sentence pauses
    for (let i = 0; i < comment.length; i++) {
      await commentBox.type(comment[i]);
      const isPause = comment[i] === ',' || comment[i] === '.' || (Math.random() < 0.04);
      await sleep(isPause ? 350 + Math.random() * 300 : 65 + Math.random() * 110);
    }
    // Pause to "review" before submitting
    await sleep(2000 + Math.random() * 2000);

    // Click submit button
    const submitBtn = await page.$('#submit-button, ytd-button-renderer#submit-button button').catch(() => null);
    if (submitBtn && await submitBtn.isVisible().catch(() => false)) {
      await submitBtn.click();
    } else {
      await page.keyboard.press('Control+Enter');
    }
    await sleep(3000);

    return { success: true };
  } catch (err) {
    const msg = (err as Error).message;
    console.error('  YouTube comment error:', msg);
    return { success: false, error: msg };
  }
}

async function generateYouTubeComment(
  postContent: string,
  companyName: string,
  companyDescription: string,
  brandMentionRate = 25
): Promise<string> {
  const randomSeed = Math.floor(Math.random() * 1000);

  // Gradual brand introduction: 0% for first 30 comments, then slowly ramp up
  // 30-40 comments: 5%, 40-60: 10%, 60-80: 15%, 80+: configured rate (default 25%)
  const totalPosted = await Post.countDocuments({
    platform: 'youtube', status: 'posted',
    ...(CRON_USER_ID && { userId: CRON_USER_ID }),
  });

  let effectiveBrandRate = 0;
  if (totalPosted >= 30)      effectiveBrandRate = brandMentionRate;      // full configured rate
  else if (totalPosted >= 20) effectiveBrandRate = Math.min(brandMentionRate, 15);
  else if (totalPosted >= 10) effectiveBrandRate = Math.min(brandMentionRate, 8);
  else if (totalPosted >= 5)  effectiveBrandRate = Math.min(brandMentionRate, 3);
  // else: 0% — pure knowledge sharing for first 5 comments

  const mentionBrand = effectiveBrandRate > 0 && Math.random() < (effectiveBrandRate / 100);
  if (totalPosted < 30) {
    console.log(`[Comment] Pure knowledge mode (${totalPosted}/30 comments before brand mentions start)`);
  } else if (mentionBrand) {
    console.log(`[Comment] Brand mention this run (${effectiveBrandRate}% rate at ${totalPosted} total comments)`);
  }
  // Pure knowledge styles (first 30 comments, and most comments after)
  const knowledgeStyles = [
    { style: 'share a practical tip or lesser-known fact related to the video topic — something most people overlook', weight: 25 },
    { style: 'ask a genuinely curious follow-up question that shows you watched the video carefully', weight: 20 },
    { style: 'share a brief personal experience or lesson learned that adds to what the video covered', weight: 20 },
    { style: 'add a useful piece of information that complements the video — like a related concept, tool category, or technique', weight: 20 },
    { style: 'agree with a specific point and explain why from your own experience — be specific, not generic', weight: 15 },
  ];

  // Brand-aware styles (rare, after 30+ comments — brand is background context, not a pitch)
  const brandStyles = [
    { style: `share a genuine insight from your experience, and casually mention you've worked with ${companyName} in this space — the insight must stand on its own`, weight: 40 },
    { style: `add a helpful observation and reference ${companyName} as context for how you know this — NOT as a recommendation, just background`, weight: 30 },
    { style: `share something you learned in this field (background: ${companyDescription}) — mention ${companyName} only as a passing detail, the value is in the knowledge`, weight: 30 },
  ];

  const stylePool = mentionBrand ? brandStyles : knowledgeStyles;
  const totalW = stylePool.reduce((s, x) => s + x.weight, 0);
  let rw = Math.random() * totalW;
  let chosenStyle = stylePool[0].style;
  for (const s of stylePool) { rw -= s.weight; if (rw <= 0) { chosenStyle = s.style; break; } }

  const brandRule = mentionBrand
    ? `- You work in ${companyDescription}. If mentioning ${companyName}, keep it to 3-4 words max as passing context — "from my time at ${companyName}" or "we saw this at ${companyName} too". 90%+ of the comment is knowledge, brand is just a detail.\n- DO NOT pitch, recommend, or call-to-action for ${companyName}`
    : '- NEVER mention any company, brand, product, or service by name — share pure knowledge only';

  const prompt = `You are a regular person watching a YouTube video. You know about ${companyDescription || 'this topic'} from personal experience.

VIDEO:
"""
${postContent.slice(0, 400)}
"""

YOUR TASK: Write a comment (1-2 casual sentences) that ${chosenStyle}.

RULES — READ CAREFULLY:
- Write ONLY the comment. No intro, no label, no "Here's my comment:"
- Write like a real person typing on their phone — casual, direct, maybe imperfect
- Use contractions: "it's", "I've", "doesn't", "that's", "you're"
${brandRule}
- DO NOT say "check out X", "highly recommend", "X is great for", or anything promotional
- DO NOT include URLs, domains, @ handles, or hashtags
- DO NOT start with "Great video", "Love this", "Amazing content", "This is so helpful"
- The comment should teach something, share an insight, or ask something smart
- Keep it to 1-2 sentences — short and punchy, like a real YouTube comment
- Seed: ${randomSeed}

Write the comment now:`;

  try {
    const raw = await askOpenClaw(prompt);
    let comment = raw;

    if (comment.trimStart().startsWith('{')) {
      try {
        const parsed = JSON.parse(comment);
        comment = parsed?.payloads?.[0]?.text || parsed?.content || parsed?.message || '';
      } catch {
        const m = comment.match(/"text"\s*:\s*"([^"]+)"/);
        if (m) comment = m[1];
      }
    }

    comment = comment
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/^(Comment|Reply|Response|Here'?s?\s*(the|my|a)?\s*(comment|reply)?:?\s*)/i, '')
      .replace(/https?:\/\/\S+/gi, '')
      .replace(new RegExp(companyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\.com', 'gi'), companyName)
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (comment.length > 500) comment = comment.slice(0, 497) + '...';
    return comment;
  } catch (err) {
    console.error('Failed to generate YouTube comment:', (err as Error).message);
    return '';
  }
}

// ─── Human browsing helpers ────────────────────────────────────────────────────

/** Smooth-scroll the page in small increments to mimic a real trackpad/wheel */
async function smoothScroll(page: Page, targetY: number): Promise<void> {
  const steps = 6 + Math.floor(Math.random() * 4);
  const step = targetY / steps;
  for (let i = 0; i < steps; i++) {
    await page.evaluate((s: number) => window.scrollBy({ top: s, behavior: 'smooth' }), step);
    await sleep(100 + Math.random() * 180);
  }
}

/**
 * Visit a single YouTube video URL, "watch" it for watchMs milliseconds,
 * optionally like it, then return.
 * Uses the cron's own persistent browser context — no new sessions opened.
 */
async function humanWatchVideo(
  url: string,
  watchMs: number,
  andLike: boolean,
): Promise<{ watched: boolean; liked: boolean }> {
  let watched = false;
  let liked = false;
  try {
    const page = await getPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await sleep(3000 + Math.random() * 2000);

    // Dismiss consent dialogs silently
    for (const sel of ['button[aria-label*="Accept" i]', 'button[aria-label*="Agree" i]']) {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 1500 }).catch(() => false)) {
        await el.click({ force: true }).catch(() => {});
      }
    }

    // Scroll through description & related videos (reading simulation)
    await smoothScroll(page, 300 + Math.random() * 100);
    await sleep(2000 + Math.random() * 2000);
    await smoothScroll(page, 250 + Math.random() * 100);
    await sleep(1500 + Math.random() * 1000);
    await smoothScroll(page, 0); // scroll back to top (like re-focusing on the video)
    await sleep(1000);

    // Simulate "watching" in time-sliced chunks with occasional micro-scrolls
    const chunks = 3 + Math.floor(Math.random() * 4);
    const chunkMs = watchMs / chunks;
    for (let i = 0; i < chunks; i++) {
      await sleep(chunkMs);
      if (Math.random() < 0.35) {
        await smoothScroll(page, 120 + Math.random() * 200);
        await sleep(1200 + Math.random() * 2000);
        await smoothScroll(page, 0);
      }
    }
    watched = true;

    // Like the video (human-like mouse movement to button before clicking)
    if (andLike) {
      const likeSelectors = [
        '#segmented-like-button button',
        '#like-button button',
        'yt-button-shape[id="like-button"] button',
        'button[aria-label*="like this video" i]',
        'button[aria-label*="I like this" i]',
        'ytd-toggle-button-renderer button[aria-label*="like" i]',
        '#top-level-buttons-computed ytd-toggle-button-renderer:first-child button',
        'yt-button-shape button[aria-label*="like" i]',
      ];
      for (const sel of likeSelectors) {
        const btn = page.locator(sel).first();
        if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
          const pressed = await btn.getAttribute('aria-pressed').catch(() => null);
          if (pressed !== 'true') {
            const box = await btn.boundingBox();
            if (box) {
              await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
            }
            await sleep(300 + Math.random() * 400);
            await btn.click({ force: true });
            liked = true;
          }
          break;
        }
      }
    }
  } catch (e) {
    console.warn('[browse] watchVideo error (non-fatal):', (e as Error).message);
  }
  return { watched, liked };
}

/**
 * Browse the YouTube home feed and watch N videos with human-like behavior.
 * Runs on EVERY cron session — longer during browse-only warmup, shorter before commenting.
 *
 * @param numVideos  Number of home-feed videos to watch (2–3 normal, 4–6 warmup)
 */
async function humanBrowseFeed(numVideos: number): Promise<void> {
  console.log(`[Browse] Starting human feed session — targeting ${numVideos} video(s)...`);
  try {
    const page = await getPage();

    // Land on homepage
    await page.goto('https://www.youtube.com', { waitUntil: 'domcontentloaded' });
    await sleep(3000 + Math.random() * 2000);

    // Slow scroll through the home feed (simulates scanning thumbnails)
    for (let i = 0; i < 6; i++) {
      await smoothScroll(page, (i + 1) * 450);
      await sleep(900 + Math.random() * 800);
    }
    // Scroll back up — humans do this
    await smoothScroll(page, 0);
    await sleep(1500 + Math.random() * 1000);

    // Gather feed video links
    const feedLinks: string[] = await page.evaluate(() => {
      const els = document.querySelectorAll(
        'a#video-title-link, ytd-rich-item-renderer a[href*="/watch?v="]'
      );
      return Array.from(els)
        .map(a => (a as HTMLAnchorElement).href)
        .filter(h => h && h.includes('/watch?v='))
        .slice(0, 20);
    }).catch(() => []);

    if (feedLinks.length === 0) {
      console.warn('[Browse] No videos found on home feed — skipping browse session');
      return;
    }

    // Shuffle and pick
    const picks = [...feedLinks].sort(() => Math.random() - 0.5).slice(0, numVideos);
    let totalWatched = 0;
    let totalLiked = 0;

    for (const url of picks) {
      const watchMs = 75_000 + Math.random() * 105_000; // 75–180s per video
      const andLike = Math.random() < 0.45;             // Like ~45% of videos
      const { watched, liked } = await humanWatchVideo(url, watchMs, andLike);
      if (watched) totalWatched++;
      if (liked) totalLiked++;

      console.log(
        `[Browse] Watched ${Math.round(watchMs / 1000)}s · liked: ${liked} · ${url.slice(0, 70)}...`
      );

      // Return to homepage between videos (like a real user picking the next video)
      if (url !== picks[picks.length - 1]) {
        await page.goto('https://www.youtube.com', { waitUntil: 'domcontentloaded' });
        await sleep(2000 + Math.random() * 3000);
        for (let i = 0; i < 2; i++) {
          await smoothScroll(page, 300 + Math.random() * 250);
          await sleep(700 + Math.random() * 600);
        }
      }
    }

    console.log(`[Browse] Session done — watched: ${totalWatched}, liked: ${totalLiked}`);
    if (CRON_USER_ID) {
      await logActivity(CRON_USER_ID, 'youtube', 'info', 'browse_feed',
        `Human feed session: watched ${totalWatched} video(s), liked ${totalLiked}`,
        { watched: totalWatched, liked: totalLiked, target: numVideos },
      );
    }
  } catch (e) {
    console.warn('[Browse] Feed browse error (non-critical):', (e as Error).message);
  }
}

// ─── YouTube-specific daily limit ramp ────────────────────────────────────────
// More conservative than the generic warmup — YouTube's detection is aggressive.
// Days 0–2:   0 comments  (browse-only; account must look naturally active first)
// Days 2–7:   1 comment/day
// Days 7–14:  2 comments/day
// Days 14–30: 3 comments/day
// Days 30+:   configured limit (capped at platform ceiling of 5)
const YOUTUBE_MAX_DAILY = 5;

function getYouTubeDailyLimit(
  configuredLimit: number,
  accountAddedAt: string | undefined,
): number {
  const cap = Math.min(configuredLimit, YOUTUBE_MAX_DAILY);
  if (!accountAddedAt) return 1; // no date = safe default 1/day
  const ageDays = (Date.now() - new Date(accountAddedAt).getTime()) / 86_400_000;
  if (ageDays < 2)  return 0;                   // browse-only period
  if (ageDays < 5)  return 2;                   // early: 2/day
  if (ageDays < 10) return Math.min(cap, 3);    // building: 3/day
  if (ageDays < 20) return Math.min(cap, 4);    // established: 4/day
  return cap;                                    // mature: full configured limit (up to 5)
}

async function getTodayCommentCount(accountId: string, timezone = 'UTC'): Promise<number> {
  const startOfDayUTC = getTodayStartUTC(timezone);

  const query: Record<string, unknown> = {
    platform: 'youtube',
    status: 'posted',
    postedAt: { $gte: startOfDayUTC },
  };
  if (accountId) query.postedByAccount = accountId;
  if (CRON_USER_ID) query.userId = CRON_USER_ID;
  return Post.countDocuments(query);
}

async function main() {
  console.log(`[${new Date().toISOString()}] YouTube Cron: starting (user: ${CRON_USER_ID || 'default'})`);
  if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'youtube', 'info', 'cron_start', 'YouTube cron started');

  await connectDB();

  const settings = await Settings.findOne(CRON_USER_ID ? { userId: CRON_USER_ID } : {});
  if (!settings) {
    console.error('No settings configured, exiting');
    process.exit(0);
  }

  if (!settings.companyName) {
    console.log('No company name configured. Set it in dashboard settings.');
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'youtube', 'error', 'config_error', 'No company name configured');
    process.exit(0);
  }

  // Schedule guard (uses per-platform schedule if configured, else global cron schedule)
  const cronTz = (settings as any).cronTimezone || '';
  const platformSchedule = (settings as any).platformSchedules?.get?.('youtube') || null;
  // Only enforce schedule when the user has explicitly configured a timezone
  if (!process.env.CRON_MANUAL && cronTz) {
    const effectiveSchedule = platformSchedule || {
      timezone: cronTz,
      startHour: (settings as any).cronStartHour ?? 9,
      endHour: (settings as any).cronEndHour ?? 18,
      days: (settings as any).cronDays ?? [0, 1, 2, 3, 4, 5, 6],
    };
    if (!isWithinSchedule(effectiveSchedule)) {
      console.log('Outside scheduled hours, exiting');
      process.exit(0);
    }
  }

  // Pause guard — dashboard "Pause Cron" button sets this flag
  if (!process.env.CRON_MANUAL && settings.autoPostingPaused) {
    console.log('Auto-posting is paused via dashboard, exiting');
    process.exit(0);
  }

  const keywords: string[] = (settings as any).youtubeKeywords?.length
    ? (settings as any).youtubeKeywords
    : (settings.keywords?.length ? settings.keywords : []);
  if (keywords.length === 0) {
    console.log('No YouTube keywords configured. Add keywords in dashboard settings.');
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'youtube', 'warn', 'config_error', 'No YouTube keywords configured');
    process.exit(0);
  }
  const configuredDailyLimit: number = (settings as any).youtubeDailyLimit ?? DEFAULT_DAILY_LIMIT;
  const accountAddedAt = getAccountAge(settings, 'youtube');
  let dailyLimit: number = getYouTubeDailyLimit(configuredDailyLimit, accountAddedAt);
  const ageDays = accountAddedAt
    ? (Date.now() - new Date(accountAddedAt).getTime()) / 86_400_000
    : 0;
  if (dailyLimit === 0) {
    console.log(`Browse-only period: account is ${Math.floor(ageDays)} day(s) old — commenting starts after 2 days of feed activity`);
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'youtube', 'info', 'warmup',
      `Browse-only warmup (day ${Math.floor(ageDays)}/2) — building watch history before commenting`,
      { ageDays: Math.floor(ageDays) },
    );
  } else if (dailyLimit < configuredDailyLimit) {
    console.log(`Warmup ramp: daily limit ${dailyLimit}/${configuredDailyLimit} (day ${Math.floor(ageDays)})`);
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'youtube', 'info', 'warmup',
      `Warmup ramp: ${dailyLimit}/${configuredDailyLimit} comments/day (day ${Math.floor(ageDays)})`,
      { ageDays: Math.floor(ageDays), dailyLimit, configuredDailyLimit },
    );
  }

  // ── Adaptive health throttling ──
  if (CRON_USER_ID) {
    const platformDoc = await BrowserCookie.findOne({ userId: CRON_USER_ID, platform: 'youtube' }).lean() as any;
    const healthScore: number = platformDoc?.healthScore ?? 100;
    const actProfile = getActivityProfile(healthScore);

    if (actProfile.needsRecovery) {
      // Health < 50 — skip commenting entirely this run (no reaction phase on youtube)
      console.warn(`[Health] Score ${healthScore}/100 (${actProfile.label}) — skipping youtube comments this run`);
      if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'youtube', 'warn', 'health_recovery',
        `Health ${healthScore}/100 — skipping comments (recovery mode, ${actProfile.recoveryDays} days recommended)`,
        { healthScore },
      );
      dailyLimit = 0;
    } else if (actProfile.commentMultiplier < 1 && dailyLimit > 1) {
      const throttledLimit = Math.max(1, Math.floor(dailyLimit * actProfile.commentMultiplier));
      if (throttledLimit < dailyLimit) {
        console.warn(`[Health] Score ${healthScore}/100 (${actProfile.label}) — daily limit throttled: ${throttledLimit}/${dailyLimit}`);
        if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'youtube', 'warn', 'health_throttle',
          `Health throttle: ${throttledLimit}/${dailyLimit} comments/day (${actProfile.label}, health ${healthScore}/100)`,
        );
        dailyLimit = throttledLimit;
      }
    }
  }
  const autoPostThreshold: number = (settings as any).youtubeAutoPostThreshold ?? DEFAULT_AUTO_POST_THRESHOLD;
  const brandMentionRate: number = (settings as any).youtubeBrandMentionRate ?? 25;
  const cooldownMinutes: number = capCooldown('youtube', (settings as any).youtubeCooldownMinutes ?? 180);

  const accountId = getCurrentAccountId();
  if (accountId) console.log(`Active YouTube account: ${accountId}`);

  // Pre-visit Google to establish SSO session before checking YouTube login
  // Google SSO requires cookies on .google.com — visiting Google first triggers cookie exchange
  try {
    const prePage = await getPage();
    await prePage.goto('https://accounts.google.com/ServiceLogin', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    await sleep(2000);
    console.log('[YT] Pre-visited Google for SSO cookie exchange');
  } catch { /* non-critical */ }

  // Check login — if not logged in, continue in browse-only mode
  const loggedIn = await ensureYouTubeLoggedIn();
  if (!loggedIn) {
    console.warn('[YT] Not logged in — continuing in browse-only mode (watch only, no likes/comments)');
    if (CRON_USER_ID) {
      await logActivity(CRON_USER_ID, 'youtube', 'warn', 'auth_warn', 'YouTube not logged in — browse-only mode (watching videos/Shorts). Re-upload cookies for likes/comments.');
      await notifyAuthError(CRON_USER_ID, 'youtube', 'YouTube session expired — bot is watching but cannot like or comment. Re-upload cookies.');
    }
  } else {
    console.log('YouTube login confirmed');
  }

  // ── Human feed browsing — runs on EVERY session ─────────────────────────────
  // During the 2-day warmup we watch more videos (account needs watch history).
  // After warmup we still browse a few before potentially commenting.
  const isBrowseOnlyPeriod = ageDays < 2;
  const numFeedVideos = isBrowseOnlyPeriod
    ? 4 + Math.floor(Math.random() * 3)  // 4–6 videos during warmup
    : 2 + Math.floor(Math.random() * 2); // 2–3 videos before commenting
  await humanBrowseFeed(numFeedVideos);

  // ── Browse YouTube Shorts (every session) ─────────────────────────────────
  // Shorts are a major engagement signal — watching them builds natural activity.
  const numShorts = 2 + Math.floor(Math.random() * 3); // 2-4 Shorts per session
  try {
    console.log(`[Shorts] Watching up to ${numShorts} Shorts`);
    const shortsResult = await browseShorts(PROFILE_DIR, keywords, numShorts);
    console.log(`[Shorts] Watched ${shortsResult.watched}, liked ${shortsResult.liked}`);

    // Save watched Shorts to DB so they show in the platform page with links
    for (const shortUrl of shortsResult.urls) {
      try {
        const exists = await Post.findOne({ url: shortUrl, ...(CRON_USER_ID && { userId: CRON_USER_ID }) });
        if (!exists) {
          await Post.create({
            url: shortUrl, platform: 'youtube',
            ...(CRON_USER_ID && { userId: CRON_USER_ID }),
            content: `YouTube Short — watched during feed browse`,
            status: 'new', isShort: true,
          });
        }
      } catch { /* non-critical */ }
    }

    if (CRON_USER_ID && shortsResult.watched > 0) {
      await logActivity(CRON_USER_ID, 'youtube', 'info', 'shorts_watched',
        `Watched ${shortsResult.watched} Short${shortsResult.watched !== 1 ? 's' : ''}, liked ${shortsResult.liked}`,
        { watched: shortsResult.watched, liked: shortsResult.liked, urls: shortsResult.urls, likedUrls: shortsResult.likedUrls },
      );
    }
  } catch (e) { console.warn('[Shorts] Error:', (e as Error).message); }

  // Browse-only period gate: first 2 days = no commenting, only build watch history
  if (isBrowseOnlyPeriod) {
    console.log(`Browse-only period (day ${Math.floor(ageDays)}/2) — skipping comment phase. Commenting starts after day 2.`);
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'youtube', 'info', 'browse_only',
      `Warmup day ${Math.floor(ageDays)}/2: browse-only — watched feed + Shorts, no commenting until day 2`,
    );
    await closeBrowser();
    process.exit(0);
  }

  // Daily limit + cooldown → flags only (don't exit, let likes/scraping continue)
  let ytCommentBlocked = false;
  const todayCount = await getTodayCommentCount(accountId, cronTz || 'UTC');
  if (todayCount >= dailyLimit) {
    console.log(`Comment limit reached: ${todayCount}/${dailyLimit} — commenting blocked, likes continue`);
    ytCommentBlocked = true;
  } else {
    console.log(`Comments posted today: ${todayCount}/${dailyLimit}`);
  }

  if (!ytCommentBlocked && !process.env.CRON_MANUAL) {
    const MIN_COMMENT_GAP_MS = jitterCooldown(cooldownMinutes);
    const lastPosted = await Post.findOne({ platform: 'youtube', status: 'posted', postedAt: { $exists: true }, ...(CRON_USER_ID && { userId: CRON_USER_ID }) })
      .sort({ postedAt: -1 }).select('postedAt');
    if (lastPosted?.postedAt) {
      const elapsed = Date.now() - new Date(lastPosted.postedAt).getTime();
      if (elapsed < MIN_COMMENT_GAP_MS) {
        const remainMin = Math.ceil((MIN_COMMENT_GAP_MS - elapsed) / 60000);
        console.log(`Cooldown: ${remainMin}m remaining — commenting blocked, likes continue`);
        ytCommentBlocked = true;
      }
    }
  }

  // 20% random skip for commenting only (likes still happen)
  if (!ytCommentBlocked && !process.env.CRON_MANUAL && Math.random() < 0.20) {
    console.log('Random skip for commenting (20%) — likes and scraping continue');
    ytCommentBlocked = true;
  }

  // Scrape videos
  const allVideos = await scrapeYouTubeVideos(keywords);
  console.log(`Total keyword-matching videos found: ${allVideos.length}`);

  // Save new videos to DB
  let newVideoCount = 0;
  for (const video of allVideos) {
    const exists = await Post.findOne({ url: video.url, ...(CRON_USER_ID && { userId: CRON_USER_ID }) });
    if (!exists) {
      await Post.create({
        url: video.url, platform: 'youtube',
        ...(CRON_USER_ID && { userId: CRON_USER_ID }),
        author: video.author, content: video.content,
        keywordsMatched: keywords.filter(kw => video.content.toLowerCase().includes(kw.toLowerCase())),
        status: 'new',
      });
      newVideoCount++;
    }
  }
  console.log(`Saved ${newVideoCount} new videos to DB`);

  // Evaluate unevaluated videos (always — keeps pipeline primed)
  const unevaluatedVideos = await Post.find({ platform: 'youtube', status: 'new', ...(CRON_USER_ID && { userId: CRON_USER_ID }) }).limit(10);
  if (unevaluatedVideos.length > 0) {
    console.log(`Evaluating ${unevaluatedVideos.length} new YouTube videos`);
    for (const video of unevaluatedVideos) {
      try {
        await Post.findByIdAndUpdate(video._id, { status: 'evaluating' });
        const evaluation = await evaluatePost(video.content, settings.companyName, settings.companyDescription, settings.promptTemplate || undefined);
        await Post.findByIdAndUpdate(video._id, {
          status: 'evaluated', aiReply: evaluation.suggestedReply,
          aiRelevanceScore: evaluation.score, aiTone: evaluation.tone,
          aiReasoning: evaluation.reasoning, evaluatedAt: new Date(),
        });
        console.log(`  Video ${video._id}: score=${evaluation.score}`);
      } catch (err) {
        console.error(`  Failed to evaluate video ${video._id}:`, (err as Error).message);
        await Post.findByIdAndUpdate(video._id, { status: 'new' });
      }
    }
  }

  // ── Guaranteed like pass (requires login) ──────────────────────────────
  // Liking relevant videos builds natural engagement history.
  if (!loggedIn) {
    console.log('[Like/Comment/Subscribe] Skipped — not logged in (browse-only mode)');
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'youtube', 'info', 'cron_end', 'YouTube browse-only session complete (not logged in)');
    await closeBrowser();
    process.exit(0);
  }
  const todayEngageStart = getTodayStartUTC(cronTz || 'UTC');
  const todayLikeCount = await Post.countDocuments({ platform: 'youtube', likedByBot: true, updatedAt: { $gte: todayEngageStart }, ...(CRON_USER_ID && { userId: CRON_USER_ID }) });
  const isWarmupEngage = dailyLimit === 0;
  // Target: 10-15 likes/day (videos + Shorts combined)
  const dailyLikeTarget = 10 + Math.floor(Math.random() * 6); // 10-15
  const likeRemaining = Math.max(0, dailyLikeTarget - todayLikeCount);

  // Always attempt likes (no random gate)
  if (likeRemaining > 0) {
    // 3-4 likes per session to spread across the day
    const thisSessionLikes = Math.min(likeRemaining, 3 + Math.floor(Math.random() * 2));
    // Videos stay relevant for weeks — 14-day window for likes
    const freshCutoffLike = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const likeCandidates = await Post.find({
      platform: 'youtube',
      status: { $in: ['evaluated', 'posted'] },
      aiRelevanceScore: { $gte: Math.min(autoPostThreshold, 40) },
      likedByBot: { $ne: true },
      postDeleted: { $ne: true },
      scrapedAt: { $gte: freshCutoffLike },
      ...(CRON_USER_ID && { userId: CRON_USER_ID }),
    }).sort({ aiRelevanceScore: -1 }).limit(likeCount);

    if (likeCandidates.length > 0) {
      let liked = 0;
      console.log(`[Like] Guaranteed pass: liking up to ${likeCount} videos`);
      for (const vid of likeCandidates) {
        try {
          const result = await likeYouTubeVideo(vid.url as string, PROFILE_DIR);
          if (result.success) {
            await Post.findByIdAndUpdate(vid._id, { likedByBot: true });
            liked++;
            if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'youtube', 'info', 'like',
              `Liked a video (score ${vid.aiRelevanceScore})`, { url: vid.url, score: vid.aiRelevanceScore },
            );
          }
          await new Promise(r => setTimeout(r, 3000 + Math.random() * 5000));
        } catch (e) { console.warn('  Like error:', (e as Error).message); }
      }
      console.log(`[Like] Done: liked ${liked} videos`);
    }
  }

  // ── Auto-subscribe to channels with 5+ watched/liked videos ────────────────
  // Real users subscribe after watching several videos from the same channel.
  try {
    const channelCounts = await Post.aggregate([
      { $match: { platform: 'youtube', likedByBot: true, author: { $exists: true, $ne: '' }, ...(CRON_USER_ID && { userId: CRON_USER_ID }) } },
      { $group: { _id: '$author', count: { $sum: 1 }, sampleUrl: { $first: '$url' } } },
      { $match: { count: { $gte: 5 } } },
      { $limit: 3 },
    ]);

    for (const ch of channelCounts) {
      // Check if already subscribed (track via a simple log check)
      const alreadySubbed = await Post.findOne({
        platform: 'youtube', author: ch._id, subscribedByBot: true,
        ...(CRON_USER_ID && { userId: CRON_USER_ID }),
      });
      if (alreadySubbed) continue;

      console.log(`[Subscribe] Channel "${ch._id}" has ${ch.count} liked videos — subscribing`);
      const subResult = await subscribeToChannel(ch.sampleUrl, PROFILE_DIR);
      if (subResult.success) {
        // Mark one post from this channel as subscribed so we don't retry
        await Post.findOneAndUpdate(
          { platform: 'youtube', author: ch._id, ...(CRON_USER_ID && { userId: CRON_USER_ID }) },
          { $set: { subscribedByBot: true } },
        );
        if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'youtube', 'info', 'subscribe',
          `Subscribed to "${ch._id}" after watching ${ch.count} videos`,
          { channel: ch._id, videoCount: ch.count },
        );
        await new Promise(r => setTimeout(r, 3000 + Math.random() * 4000));
      }
    }
  } catch (e) { console.warn('[Subscribe] Error:', (e as Error).message); }

  // ── Unified action phase ──────────────────────────────────────────────────
  type YtAction = 'comment';
  const ytWeights: Record<YtAction, number> = {
    comment: ytCommentBlocked ? 0 : 30,
  };

  // Pick 0-1 actions (YouTube is conservative — max 1 comment per run)
  const ytRunDist = [{ count: 0, weight: 25 }, { count: 1, weight: 75 }];
  let ytRunCount = 0;
  {
    const total = ytRunDist.reduce((s, d) => s + d.weight, 0);
    let r = Math.random() * total;
    for (const { count, weight } of ytRunDist) { r -= weight; if (r <= 0) { ytRunCount = count; break; } }
  }

  const doComment = ytRunCount > 0 && !ytCommentBlocked && ytWeights.comment > 0;

  if (doComment) {
    const recheck = await getTodayCommentCount(accountId, cronTz || 'UTC');
    if (recheck >= dailyLimit) {
      console.log(`[comment] Daily limit reached (${recheck}/${dailyLimit}) — skipping`);
    } else {
      const recentlyPosted = await Post.find({
        platform: 'youtube', status: 'posted',
        postedAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        ...(CRON_USER_ID && { userId: CRON_USER_ID }),
      }).select('url author').lean();
      const recentAuthors = new Set(recentlyPosted.map(p => p.author).filter(Boolean));
      const recentUrls = new Set(recentlyPosted.map(p => p.url));

      // Videos stay relevant — 7-day window for comments
      const freshCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const candidate = await Post.findOne({
        platform: 'youtube', status: 'evaluated',
        aiRelevanceScore: { $gte: autoPostThreshold },
        aiReply: { $exists: true, $ne: '' },
        postAttempts: { $not: { $gte: 3 } },
        postDeleted: { $ne: true },
        scrapedAt: { $gte: freshCutoff },
        url: { $nin: Array.from(recentUrls) },
        author: { $nin: Array.from(recentAuthors) },
        ...(CRON_USER_ID && { userId: CRON_USER_ID }),
      }).sort({ _id: -1 });

      if (candidate) {
        let replyText = candidate.editedReply || '';
        if (!replyText) replyText = await generateYouTubeComment(candidate.content, settings.companyName, settings.companyDescription, brandMentionRate);
        if (!replyText && candidate.aiReply) { console.log('Using existing aiReply as fallback'); replyText = candidate.aiReply; }

        const looksLikeJson = /^\s*[\[{]/.test(replyText || '');
        const hasAnsi = /\x1b\[[\d;]*m/.test(replyText || '');
        const hasPayloads = /"payloads"\s*:/.test(replyText || '');
        const hasDebugPrefix = /\[agent\/embedded\]/.test(replyText || '');

        if (looksLikeJson || hasAnsi || hasPayloads || hasDebugPrefix) {
          console.error('[comment] Format check failed, skipping:', replyText?.slice(0, 100));
        } else if (!replyText || replyText.length < 5 || /error|failed|exception|undefined|null/i.test(replyText)) {
          console.error('[comment] Safety check failed, skipping:', replyText?.slice(0, 100));
        } else {
          console.log(`[comment] Auto-posting on ${candidate.url} (score: ${candidate.aiRelevanceScore})`);

          // Like the video before commenting (natural behavior)
          if (!candidate.likedByBot) {
            try {
              const likeResult = await likeYouTubeVideo(candidate.url, PROFILE_DIR);
              if (likeResult.success) {
                await Post.findByIdAndUpdate(candidate._id, { likedByBot: true });
                console.log('  Liked video before commenting');
              }
              await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));
            } catch { /* non-critical */ }
          }

          const result = await postYouTubeComment(candidate.url, replyText);
          if (result.success) {
            await Post.findByIdAndUpdate(candidate._id, { status: 'posted', postedAt: new Date(), editedReply: replyText, postedByAccount: accountId });
            console.log(`[comment] Posted successfully`);
            if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'youtube', 'success', 'post', `Comment posted on ${candidate.url}`, { score: candidate.aiRelevanceScore });
          } else {
            await Post.findByIdAndUpdate(candidate._id, { $inc: { postAttempts: 1 } });
            console.error('[comment] Failed:', result.error);
            if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'youtube', 'error', 'post_failed', `Failed to post YouTube comment: ${result.error || 'Unknown error'}`, { url: candidate.url });
          }
        }
      } else {
        console.log('[comment] No videos above threshold');
        if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'youtube', 'info', 'skip', 'No posts above auto-post threshold');
      }
    }
  } else {
    console.log(`Main action phase: ${ytCommentBlocked ? 'commenting blocked' : 'idle run'} — likes and scraping done`);
  }

  console.log(`[${new Date().toISOString()}] YouTube Cron: complete`);
  if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'youtube', 'info', 'cron_end', 'YouTube cron completed');
  await closeBrowser();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('Fatal error:', err);
  await closeBrowser().catch(() => {});
  process.exit(1);
});
