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

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { connectDB } from '../src/lib/mongodb';
import { evaluatePost, askOpenClaw } from '../src/lib/openclaw';
import { isWithinSchedule } from '../src/lib/schedule';
import Post from '../src/models/Post';
import Settings from '../src/models/Settings';

const PROFILE_DIR = join(process.cwd(), '.youtube-profile');
const COOKIES_FILE = join(PROFILE_DIR, 'cookies.json');
const VERIFIED_FILE = join(PROFILE_DIR, '.verified');
const NAVIGATION_TIMEOUT = 30000;
const SLOW_WAIT = 4000;

const DEFAULT_KEYWORDS = ['Serpbays', 'guest post', 'backlinks', 'link building', 'seo'];
const DEFAULT_DAILY_LIMIT = 5;
const DEFAULT_AUTO_POST_THRESHOLD = 70;

let _browser: Browser | null = null;
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

/** Convert Chrome extension cookie format → Playwright cookie format */
function toPlaywrightCookies(raw: any[]): any[] {
  return raw
    .filter(c => c.name && c.value && c.domain)
    .map(c => ({
      name: c.name,
      value: c.value,
      domain: c.domain.startsWith('.') ? c.domain : `.${c.domain}`,
      path: c.path || '/',
      expires: c.expirationDate ? Math.floor(c.expirationDate) : -1,
      httpOnly: !!c.httpOnly,
      secure: !!c.secure,
      sameSite: (c.sameSite === 'no_restriction' || c.sameSite === 'None') ? 'None'
        : c.sameSite === 'strict' ? 'Strict'
        : 'Lax',
    }));
}

async function getPage(): Promise<Page> {
  if (_page && !_page.isClosed()) return _page;

  _browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  _ctx = await _browser.newContext({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
  });

  if (existsSync(COOKIES_FILE)) {
    try {
      const raw = JSON.parse(readFileSync(COOKIES_FILE, 'utf8'));
      const cookies = toPlaywrightCookies(Array.isArray(raw) ? raw : []);
      if (cookies.length) await _ctx.addCookies(cookies);
      console.log(`Loaded ${cookies.length} YouTube cookies`);
    } catch (e) {
      console.warn('Could not load YouTube cookies:', (e as Error).message);
    }
  }

  _page = await _ctx.newPage();
  _page.setDefaultTimeout(NAVIGATION_TIMEOUT);
  return _page;
}

async function closeBrowser(): Promise<void> {
  if (_browser) {
    await _browser.close().catch(() => {});
    _browser = null;
    _ctx = null;
    _page = null;
  }
}

async function ensureYouTubeLoggedIn(): Promise<boolean> {
  try {
    const page = await getPage();
    await page.goto('https://www.youtube.com', { waitUntil: 'domcontentloaded' });
    await sleep(SLOW_WAIT);

    const url = page.url();
    if (url.includes('/signin') || url.includes('/accounts.google.com')) return false;

    // Look for avatar (logged in indicator)
    const avatar = await page.$('#avatar-btn, ytd-masthead #avatar-btn, button#avatar-btn').catch(() => null);
    if (avatar && await avatar.isVisible().catch(() => false)) return true;

    // No sign-in button visible = logged in
    const signInBtn = await page.$('[href*="accounts.google.com"], yt-button-renderer a[href*="signin"]').catch(() => null);
    if (signInBtn && await signInBtn.isVisible().catch(() => false)) return false;

    return true;
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
    await sleep(2000);
  }

  return results;
}

async function postYouTubeComment(videoUrl: string, comment: string): Promise<boolean> {
  const page = await getPage();
  try {
    await page.goto(videoUrl, { waitUntil: 'domcontentloaded' });
    await sleep(SLOW_WAIT);

    // Scroll down to reveal comment section
    await page.evaluate(() => window.scrollTo(0, 500));
    await sleep(2000);
    await page.evaluate(() => window.scrollTo(0, 900));
    await sleep(2000);

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
      return false;
    }

    await commentBox.click();
    await sleep(500);
    await commentBox.type(comment, { delay: 50 });
    await sleep(1000);

    // Click submit button
    const submitBtn = await page.$('#submit-button, ytd-button-renderer#submit-button button').catch(() => null);
    if (submitBtn && await submitBtn.isVisible().catch(() => false)) {
      await submitBtn.click();
    } else {
      await page.keyboard.press('Control+Enter');
    }
    await sleep(3000);

    return true;
  } catch (err) {
    console.error('  YouTube comment error:', (err as Error).message);
    return false;
  }
}

async function generateYouTubeComment(
  postContent: string,
  companyName: string,
  companyDescription: string
): Promise<string> {
  const randomSeed = Math.floor(Math.random() * 1000);
  const styles = [
    'share how serpbays helped you with SEO and backlinks',
    'mention serpbays guest posting as a resource for the topic',
    'give a helpful comment and naturally reference serpbays for link building',
    'express appreciation for the video and briefly mention serpbays niche edits',
    'provide a useful insight and suggest serpbays for backlink opportunities',
  ];
  const style = styles[randomSeed % styles.length];

  const prompt = `You are a real YouTube user leaving a helpful comment on a video about SEO or digital marketing.

VIDEO TITLE/CONTENT:
"""
${postContent.slice(0, 400)}
"""

YOUR TASK: Write a short 1-3 sentence YouTube comment that ${style}.

RULES:
- Write ONLY the comment text, nothing else
- Sound like a genuine YouTube viewer sharing a real experience
- Mention "${companyName}" naturally once — tie it to backlinks, guest posting, or link building
- NEVER include website URLs or "serpbays.com" — just the brand name
- Keep it concise and YouTube-appropriate
- Do NOT include any code, errors, JSON, or technical output
- Company context: ${companyDescription}
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
      .replace(/serpbays\.com/gi, 'Serpbays')
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (comment.length > 500) comment = comment.slice(0, 497) + '...';
    return comment;
  } catch (err) {
    console.error('Failed to generate YouTube comment:', (err as Error).message);
    return '';
  }
}

async function getTodayCommentCount(accountId: string): Promise<number> {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60000;
  const istNow = new Date(now.getTime() + istOffset);
  const startOfDay = new Date(istNow);
  startOfDay.setHours(0, 0, 0, 0);
  const startOfDayUTC = new Date(startOfDay.getTime() - istOffset);

  const query: Record<string, unknown> = {
    platform: 'youtube',
    status: 'posted',
    postedAt: { $gte: startOfDayUTC },
  };
  if (accountId) query.postedByAccount = accountId;
  return Post.countDocuments(query);
}

async function main() {
  console.log(`[${new Date().toISOString()}] YouTube Cron: starting`);

  await connectDB();

  const settings = await Settings.findOne();
  if (!settings) {
    console.error('No settings configured, exiting');
    process.exit(0);
  }

  // Schedule guard
  const schedule = settings.platformSchedules?.get('youtube');
  if (!isWithinSchedule(schedule)) {
    console.log('Outside scheduled hours, exiting');
    process.exit(0);
  }

  const keywords: string[] = (settings as any).youtubeKeywords?.length
    ? (settings as any).youtubeKeywords
    : (settings.keywords?.length ? settings.keywords : DEFAULT_KEYWORDS);
  const dailyLimit: number = (settings as any).youtubeDailyLimit ?? DEFAULT_DAILY_LIMIT;
  const autoPostThreshold: number = (settings as any).youtubeAutoPostThreshold ?? DEFAULT_AUTO_POST_THRESHOLD;

  const accountId = getCurrentAccountId();
  if (accountId) console.log(`Active YouTube account: ${accountId}`);

  // Daily limit check
  const todayCount = await getTodayCommentCount(accountId);
  if (todayCount >= dailyLimit) {
    console.log(`Daily limit reached: ${todayCount}/${dailyLimit} comments posted today`);
    process.exit(0);
  }
  console.log(`Comments posted today: ${todayCount}/${dailyLimit}`);

  // 15-minute cooldown
  const MIN_COMMENT_GAP_MS = 15 * 60 * 1000;
  const lastPosted = await Post.findOne({ platform: 'youtube', status: 'posted', postedAt: { $exists: true } })
    .sort({ postedAt: -1 })
    .select('postedAt');
  if (lastPosted?.postedAt) {
    const elapsed = Date.now() - new Date(lastPosted.postedAt).getTime();
    if (elapsed < MIN_COMMENT_GAP_MS) {
      const remainMin = Math.ceil((MIN_COMMENT_GAP_MS - elapsed) / 60000);
      console.log(`Cooldown: last comment was ${Math.floor(elapsed / 60000)}m ago, need ${remainMin}m more. Skipping.`);
      process.exit(0);
    }
  }

  // Ensure logged in
  const loggedIn = await ensureYouTubeLoggedIn();
  if (!loggedIn) {
    try {
      mkdirSync(PROFILE_DIR, { recursive: true });
      writeFileSync(VERIFIED_FILE, JSON.stringify({
        loggedIn: false, ts: new Date().toISOString(),
        message: 'Session expired — cron detected not logged in',
      }));
    } catch {}
    console.error('Not logged in to YouTube. Use cookie login from the dashboard.');
    process.exit(1);
  }
  console.log('YouTube login confirmed');

  // Scrape videos
  const allVideos = await scrapeYouTubeVideos(keywords);
  console.log(`Total keyword-matching videos found: ${allVideos.length}`);

  // Save new videos to DB
  let newVideoCount = 0;
  for (const video of allVideos) {
    const exists = await Post.findOne({ url: video.url });
    if (!exists) {
      await Post.create({
        url: video.url,
        platform: 'youtube',
        author: video.author,
        content: video.content,
        keywordsMatched: keywords.filter(kw => video.content.toLowerCase().includes(kw.toLowerCase())),
        status: 'new',
      });
      newVideoCount++;
    }
  }
  console.log(`Saved ${newVideoCount} new videos to DB`);

  // Evaluate unevaluated videos
  const unevaluatedVideos = await Post.find({ platform: 'youtube', status: 'new' }).limit(10);
  console.log(`Evaluating ${unevaluatedVideos.length} new YouTube videos`);

  for (const video of unevaluatedVideos) {
    try {
      await Post.findByIdAndUpdate(video._id, { status: 'evaluating' });
      const evaluation = await evaluatePost(
        video.content,
        settings.companyName,
        settings.companyDescription,
        settings.promptTemplate || undefined
      );
      await Post.findByIdAndUpdate(video._id, {
        status: 'evaluated',
        aiReply: evaluation.suggestedReply,
        aiRelevanceScore: evaluation.score,
        aiTone: evaluation.tone,
        aiReasoning: evaluation.reasoning,
        evaluatedAt: new Date(),
      });
      console.log(`  Video ${video._id}: score=${evaluation.score}`);
    } catch (err) {
      console.error(`  Failed to evaluate video ${video._id}:`, (err as Error).message);
      await Post.findByIdAndUpdate(video._id, { status: 'new' });
    }
  }

  // Auto-post one high-scoring comment
  const recheck = await getTodayCommentCount(accountId);
  if (recheck >= dailyLimit) {
    console.log('Daily limit reached after evaluation, skipping auto-post');
    await closeBrowser();
    process.exit(0);
  }

  const candidate = await Post.findOne({
    platform: 'youtube',
    status: 'evaluated',
    aiRelevanceScore: { $gte: autoPostThreshold },
    aiReply: { $exists: true, $ne: '' },
  }).sort({ _id: -1 });

  if (candidate) {
    let replyText = candidate.editedReply || '';
    if (!replyText) {
      replyText = await generateYouTubeComment(
        candidate.content,
        settings.companyName,
        settings.companyDescription
      );
    }

    if (!replyText || replyText.length < 5 || /error|failed|exception|undefined|null/i.test(replyText)) {
      console.error('Generated comment failed safety check, skipping:', replyText?.slice(0, 100));
    } else {
      console.log(`Auto-posting comment on ${candidate.url} (score: ${candidate.aiRelevanceScore})`);
      console.log(`Comment: "${replyText}"`);

      const success = await postYouTubeComment(candidate.url, replyText);
      if (success) {
        await Post.findByIdAndUpdate(candidate._id, {
          status: 'posted',
          postedAt: new Date(),
          editedReply: replyText,
          postedByAccount: accountId,
        });
        console.log(`Comment posted successfully (account: ${accountId})`);
      } else {
        console.error('Failed to post comment, will retry next run');
      }
    }
  } else {
    console.log('No videos above auto-post threshold, skipping');
  }

  console.log(`[${new Date().toISOString()}] YouTube Cron: complete`);
  await closeBrowser();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('Fatal error:', err);
  await closeBrowser().catch(() => {});
  process.exit(1);
});
