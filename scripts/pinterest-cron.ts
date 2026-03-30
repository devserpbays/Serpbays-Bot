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
import { getWarmupLimit, getAccountAge, capCooldown, jitterCooldown } from '../src/lib/antiBan';
import BrowserCookie from '../src/models/BrowserCookie';
import { savePinterestPin, likePinterestPin } from '../src/lib/pinterest';
import { getActivityProfile } from '../src/lib/accountHealth';

if (CRON_USER_ID && !process.env.PINTEREST_PROFILE_DIR) {
  console.log('No Pinterest account connected for this user, skipping.');
  process.exit(0);
}
const PROFILE_DIR = process.env.PINTEREST_PROFILE_DIR
  ? join(process.cwd(), process.env.PINTEREST_PROFILE_DIR)
  : join(process.cwd(), '.pinterest-profile');
const VERIFIED_FILE = join(PROFILE_DIR, '.verified');
const NAVIGATION_TIMEOUT = 30000;
const SLOW_WAIT = 4000;

const DEFAULT_DAILY_LIMIT = 2;
const DEFAULT_AUTO_POST_THRESHOLD = 15;  // Pinterest has lower relevance ceiling for SEO content

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


async function getPage(): Promise<Page> {
  if (_page && !_page.isClosed()) return _page;

  // Kill orphaned Chromium processes and clear lock files
  try { execSync(`pkill -f "${PROFILE_DIR}" 2>/dev/null || true`, { stdio: 'ignore' }); } catch {}
  await new Promise(r => setTimeout(r, 500));
  try { require('fs').unlinkSync(join(PROFILE_DIR, 'SingletonLock')); } catch {}
  try { require('fs').unlinkSync('/root/snap/chromium/common/chromium/SingletonLock'); } catch {}

  // Use persistent context — preserves full browser state so Pinterest
  // sees the same "device" on every run → sessions last much longer
  _ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
  });

  // Inject cookies from cookies.json if available
  const cookiesJsonPath = join(PROFILE_DIR, 'cookies.json');
  if (existsSync(cookiesJsonPath)) {
    try {
      const savedCookies = JSON.parse(readFileSync(cookiesJsonPath, 'utf8'));
      if (Array.isArray(savedCookies) && savedCookies.length > 0) {
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
    if (['backlink', 'backlinks'].includes(kw.toLowerCase())) return `${kw} SEO`;
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
        if (!cleanUrl || !cleanUrl.includes('/pin/') || results.find(r => r.url === cleanUrl)) continue;

        // Relevance filter: pin title must contain at least one keyword word
        const kwWords = keyword.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        const titleLower = (pin.title || '').toLowerCase();
        const isRelevant = kwWords.some(w => titleLower.includes(w));
        if (!isRelevant && pin.title) {
          // Also check against original keywords (not the transformed search term)
          const origRelevant = keywords.some(kw => {
            const origWords = kw.toLowerCase().split(/\s+/).filter(w => w.length > 2);
            return origWords.some(w => titleLower.includes(w));
          });
          if (!origRelevant) continue; // Skip irrelevant pins
        }

        const content = pin.title
          ? `${pin.title} — found via Pinterest search for "${keyword}"`
          : `Pinterest pin about ${keyword}`;
        results.push({
          url: cleanUrl,
          author: 'pinterest_user',
          content,
        });
      }

      console.log(`  Pinterest "${keyword}": found ${pins.length} pins`);
    } catch (err) {
      console.error(`  Error scraping Pinterest for "${keyword}":`, (err as Error).message);
    }
    await sleep(2000);
  }

  return results;
}

async function postPinterestComment(pinUrl: string, comment: string): Promise<{ success: boolean; error?: string }> {
  const page = await getPage();
  try {
    await page.goto(pinUrl, { waitUntil: 'domcontentloaded' });
    await sleep(SLOW_WAIT);

    // Pinterest uses a DraftJS editor for comments
    const commentSelectors = [
      'div.public-DraftEditor-content[contenteditable="true"]',
      '[aria-label*="Add a comment"][contenteditable="true"]',
      '[data-test-id="comment-field"] div[contenteditable="true"]',
      '[data-test-id="inline-comment-composer-container"] div[contenteditable="true"]',
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
      await page.screenshot({ path: '/tmp/pinterest-comment-failed.png' }).catch(() => {});
      return { success: false, error: 'Comment box not found — pin may not allow comments, or login session expired' };
    }

    await commentBox.click();
    await sleep(800 + Math.random() * 500);
    // Human-like typing: variable delay per character, longer pauses after punctuation
    for (let i = 0; i < comment.length; i++) {
      await page.keyboard.type(comment[i]);
      const isPause = comment[i] === ',' || comment[i] === '.' || comment[i] === '!' || (Math.random() < 0.04);
      await sleep(isPause ? 300 + Math.random() * 300 : 60 + Math.random() * 120);
    }
    await sleep(1800 + Math.random() * 1200);

    // Pinterest shows a "Post" button (aria-label="Post") after typing
    const submitSelectors = [
      'button[aria-label="Post"]',
      'button[aria-label="post"]',
      '[data-test-id="comment-submit-button"]',
    ];

    let submitted = false;
    for (const sel of submitSelectors) {
      const btn = await page.$(sel).catch(() => null);
      if (btn && await btn.isVisible().catch(() => false)) {
        await btn.click();
        submitted = true;
        console.log('  Clicked Post button');
        break;
      }
    }

    if (!submitted) {
      // Fallback: try Enter
      await page.keyboard.press('Enter');
      console.log('  Used Enter key as fallback');
    }

    await sleep(5000);

    // Verify: check if "No comments yet" is gone or our text appears
    const noComments = await page.evaluate(() => {
      const h2s = document.querySelectorAll('h2');
      for (const h of h2s) {
        if (h.textContent && /no comments yet/i.test(h.textContent)) return true;
      }
      return false;
    }).catch(() => false);

    const pageText = await page.textContent('body').catch(() => '');
    const textFound = !!(pageText && pageText.includes(comment.slice(0, 25)));

    if (textFound || !noComments) {
      console.log('  Pinterest comment posted successfully');
      return { success: true };
    } else {
      console.warn('  Pinterest comment not confirmed on page');
      await page.screenshot({ path: '/tmp/pinterest-post-debug.png' }).catch(() => {});
      return { success: false, error: 'Comment not confirmed — "No comments yet" still showing. Pinterest may have blocked it.' };
    }
  } catch (err) {
    const msg = (err as Error).message;
    console.error('  Pinterest comment error:', msg);
    return { success: false, error: msg };
  }
}

async function generatePinterestComment(
  postContent: string,
  companyName: string,
  companyDescription: string,
  brandMentionRate = 25
): Promise<string> {
  const randomSeed = Math.floor(Math.random() * 1000);

  // Gradual brand ramp: 0% first 30 comments, then slowly increase
  const totalPosted = await Post.countDocuments({
    platform: 'pinterest', status: 'posted',
    ...(CRON_USER_ID && { userId: CRON_USER_ID }),
  });

  let effectiveBrandRate = 0;
  if (totalPosted >= 30)      effectiveBrandRate = brandMentionRate;
  else if (totalPosted >= 20) effectiveBrandRate = Math.min(brandMentionRate, 15);
  else if (totalPosted >= 10) effectiveBrandRate = Math.min(brandMentionRate, 8);
  else if (totalPosted >= 5)  effectiveBrandRate = Math.min(brandMentionRate, 3);

  const mentionBrand = effectiveBrandRate > 0 && Math.random() < (effectiveBrandRate / 100);

  const knowledgeStyles = [
    'share a practical tip or lesser-known technique related to this pin',
    'add a useful piece of info that complements what this pin covers',
    'share a brief lesson from your own experience with this topic',
    'ask a thoughtful question that shows genuine interest in the topic',
    'point out something specific about this pin and add your perspective',
  ];

  const brandStyles = [
    `share a genuine tip and casually mention ${companyName} as context for how you know this — not a pitch`,
    `add helpful info and reference your work at ${companyName} as background — the value is in the knowledge`,
  ];

  const stylePool = mentionBrand ? brandStyles : knowledgeStyles;
  const style = stylePool[randomSeed % stylePool.length];

  const brandRule = mentionBrand
    ? `- You work in ${companyDescription}. If mentioning ${companyName}, keep it to 3-4 words as passing context. 90%+ is knowledge.\n- DO NOT pitch or recommend ${companyName}`
    : '- NEVER mention any company, brand, product, or service by name — pure knowledge only';

  const prompt = `You are a regular Pinterest user browsing pins about ${companyDescription || 'this topic'}. You're commenting because you genuinely know about this — not to promote anything.

PIN:
"""
${postContent.slice(0, 400)}
"""

YOUR TASK: Write a comment (1-2 short sentences) that ${style}.

RULES:
- Write ONLY the comment. No label, no preamble
- Write casually — like typing on your phone, not writing an article
- Use contractions: "it's", "I've", "doesn't", "that's"
${brandRule}
- DO NOT use "check out", "highly recommend", "game-changer", "amazing"
- DO NOT start with "Love this", "Great pin", "So helpful"
- DO NOT include URLs, domains, or hashtags
- Share knowledge or ask a smart question — that's it
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

    if (comment.length > 300) comment = comment.slice(0, 297) + '...';
    return comment;
  } catch (err) {
    console.error('Failed to generate Pinterest comment:', (err as Error).message);
    return '';
  }
}

async function getTodayCommentCount(accountId: string, timezone = 'UTC'): Promise<number> {
  const startOfDayUTC = getTodayStartUTC(timezone);

  const query: Record<string, unknown> = {
    platform: 'pinterest',
    status: 'posted',
    postedAt: { $gte: startOfDayUTC },
  };
  if (accountId) query.postedByAccount = accountId;
  if (CRON_USER_ID) query.userId = CRON_USER_ID;
  return Post.countDocuments(query);
}

async function main() {
  console.log(`[${new Date().toISOString()}] Pinterest Cron: starting (user: ${CRON_USER_ID || 'default'})`);
  if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'pinterest', 'info', 'cron_start', 'Pinterest cron started');

  await connectDB();

  const settings = await Settings.findOne(CRON_USER_ID ? { userId: CRON_USER_ID } : {});
  if (!settings) {
    console.error('No settings configured, exiting');
    process.exit(0);
  }

  if (!settings.companyName) {
    console.log('No company name configured. Set it in dashboard settings.');
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'pinterest', 'error', 'config_error', 'No company name configured');
    process.exit(0);
  }

  // Schedule guard (uses per-platform schedule if configured, else global cron schedule)
  const cronTz = (settings as any).cronTimezone || '';
  const platformSchedule = (settings as any).platformSchedules?.get?.('pinterest') || null;
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

  // ── Anti-ban: random idle skip (15%) ──
  // Breaks mechanical every-run patterns. Pinterest flags accounts that comment at perfectly regular intervals.
  if (!process.env.CRON_MANUAL && Math.random() < 0.15) {
    console.log('Random skip (15% anti-ban variability) — no action this run');
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'pinterest', 'info', 'session_skip', 'Random skip (15% anti-ban variability) — no action this run');
    process.exit(0);
  }

  const keywords: string[] = (settings as any).pinterestKeywords?.length
    ? (settings as any).pinterestKeywords
    : (settings.keywords?.length ? settings.keywords : []);
  if (keywords.length === 0) {
    console.log('No Pinterest keywords configured. Add keywords in dashboard settings.');
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'pinterest', 'warn', 'config_error', 'No Pinterest keywords configured');
    process.exit(0);
  }
  const configuredDailyLimit: number = (settings as any).pinterestDailyLimit ?? DEFAULT_DAILY_LIMIT;
  const accountAddedAt = getAccountAge(settings, 'pinterest');
  let dailyLimit: number = getWarmupLimit(configuredDailyLimit, accountAddedAt, 'pinterest');
  if (dailyLimit < configuredDailyLimit) {
    console.log(`Warmup mode: daily limit capped at ${dailyLimit}/${configuredDailyLimit} (account age < 60 days)`);
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'pinterest', 'info', 'warmup', `Warmup limit: ${dailyLimit}/${configuredDailyLimit}`);
  }

  // ── Adaptive health throttling ──
  if (CRON_USER_ID) {
    const platformDoc = await BrowserCookie.findOne({ userId: CRON_USER_ID, platform: 'pinterest' }).lean() as any;
    const healthScore: number = platformDoc?.healthScore ?? 100;
    const actProfile = getActivityProfile(healthScore);

    if (actProfile.needsRecovery) {
      // Health < 50 — skip commenting entirely this run (no reaction phase on pinterest)
      console.warn(`[Health] Score ${healthScore}/100 (${actProfile.label}) — skipping pinterest comments this run`);
      if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'pinterest', 'warn', 'health_recovery',
        `Health ${healthScore}/100 — skipping comments (recovery mode, ${actProfile.recoveryDays} days recommended)`,
        { healthScore },
      );
      dailyLimit = 0;
    } else if (actProfile.commentMultiplier < 1 && dailyLimit > 1) {
      const throttledLimit = Math.max(1, Math.floor(dailyLimit * actProfile.commentMultiplier));
      if (throttledLimit < dailyLimit) {
        console.warn(`[Health] Score ${healthScore}/100 (${actProfile.label}) — daily limit throttled: ${throttledLimit}/${dailyLimit}`);
        if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'pinterest', 'warn', 'health_throttle',
          `Health throttle: ${throttledLimit}/${dailyLimit} comments/day (${actProfile.label}, health ${healthScore}/100)`,
        );
        dailyLimit = throttledLimit;
      }
    }
  }
  const autoPostThreshold: number = (settings as any).pinterestAutoPostThreshold ?? DEFAULT_AUTO_POST_THRESHOLD;
  const brandMentionRate: number = (settings as any).pinterestBrandMentionRate ?? 25;
  const cooldownMinutes: number = capCooldown('pinterest', (settings as any).pinterestCooldownMinutes ?? 90);

  const accountId = getCurrentAccountId();
  if (accountId) console.log(`Active Pinterest account: ${accountId}`);

  // Daily limit + cooldown → flags only (browsing continues)
  let pinCommentBlocked = false;
  const todayCount = await getTodayCommentCount(accountId, cronTz || 'UTC');
  if (todayCount >= dailyLimit) {
    console.log(`Comment limit reached: ${todayCount}/${dailyLimit} — commenting blocked, browsing continues`);
    pinCommentBlocked = true;
  } else {
    console.log(`Comments posted today: ${todayCount}/${dailyLimit}`);
  }

  if (!pinCommentBlocked && !process.env.CRON_MANUAL) {
    const MIN_COMMENT_GAP_MS = jitterCooldown(cooldownMinutes);
    const lastPosted = await Post.findOne({ platform: 'pinterest', status: 'posted', postedAt: { $exists: true }, ...(CRON_USER_ID && { userId: CRON_USER_ID }) })
      .sort({ postedAt: -1 })
      .select('postedAt');
    if (lastPosted?.postedAt) {
      const elapsed = Date.now() - new Date(lastPosted.postedAt).getTime();
      if (elapsed < MIN_COMMENT_GAP_MS) {
        const remainMin = Math.ceil((MIN_COMMENT_GAP_MS - elapsed) / 60000);
        console.log(`Cooldown: ${remainMin}m remaining — commenting blocked, browsing continues`);
        pinCommentBlocked = true;
      }
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
    if (CRON_USER_ID) {
      await logActivity(CRON_USER_ID, 'pinterest', 'error', 'auth_error', 'Not logged in to Pinterest — re-set cookies from dashboard');
      await notifyAuthError(CRON_USER_ID, 'pinterest', 'Not logged in to Pinterest — re-set cookies from dashboard');
    }
    await closeBrowser();
    process.exit(1);
  }
  console.log('Pinterest login confirmed');

  // Scrape pins
  const allPins = await scrapePinterestPins(keywords);
  console.log(`Total keyword-matching pins found: ${allPins.length}`);

  // Save new pins to DB
  let newPinCount = 0;
  for (const pin of allPins) {
    const exists = await Post.findOne({ url: pin.url, ...(CRON_USER_ID && { userId: CRON_USER_ID }) });
    if (!exists) {
      await Post.create({
        url: pin.url,
        platform: 'pinterest',
        ...(CRON_USER_ID && { userId: CRON_USER_ID }),
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
  const unevaluatedPins = await Post.find({ platform: 'pinterest', status: 'new', ...(CRON_USER_ID && { userId: CRON_USER_ID }) }).limit(10);
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

  // Build keyword regex for relevance filtering across save/like/comment sections
  const kwWords = keywords.flatMap(kw => kw.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const uniqueKwWords = [...new Set(kwWords)];
  const kwRegex = uniqueKwWords.length > 0
    ? new RegExp(uniqueKwWords.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i')
    : null;

  // ── Guaranteed save pass (80% of sessions) ────────────────────────────────
  // Saving pins builds natural engagement — Pinterest's primary interaction.
  const todayEngageStart = getTodayStartUTC(cronTz || 'UTC');
  const todaySaveCount = await Post.countDocuments({ platform: 'pinterest', likedByBot: true, updatedAt: { $gte: todayEngageStart }, ...(CRON_USER_ID && { userId: CRON_USER_ID }) });
  const isWarmupEngage = dailyLimit === 0;
  const dailySaveTarget = isWarmupEngage ? 5 + Math.floor(Math.random() * 4) : 3 + Math.floor(Math.random() * 3);
  const saveRemaining = Math.max(0, dailySaveTarget - todaySaveCount);

  const shouldSavePin = isWarmupEngage ? true : Math.random() < 0.80;
  if (saveRemaining > 0 && shouldSavePin) {
    const thisSessionSaves = Math.min(saveRemaining, isWarmupEngage ? 2 + Math.floor(Math.random() * 2) : 1 + Math.floor(Math.random() * 2));
    // Pins are evergreen — no freshness filter
    const saveCandidates = await Post.find({
      platform: 'pinterest',
      status: { $in: ['evaluated', 'posted', 'new'] },
      likedByBot: { $ne: true },
      postDeleted: { $ne: true },
      ...(kwRegex && { content: { $regex: kwRegex } }),
      ...(CRON_USER_ID && { userId: CRON_USER_ID }),
    }).sort({ aiRelevanceScore: -1 }).limit(thisSessionSaves);

    if (saveCandidates.length > 0) {
      let saved = 0;
      console.log(`[Save] Guaranteed pass: saving up to ${thisSessionSaves} pins`);
      for (const pin of saveCandidates) {
        try {
          const result = await savePinterestPin(pin.url as string, PROFILE_DIR);
          if (result.success) {
            await Post.findByIdAndUpdate(pin._id, { likedByBot: true });
            saved++;
            if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'pinterest', 'info', 'save_pin',
              `Saved a pin (score ${pin.aiRelevanceScore ?? 'N/A'})`, { url: pin.url },
            );
          }
          await new Promise(r => setTimeout(r, 3000 + Math.random() * 4000));
        } catch (e) { console.warn('  Save error:', (e as Error).message); }
      }
      console.log(`[Save] Done: saved ${saved} pins`);
    }
  }

  // ── Guaranteed like (heart) pass ─────────────────────────────────────────
  // Like pins separately from saving — Pinterest tracks hearts and saves as different engagement signals.
  // 3-5 likes per day, 1-2 per session.
  const todayLikeStart = getTodayStartUTC(cronTz || 'UTC');
  const todayPinLikes = await Post.countDocuments({ platform: 'pinterest', pinterestHeartLiked: true, updatedAt: { $gte: todayLikeStart }, ...(CRON_USER_ID && { userId: CRON_USER_ID }) });
  const dailyLikeTarget = 3 + Math.floor(Math.random() * 3); // 3-5
  const likeRemaining = Math.max(0, dailyLikeTarget - todayPinLikes);

  if (likeRemaining > 0) {
    const thisSessionLikes = Math.min(likeRemaining, 1 + Math.floor(Math.random() * 2)); // 1-2
    const likeCandidates = await Post.find({
      platform: 'pinterest',
      status: { $in: ['evaluated', 'posted', 'new'] },
      pinterestHeartLiked: { $ne: true },
      postDeleted: { $ne: true },
      ...(kwRegex && { content: { $regex: kwRegex } }),
      ...(CRON_USER_ID && { userId: CRON_USER_ID }),
    }).sort({ aiRelevanceScore: -1 }).limit(thisSessionLikes * 3);

    const shuffled = likeCandidates.sort(() => Math.random() - 0.5).slice(0, thisSessionLikes);
    if (shuffled.length > 0) {
      let liked = 0;
      console.log(`[Like] Liking ${shuffled.length} pin(s) (${todayPinLikes}/${dailyLikeTarget} today)`);
      for (const pin of shuffled) {
        try {
          const result = await likePinterestPin(pin.url as string, PROFILE_DIR);
          if (result.success) {
            await Post.findByIdAndUpdate(pin._id, { pinterestHeartLiked: true });
            liked++;
            if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'pinterest', 'info', 'like_pin',
              `Liked a pin`, { url: pin.url },
            );
          }
          await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));
        } catch (e) { console.warn('  Like error:', (e as Error).message); }
      }
      console.log(`[Like] Done: liked ${liked} pin(s)`);
    }
  }

  // ── Comment phase (gated by pinCommentBlocked) ────────────────────────────
  if (!pinCommentBlocked) {
    const recheck = await getTodayCommentCount(accountId, cronTz || 'UTC');
    if (recheck >= dailyLimit) {
      console.log(`[comment] Daily limit reached (${recheck}/${dailyLimit}) — skipping`);
    } else {
      // Author + URL dedup (30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const recentlyPosted = await Post.find({ platform: 'pinterest', status: 'posted', postedAt: { $gte: thirtyDaysAgo }, ...(CRON_USER_ID && { userId: CRON_USER_ID }) }).select('url author').lean();
      const recentPinUrls = new Set(recentlyPosted.map(p => p.url).filter(Boolean));
      const recentPinners = new Set(recentlyPosted.map(p => p.author).filter(a => a && a !== 'Unknown' && a !== 'pinterest_user'));

      // Pins are evergreen — no freshness filter, but must match keywords
      const candidate = await Post.findOne({
        platform: 'pinterest', status: 'evaluated',
        aiRelevanceScore: { $gte: autoPostThreshold },
        aiReply: { $exists: true, $ne: '' },
        postAttempts: { $not: { $gte: 3 } },
        postDeleted: { $ne: true },
        ...(kwRegex && { content: { $regex: kwRegex } }),
        ...(recentPinUrls.size > 0 && { url: { $nin: Array.from(recentPinUrls) } }),
        ...(recentPinners.size > 0 && { author: { $nin: Array.from(recentPinners) } }),
        ...(CRON_USER_ID && { userId: CRON_USER_ID }),
      }).sort({ aiRelevanceScore: -1 });

      if (candidate) {
        let replyText = candidate.editedReply || '';
        if (!replyText) replyText = await generatePinterestComment(candidate.content, settings.companyName, settings.companyDescription, brandMentionRate);
        if (!replyText && candidate.aiReply) replyText = candidate.aiReply;

        const looksLikeJson = /^\s*[\[{]/.test(replyText || '');
        const hasAnsi = /\x1b\[[\d;]*m/.test(replyText || '');
        const hasPayloads = /"payloads"\s*:/.test(replyText || '');

        if (looksLikeJson || hasAnsi || hasPayloads) {
          console.error('[comment] Format check failed, skipping');
        } else if (!replyText || replyText.length < 5 || /error|failed|exception|undefined|null/i.test(replyText)) {
          console.error('[comment] Safety check failed, skipping');
        } else {
          // Save the pin before commenting (natural behavior)
          if (!candidate.likedByBot) {
            try {
              const saveResult = await savePinterestPin(candidate.url, PROFILE_DIR);
              if (saveResult.success) {
                await Post.findByIdAndUpdate(candidate._id, { likedByBot: true });
                console.log('  Saved pin before commenting');
              }
              await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));
            } catch { /* non-critical */ }
          }

          console.log(`[comment] Posting on ${candidate.url} (score: ${candidate.aiRelevanceScore})`);
          const result = await postPinterestComment(candidate.url, replyText);
          if (result.success) {
            await Post.findByIdAndUpdate(candidate._id, { status: 'posted', postedAt: new Date(), editedReply: replyText, postedByAccount: accountId });
            console.log('[comment] Posted successfully');
            if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'pinterest', 'success', 'post', `Comment posted on ${candidate.url}`, { score: candidate.aiRelevanceScore });
          } else {
            await Post.findByIdAndUpdate(candidate._id, { $inc: { postAttempts: 1 } });
            console.error('[comment] Failed:', result.error);
            if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'pinterest', 'error', 'post_failed', `Failed: ${result.error || 'Unknown'}`, { url: candidate.url });
          }
        }
      } else {
        console.log('[comment] No pins above threshold');
        if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'pinterest', 'info', 'skip', 'No posts above auto-post threshold');
      }
    }
  } else {
    console.log('Comment blocked (limit/cooldown) — saves done, skipping comment');
  }

  console.log(`[${new Date().toISOString()}] Pinterest Cron: complete`);
  if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'pinterest', 'info', 'cron_end', 'Pinterest cron completed');
  await closeBrowser();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('Fatal error:', err);
  await closeBrowser().catch(() => {});
  process.exit(1);
});
