/**
 * Pinterest Auto-Commenter Cron Script
 *
 * Searches Pinterest for keyword-matching pins, evaluates them with AI,
 * and auto-posts comments on high-scoring pins.
 *
 * Schedule: every 15 minutes via node-cron in server.js
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { connectDB } from '../src/lib/mongodb';
import { cronStart, cronFinish } from '../src/lib/cronState';
import { evaluatePost, askOpenClaw } from '../src/lib/openclaw';
import { isWithinSchedule } from '../src/lib/schedule';
import Post from '../src/models/Post';
import Settings from '../src/models/Settings';

const PROFILE_DIR = join(process.cwd(), '.pinterest-profile');
const COOKIES_FILE = join(PROFILE_DIR, 'cookies.json');
const VERIFIED_FILE = join(PROFILE_DIR, '.verified');
const NAVIGATION_TIMEOUT = 30000;
const SLOW_WAIT = 4000;

// Pinterest-specific defaults — platform is visual/lifestyle, so use topics that exist on Pinterest
// and allow a lower threshold since SEO niche has thin coverage there
const DEFAULT_KEYWORDS = ['SEO tips', 'digital marketing strategy', 'content marketing', 'online business growth', 'blogging tips'];
const DEFAULT_DAILY_LIMIT = 5;
const DEFAULT_AUTO_POST_THRESHOLD = 15;  // Pinterest has lower relevance ceiling for SEO content

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
  return getVerifiedData().accountId || 'pinterest';
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
      console.log(`Loaded ${cookies.length} Pinterest cookies`);
    } catch (e) {
      console.warn('Could not load Pinterest cookies:', (e as Error).message);
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

async function ensurePinterestLoggedIn(): Promise<boolean> {
  try {
    const page = await getPage();
    await page.goto('https://www.pinterest.com', { waitUntil: 'domcontentloaded' });
    await sleep(SLOW_WAIT);

    const url = page.url();
    if (url.includes('/login') || url.includes('/auth')) return false;

    // Check for visible login button (if present and visible = not logged in)
    const loginBtn = await page.$('[data-test-id="login-button"]').catch(() => null);
    if (loginBtn && await loginBtn.isVisible().catch(() => false)) return false;

    // If we're on the homepage without a login redirect, consider logged in
    return true;
  } catch (err) {
    console.error('Pinterest login check failed:', (err as Error).message);
    return false;
  }
}

async function scrapePinterestPins(keywords: string[]): Promise<Array<{ url: string; author: string; content: string }>> {
  const results: Array<{ url: string; author: string; content: string }> = [];
  const page = await getPage();

  // Use SEO-specific compound search terms that Pinterest handles better
  const searchTerms = keywords.slice(0, 3).map(kw => {
    if (['serpbays', 'backlink', 'backlinks'].includes(kw.toLowerCase())) return `${kw} SEO`;
    if (kw.toLowerCase() === 'seo') return 'SEO tips digital marketing';
    return kw;
  });

  for (const keyword of searchTerms) {
    try {
      const searchUrl = `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(keyword)}&rs=typed`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
      await sleep(SLOW_WAIT);

      // Scroll to load more pins
      await page.evaluate(() => window.scrollTo(0, 1200));
      await sleep(2000);

      // Extract pin links: get title from img[alt] inside the pin card (more accurate than aria-label)
      const pins = await page.$$eval(
        'a[href*="/pin/"]',
        (links) => links.slice(0, 15).map(a => {
          const href = (a as HTMLAnchorElement).href;
          // Try img alt text first (actual pin description), then aria-label, then text
          const img = a.querySelector('img');
          const title = img?.getAttribute('alt')
            || a.getAttribute('aria-label')?.replace(/\s*pin page$/i, '').trim()
            || a.textContent?.trim()
            || '';
          return { url: href, title };
        })
      ).catch(() => [] as Array<{ url: string; title: string }>);

      for (const pin of pins) {
        const cleanUrl = pin.url.split('?')[0];
        // Build content = title + keyword context so AI has enough to score
        const content = pin.title
          ? `${pin.title} — found via Pinterest search for "${keyword}"`
          : `Pinterest pin about ${keyword}`;
        if (cleanUrl && cleanUrl.includes('/pin/') && !results.find(r => r.url === cleanUrl)) {
          results.push({
            url: cleanUrl,
            author: 'pinterest_user',
            content,
          });
        }
      }

      console.log(`  Pinterest "${keyword}": found ${pins.length} pins`);
    } catch (err) {
      console.error(`  Error scraping Pinterest for "${keyword}":`, (err as Error).message);
    }
    await sleep(2000);
  }

  return results;
}

async function postPinterestComment(pinUrl: string, comment: string): Promise<boolean> {
  const page = await getPage();
  try {
    await page.goto(pinUrl, { waitUntil: 'domcontentloaded' });
    await sleep(SLOW_WAIT);

    const commentSelectors = [
      '[data-test-id="comment-field"]',
      '[aria-label*="comment" i]',
      'div[contenteditable="true"]',
      'textarea[placeholder*="comment" i]',
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
      console.log('  No comment box found on pin');
      return false;
    }

    await commentBox.click();
    await sleep(1000);
    await commentBox.type(comment, { delay: 50 });
    await sleep(1000);

    // Try submit button, fallback to Enter
    const submitBtn = await page.$('[data-test-id="comment-submit-button"], button[type="submit"]').catch(() => null);
    if (submitBtn && await submitBtn.isVisible().catch(() => false)) {
      await submitBtn.click();
    } else {
      await page.keyboard.press('Enter');
    }
    await sleep(3000);

    return true;
  } catch (err) {
    console.error('  Pinterest comment error:', (err as Error).message);
    return false;
  }
}

async function generatePinterestComment(
  postContent: string,
  companyName: string,
  companyDescription: string
): Promise<string> {
  const randomSeed = Math.floor(Math.random() * 1000);
  const styles = [
    'share how serpbays helped with your SEO and link building strategy',
    'naturally mention serpbays guest posting as a solution to the topic',
    'give a helpful tip and briefly reference serpbays for backlinks',
    'comment enthusiastically and mention serpbays niche edits or guest posts',
    'provide value and suggest serpbays as a resource for link building',
  ];
  const style = styles[randomSeed % styles.length];

  const prompt = `You are a real Pinterest user leaving a helpful comment on a pin about SEO or marketing.

PIN CONTENT:
"""
${postContent.slice(0, 400)}
"""

YOUR TASK: Write a short 1-2 sentence comment that ${style}.

RULES:
- Write ONLY the comment text, nothing else
- Sound like a genuine Pinterest user sharing a real tip
- Mention "${companyName}" naturally once — tie it to backlinks, guest posting, or link building
- NEVER include website URLs or "serpbays.com" — just the brand name
- Keep it concise and Pinterest-friendly
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

    if (comment.length > 300) comment = comment.slice(0, 297) + '...';
    return comment;
  } catch (err) {
    console.error('Failed to generate Pinterest comment:', (err as Error).message);
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
    platform: 'pinterest',
    status: 'posted',
    postedAt: { $gte: startOfDayUTC },
  };
  if (accountId) query.postedByAccount = accountId;
  return Post.countDocuments(query);
}

async function main() {
  console.log(`[${new Date().toISOString()}] Pinterest Cron: starting`);
  const _cronId = cronStart('pinterest', 'auto');
  process.on('exit', (code) => cronFinish(_cronId, 'pinterest', code));

  await connectDB();

  const settings = await Settings.findOne();
  if (!settings) {
    console.error('No settings configured, exiting');
    process.exit(0);
  }

  // Schedule guard
  const schedule = settings.platformSchedules?.get('pinterest');
  if (!isWithinSchedule(schedule)) {
    console.log('Outside scheduled hours, exiting');
    process.exit(0);
  }

  // Pause guard — dashboard "Pause Cron" button sets this flag
  if (settings.autoPostingPaused) {
    console.log('Auto-posting is paused via dashboard, exiting');
    process.exit(0);
  }

  const keywords: string[] = (settings as any).pinterestKeywords?.length
    ? (settings as any).pinterestKeywords
    : (settings.keywords?.length ? settings.keywords : DEFAULT_KEYWORDS);
  const dailyLimit: number = (settings as any).pinterestDailyLimit ?? DEFAULT_DAILY_LIMIT;
  const autoPostThreshold: number = (settings as any).pinterestAutoPostThreshold ?? DEFAULT_AUTO_POST_THRESHOLD;

  const accountId = getCurrentAccountId();
  if (accountId) console.log(`Active Pinterest account: ${accountId}`);

  // Daily limit check
  const todayCount = await getTodayCommentCount(accountId);
  if (todayCount >= dailyLimit) {
    console.log(`Daily limit reached: ${todayCount}/${dailyLimit} comments posted today`);
    process.exit(0);
  }
  console.log(`Comments posted today: ${todayCount}/${dailyLimit}`);

  // 15-minute cooldown
  const MIN_COMMENT_GAP_MS = 15 * 60 * 1000;
  const lastPosted = await Post.findOne({ platform: 'pinterest', status: 'posted', postedAt: { $exists: true } })
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
  const loggedIn = await ensurePinterestLoggedIn();
  if (!loggedIn) {
    try {
      mkdirSync(PROFILE_DIR, { recursive: true });
      writeFileSync(VERIFIED_FILE, JSON.stringify({
        loggedIn: false, ts: new Date().toISOString(),
        message: 'Session expired — cron detected not logged in',
      }));
    } catch {}
    console.error('Not logged in to Pinterest. Use cookie login from the dashboard.');
    process.exit(1);
  }
  console.log('Pinterest login confirmed');

  // Scrape pins
  const allPins = await scrapePinterestPins(keywords);
  console.log(`Total keyword-matching pins found: ${allPins.length}`);

  // Save new pins to DB
  let newPinCount = 0;
  for (const pin of allPins) {
    const exists = await Post.findOne({ url: pin.url });
    if (!exists) {
      await Post.create({
        url: pin.url,
        platform: 'pinterest',
        author: pin.author,
        content: pin.content,
        keywordsMatched: keywords.filter(kw => pin.content.toLowerCase().includes(kw.toLowerCase())),
        status: 'new',
      });
      newPinCount++;
    }
  }
  console.log(`Saved ${newPinCount} new pins to DB`);

  // Evaluate unevaluated pins
  const unevaluatedPins = await Post.find({ platform: 'pinterest', status: 'new' }).limit(10);
  console.log(`Evaluating ${unevaluatedPins.length} new Pinterest pins`);

  for (const pin of unevaluatedPins) {
    try {
      await Post.findByIdAndUpdate(pin._id, { status: 'evaluating' });
      const evaluation = await evaluatePost(
        pin.content,
        settings.companyName,
        settings.companyDescription,
        settings.promptTemplate || undefined
      );
      await Post.findByIdAndUpdate(pin._id, {
        status: 'evaluated',
        aiReply: evaluation.suggestedReply,
        aiRelevanceScore: evaluation.score,
        aiTone: evaluation.tone,
        aiReasoning: evaluation.reasoning,
        evaluatedAt: new Date(),
      });
      console.log(`  Pin ${pin._id}: score=${evaluation.score}`);
    } catch (err) {
      console.error(`  Failed to evaluate pin ${pin._id}:`, (err as Error).message);
      await Post.findByIdAndUpdate(pin._id, { status: 'new' });
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
    platform: 'pinterest',
    status: 'evaluated',
    aiRelevanceScore: { $gte: autoPostThreshold },
    aiReply: { $exists: true, $ne: '' },
  }).sort({ _id: -1 });

  if (candidate) {
    let replyText = candidate.editedReply || '';
    if (!replyText) {
      replyText = await generatePinterestComment(
        candidate.content,
        settings.companyName,
        settings.companyDescription
      );
    }

    // Safety check — block JSON/debug garbage and empty/error text
    const looksLikeJson = /^\s*[\[{]/.test(replyText || '');
    // eslint-disable-next-line no-control-regex
    const hasAnsi = /\x1b\[[\d;]*m/.test(replyText || '');
    const hasPayloads = /"payloads"\s*:/.test(replyText || '');
    const hasDebugPrefix = /\[agent\/embedded\]/.test(replyText || '');

    if (looksLikeJson || hasAnsi || hasPayloads || hasDebugPrefix) {
      console.error('Generated comment failed format check — JSON/debug garbage, skipping:', replyText?.slice(0, 100));
    } else if (!replyText || replyText.length < 5 || /error|failed|exception|undefined|null/i.test(replyText)) {
      console.error('Generated comment failed safety check, skipping:', replyText?.slice(0, 100));
    } else {
      console.log(`Auto-posting comment on ${candidate.url} (score: ${candidate.aiRelevanceScore})`);
      console.log(`Comment: "${replyText}"`);

      const success = await postPinterestComment(candidate.url, replyText);
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
    console.log('No pins above auto-post threshold, skipping');
  }

  console.log(`[${new Date().toISOString()}] Pinterest Cron: complete`);
  await closeBrowser();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('Fatal error:', err);
  await closeBrowser().catch(() => {});
  process.exit(1);
});
