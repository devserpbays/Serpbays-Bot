/**
 * Reddit Auto-Commenter Cron Script
 *
 * Scrapes Reddit for keyword-matching posts, evaluates them with AI,
 * and auto-posts comments on high-scoring posts.
 *
 * Schedule: every 15 minutes via node-cron in server.js (auto-scheduled)
 *   Also respects Mon-Fri 9AM-6PM IST schedule guard
 *   Comments on 1 newest post per run, with 15-min cooldown between comments
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

const CRON_USER_ID = process.env.CRON_USER_ID;

// --mode=upvote  → skip commenting, only upvote relevant posts this run
// --mode=browse  → browse subreddits/feed without taking any action
const modeArg = process.argv.find(a => a.startsWith('--mode='));
const MODE: 'full' | 'upvote' | 'browse' = (modeArg?.replace('--mode=', '') as 'upvote' | 'browse') || 'full';

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { connectDB } from '../src/lib/mongodb';
import { evaluatePost, askOpenClaw } from '../src/lib/openclaw';
import {
  ensureRedditLoggedIn,
  scrapeProfileIdentity,
  scrapeSubredditPosts,
  scrapeRedditSearch,
  postRedditComment,
  checkCommentShadowRemoved,
  upvoteRedditPost,
  joinSubreddit,
  readSubredditRules,
  upvoteCommentsInThread,
  visitRedditAuthorProfile,
  crosspostRedditPost,
  closeBrowser,
  setProxy as setRedditProxy,
} from '../src/lib/reddit';
import { isWithinSchedule, getTodayStartUTC, getHourInTimezone } from '../src/lib/schedule';
import { logActivity, notifyAuthError } from '../src/lib/activityLog';
import Post from '../src/models/Post';
import Settings from '../src/models/Settings';
import BrowserCookie from '../src/models/BrowserCookie';
import { buildSuccessPatch, buildFailurePatch, getActivityProfile } from '../src/lib/accountHealth';
import { getWarmupLimit, getAccountAge, capCooldown, jitterCooldown, shouldRandomlySkip, getActionGap } from '../src/lib/antiBan';

const DEFAULT_DAILY_LIMIT = 3;  // Reddit bans accounts that post too many comments/day
const DEFAULT_AUTO_POST_THRESHOLD = 70;

function extractSubreddit(url: string): string {
  const m = url.match(/reddit\.com\/r\/([^/]+)/i);
  return m ? m[1].toLowerCase() : '';
}

// Valid subreddit names: alphanumeric + underscores, no spaces
function isValidSubreddit(name: string): boolean {
  return /^[a-zA-Z0-9_]{2,21}$/.test(name);
}

function getSessionType(timezone: string): 'skip' | 'browse_only' | 'react_only' | 'full' {
  const hour = getHourInTimezone(timezone);
  if (hour < 6 || hour >= 23) return 'skip';
  if (hour < 9 || hour >= 21) return 'browse_only';
  if (hour < 10 || hour >= 20) return 'react_only';
  return 'full';
}

function getTimeOfDayMultiplier(timezone: string): number {
  const hour = getHourInTimezone(timezone);
  if (hour < 6 || hour >= 23) return 0;
  if (hour < 8 || hour >= 22) return 0.2;
  if (hour < 9 || hour >= 21) return 0.4;
  if (hour < 10 || hour >= 20) return 0.6;
  if (hour >= 11 && hour < 18) return 1.0;
  return 0.8;
}

if (CRON_USER_ID && !process.env.REDDIT_PROFILE_DIR) {
  console.log('No Reddit account connected for this user, skipping.');
  process.exit(0);
}

// --- Read current Reddit account identity ---
function getVerifiedData(): Record<string, string> {
  const profileDir = process.env.REDDIT_PROFILE_DIR
    ? join(process.cwd(), process.env.REDDIT_PROFILE_DIR)
    : join(process.cwd(), '.reddit-profile');
  try {
    const raw = readFileSync(join(profileDir, '.verified'), 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function getCurrentAccountId(): string {
  return getVerifiedData().accountId || '';
}

// --- Count comments posted today for the current account ---
async function getTodayCommentCount(accountId: string, timezone = 'UTC'): Promise<number> {
  const startOfDayUTC = getTodayStartUTC(timezone);

  const query: Record<string, unknown> = {
    platform: 'reddit',
    status: 'posted',
    postedAt: { $gte: startOfDayUTC },
  };
  if (accountId) {
    query.postedByAccount = accountId;
  }
  if (CRON_USER_ID) query.userId = CRON_USER_ID;

  return Post.countDocuments(query);
}

// --- Generate a unique, natural Reddit comment mentioning the company ---
async function generateVariedComment(
  postContent: string,
  companyName: string,
  companyDescription: string,
  brandMentionRate = 25
): Promise<string> {
  const randomSeed = Math.floor(Math.random() * 1000);
  const mentionBrand = Math.random() < (brandMentionRate / 100);

  const genericStyles = [
    'add a genuinely helpful tip or insight related to the post',
    'ask a thoughtful follow-up question about the topic',
    'share a personal experience or lesson relevant to the discussion',
    'give a practical recommendation based on the post topic',
    'agree with something specific and add a related observation',
  ];
  const brandStyles = [
    `give a helpful tip; only if completely natural, briefly mention ${companyName} — don't force it`,
    `share a genuine insight; if it fits organically, mention you've also used ${companyName} — otherwise skip it`,
  ];
  const stylePool = mentionBrand ? brandStyles : genericStyles;
  const style = stylePool[randomSeed % stylePool.length];

  const prompt = `You are a real Redditor leaving a genuine comment on a post.

POST:
"""
${postContent.slice(0, 500)}
"""

YOUR TASK: Write a SHORT 1-2 sentence comment that ${style}.

STRICT RULES:
- MAXIMUM 200 characters — be brief like a real Reddit comment
- Write ONLY the comment text, nothing else
- Sound like a real person, NOT a marketer or salesperson
- NEVER use phrases like "check out X", "X is great for", "highly recommend X", "I've been using X"
- NEVER include website URLs or domains
- The comment must genuinely add value to the discussion
- Use casual, natural Reddit language
- Do NOT include any code, errors, JSON, or technical output
${mentionBrand ? `- Company context if it fits: ${companyDescription}` : ''}
- Seed: ${randomSeed}

Write the comment now:`;

  try {
    const raw = await askOpenClaw(prompt);

    let comment = raw;

    // If response is JSON, extract the text field
    if (comment.trimStart().startsWith('{')) {
      try {
        const parsed = JSON.parse(comment);
        comment = parsed?.payloads?.[0]?.text
          || parsed?.result?.content
          || parsed?.content
          || parsed?.message
          || '';
      } catch {
        const textMatch = comment.match(/"text"\s*:\s*"([^"]+)"/);
        if (textMatch) {
          comment = textMatch[1];
        }
      }
    }

    // Clean up the response
    comment = comment
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/^(Comment|Reply|Response|Here'?s?\s*(the|my|a)?\s*(comment|reply)?:?\s*)/i, '')
      .replace(/\n/g, ' ')
      .replace(/https?:\/\/\S+/gi, '')
      .replace(new RegExp(companyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\.com', 'gi'), companyName)
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (comment.length > 250) {
      comment = comment.slice(0, 247) + '...';
    }

    return comment;
  } catch (err) {
    console.error('Failed to generate varied comment:', (err as Error).message);
    return '';
  }
}

async function main() {
  console.log(`[${new Date().toISOString()}] Reddit Cron: starting (user: ${CRON_USER_ID || 'default'})`);
  if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'reddit', 'info', 'cron_start', 'Reddit cron started');

  await connectDB();

  // Step 1: Load settings (needed for schedule check)
  const settings = await Settings.findOne(CRON_USER_ID ? { userId: CRON_USER_ID } : {});
  if (!settings) {
    console.error('No settings configured, exiting');
    process.exit(0);
  }

  if (!settings.companyName) {
    console.log('No company name configured. Set it in dashboard settings.');
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'reddit', 'error', 'config_error', 'No company name configured');
    process.exit(0);
  }

  // Step 1b: Schedule guard (uses per-platform schedule if configured, else global cron schedule)
  const cronTz = (settings as any).cronTimezone || '';
  const platformSchedule = (settings as any).platformSchedules?.get?.('reddit') || null;
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

  const tz = cronTz || 'UTC';
  const hour = getHourInTimezone(tz);
  const sessionType = getSessionType(tz);
  const multiplier = getTimeOfDayMultiplier(tz);

  if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'reddit', 'info', 'session_start',
    `Session started — type: ${sessionType}, hour: ${hour}:00 ${tz}, activity: ${Math.round(multiplier * 100)}%`,
    { sessionType, hour, activityMultiplier: multiplier },
  );

  // Session type gate (skip during late night/early morning)
  if (!process.env.CRON_MANUAL) {
    if (sessionType === 'skip') {
      console.log('Outside active hours (session=skip), exiting');
      if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'reddit', 'info', 'session_skip', `Skipping — outside active hours (${hour}:00 ${tz})`);
      process.exit(0);
    }

    // Time-of-day probabilistic gate
    if (Math.random() > multiplier) {
      console.log(`Time-of-day gate: skipping (multiplier=${multiplier.toFixed(2)})`);
      if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'reddit', 'info', 'session_skip', `Time-of-day gate skipped run (${Math.round(multiplier * 100)}% activity at ${hour}:00)`);
      process.exit(0);
    }

    // Random skip (15% chance — anti-ban variability)
    if (shouldRandomlySkip(0.15)) {
      console.log('Random skip (anti-ban), exiting');
      if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'reddit', 'info', 'session_skip', 'Random skip (15% anti-ban variability) — no action this run');
      process.exit(0);
    }
  }

  // Account health guard — check autoPaused, backoff, and browse-only cooldown
  let browseOnlyOverride = false;
  if (CRON_USER_ID) {
    const cookieDoc = await BrowserCookie.findOne({ userId: CRON_USER_ID, platform: 'reddit' }).lean() as any;
    // Apply per-account proxy before any browser launch
    if (cookieDoc?.proxyUrl) setRedditProxy(cookieDoc.proxyUrl as string);
    if (cookieDoc?.autoPaused) {
      console.log(`Reddit account auto-paused: ${cookieDoc.autoPausedReason || 'unknown reason'}`);
      await logActivity(CRON_USER_ID, 'reddit', 'warn', 'auto_paused', `Auto-paused: ${cookieDoc.autoPausedReason || 'unknown'}`);
      process.exit(0);
    }
    if (cookieDoc?.backoffUntil && new Date(cookieDoc.backoffUntil) > new Date()) {
      const remaining = Math.ceil((new Date(cookieDoc.backoffUntil).getTime() - Date.now()) / 60000);
      console.log(`Reddit account in backoff for ${remaining}m more, skipping`);
      await logActivity(CRON_USER_ID, 'reddit', 'warn', 'backoff', `Account in backoff — ${remaining}m remaining. Cron skipped.`, { remainingMinutes: remaining });
      process.exit(0);
    }
    if (cookieDoc?.browseOnlyUntil && new Date(cookieDoc.browseOnlyUntil) > new Date()) {
      const remainH = Math.ceil((new Date(cookieDoc.browseOnlyUntil).getTime() - Date.now()) / 3600000);
      console.warn(`Reddit in browse-only mode for ${remainH}h more (automation cooldown) — scraping/upvoting only, no commenting.`);
      await logActivity(CRON_USER_ID, 'reddit', 'warn', 'browse_only', `Browse-only mode — ${remainH}h remaining. Commenting skipped, upvoting continues.`);
      browseOnlyOverride = true;
    }
  }

  const keywords: string[] = settings.redditKeywords?.length
    ? settings.redditKeywords
    : (settings.keywords?.length ? settings.keywords : []);
  if (keywords.length === 0) {
    console.log('No Reddit keywords configured. Add keywords in dashboard settings.');
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'reddit', 'warn', 'config_error', 'No Reddit keywords configured');
    process.exit(0);
  }
  const configuredDailyLimit: number = settings.redditDailyLimit ?? DEFAULT_DAILY_LIMIT;
  const accountAddedAt = getAccountAge(settings, 'reddit');
  let dailyLimit: number = getWarmupLimit(configuredDailyLimit, accountAddedAt, 'reddit');
  if (dailyLimit < configuredDailyLimit) {
    console.log(`Warmup mode: daily limit capped at ${dailyLimit}/${configuredDailyLimit} (account age < 60 days)`);
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'reddit', 'info', 'warmup', `Warmup limit: ${dailyLimit}/${configuredDailyLimit}`);
  }

  // ── Adaptive health throttling ──
  // Reads the stored healthScore and adjusts comment limits + triggers browse-only recovery
  if (CRON_USER_ID) {
    const redditDoc = await BrowserCookie.findOne({ userId: CRON_USER_ID, platform: 'reddit' }).lean() as any;
    const healthScore: number = redditDoc?.healthScore ?? 100;
    const actProfile = getActivityProfile(healthScore);

    // --mode=upvote always forces browse-only regardless of health
    if (MODE === 'upvote') {
      browseOnlyOverride = true;
      dailyLimit = 0;
    } else if (actProfile.needsRecovery) {
      // Health < 50 — enter browse-only recovery unless already in one
      const alreadyInRecovery = !!(redditDoc?.browseOnlyUntil && new Date(redditDoc.browseOnlyUntil) > new Date());
      if (!alreadyInRecovery) {
        const until = new Date(Date.now() + actProfile.recoveryDays * 86400000);
        await BrowserCookie.findOneAndUpdate(
          { userId: CRON_USER_ID, platform: 'reddit' },
          { $set: { browseOnlyUntil: until } },
          { upsert: true },
        );
        console.warn(`[Health] Score ${healthScore}/100 — starting ${actProfile.recoveryDays}-day browse-only recovery (until ${until.toDateString()})`);
        if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'reddit', 'warn', 'health_recovery',
          `Health ${healthScore}/100 — ${actProfile.recoveryDays}-day browse-only recovery: upvoting only, no comments`,
          { healthScore, recoveryDays: actProfile.recoveryDays, until: until.toISOString() },
        );
        browseOnlyOverride = true;
      }
      dailyLimit = 0; // no commenting during recovery
    } else if (actProfile.commentMultiplier < 1 && dailyLimit > 1) {
      const throttledLimit = Math.max(1, Math.floor(dailyLimit * actProfile.commentMultiplier));
      if (throttledLimit < dailyLimit) {
        console.warn(`[Health] Score ${healthScore}/100 (${actProfile.label}) — daily limit throttled: ${throttledLimit}/${dailyLimit}`);
        if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'reddit', 'warn', 'health_throttle',
          `Health throttle: ${throttledLimit}/${dailyLimit} comments/day (${actProfile.label}, health ${healthScore}/100)`,
        );
        dailyLimit = throttledLimit;
      }
    }
  }
  const autoPostThreshold: number =
    settings.redditAutoPostThreshold ?? DEFAULT_AUTO_POST_THRESHOLD;
  const brandMentionRate: number = (settings as any).redditBrandMentionRate ?? 25;
  const cooldownMinutes: number = capCooldown('reddit', (settings as any).redditCooldownMinutes ?? 90);

  // Step 2b: Read current account identity
  const accountId = getCurrentAccountId();
  if (accountId) {
    console.log(`Active Reddit account: ${accountId}`);
  }

  // Step 3: Check daily limit (per-account)
  // Daily limit + cooldown → flags only (don't exit, let upvotes/scraping continue)
  let rdCommentBlocked = false;
  const todayCount = await getTodayCommentCount(accountId, tz);
  if (todayCount >= dailyLimit) {
    console.log(`Comment limit reached: ${todayCount}/${dailyLimit} — commenting blocked, upvotes continue`);
    rdCommentBlocked = true;
  } else {
    console.log(`Comments posted today: ${todayCount}/${dailyLimit}${accountId ? ` (account: ${accountId})` : ''}`);
  }

  if (!rdCommentBlocked && !process.env.CRON_MANUAL && !browseOnlyOverride && MODE === 'full') {
    const MIN_COMMENT_GAP_MS = jitterCooldown(cooldownMinutes);
    const lastPosted = await Post.findOne({ platform: 'reddit', status: 'posted', postedAt: { $exists: true }, ...(CRON_USER_ID && { userId: CRON_USER_ID }) })
      .sort({ postedAt: -1 })
      .select('postedAt platform');
    if (lastPosted?.postedAt) {
      const elapsed = Date.now() - new Date(lastPosted.postedAt).getTime();
      if (elapsed < MIN_COMMENT_GAP_MS) {
        const remainMin = Math.ceil((MIN_COMMENT_GAP_MS - elapsed) / 60000);
        console.log(`Cooldown: ${remainMin}m remaining — commenting blocked, upvotes continue`);
        rdCommentBlocked = true;
      }
    }
  }

  // Step 4: Ensure logged in
  const loggedIn = await ensureRedditLoggedIn();
  if (!loggedIn) {
    try {
      writeFileSync(join(process.cwd(), '.reddit-profile', '.verified'), JSON.stringify({ loggedIn: false, ts: new Date().toISOString(), message: 'Session expired — cron detected not logged in' }));
    } catch {}
    const loginFailReason = 'Reddit session expired — re-set cookies from dashboard';
    console.error(`Not logged in to Reddit: ${loginFailReason}`);
    if (CRON_USER_ID) {
      await BrowserCookie.findOneAndUpdate(
        { userId: CRON_USER_ID, platform: 'reddit' },
        { $set: { autoPaused: true, autoPausedReason: loginFailReason, updatedAt: new Date() } },
        { upsert: true },
      );
      await logActivity(CRON_USER_ID, 'reddit', 'error', 'auth_error', loginFailReason);
      await notifyAuthError(CRON_USER_ID, 'reddit', loginFailReason);
    }
    await closeBrowser();
    process.exit(1);
  }
  console.log('Reddit login confirmed');

  // Re-write .verified with loggedIn: true; scrape identity if missing
  try {
    const existing = getVerifiedData();
    let aid = existing.accountId || '';
    let dn = existing.displayName || '';
    let un = existing.username || '';
    if (!aid || !un) {
      const scraped = await scrapeProfileIdentity();
      aid = aid || scraped.accountId;
      dn = dn || scraped.displayName;
      un = un || scraped.username;
    }
    writeFileSync(join(process.cwd(), '.reddit-profile', '.verified'), JSON.stringify({
      loggedIn: true, ts: new Date().toISOString(),
      message: 'Reddit session verified by cron',
      accountId: aid, displayName: dn, username: un,
    }));
  } catch {}

  // ── Browse-only mode ──────────────────────────────────────────────────────
  // --mode=browse: log in, scroll the front page / configured subreddits, then exit.
  // No upvoting, no commenting — purely simulates a human browsing session.
  if (MODE === 'browse') {
    const subreddits = settings.subreddits?.length ? settings.subreddits as string[] : [];
    const browseMs = 45_000 + Math.random() * 45_000; // 45–90s
    console.log(`[Browse] Scrolling Reddit feed for ${Math.round(browseMs / 1000)}s`);
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'reddit', 'info', 'browse_feed',
      `Browse-only run: scrolled feed for ${Math.round(browseMs / 1000)}s${subreddits.length ? ` across ${subreddits.length} subreddit(s)` : ''}`,
      { durationMs: browseMs, subreddits },
    );
    // Visit up to 2 configured subreddits as part of the browse session
    for (const sub of subreddits.slice(0, 2)) {
      try {
        await scrapeSubredditPosts(sub, []); // load page for browsing, ignore results
        console.log(`[Browse] Visited r/${sub}`);
      } catch { /* non-critical */ }
      await new Promise(r => setTimeout(r, 5000 + Math.random() * 5000));
    }
    await new Promise(r => setTimeout(r, browseMs));
    await closeBrowser();
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'reddit', 'info', 'cron_end', 'Reddit cron completed (browse mode)');
    process.exit(0);
  }

  // ── Upvote-only mode log ──────────────────────────────────────────────────
  if (MODE === 'upvote') {
    console.log('[Upvote] Upvote-only mode — skipping scrape/comment, upvoting relevant posts');
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'reddit', 'info', 'upvote_only',
      'Upvote-only run: will upvote relevant evaluated posts without commenting',
    );
  }

  // Step 5: Scrape posts — skip in upvote-only mode (use existing DB posts instead)
  let allPosts: Array<{ url: string; author: string; content: string; subreddit: string }> = [];

  if (MODE !== 'upvote') {
    if (settings.subreddits?.length) {
      // Scrape configured subreddits
      for (const sub of settings.subreddits) {
        try {
          const posts = await scrapeSubredditPosts(sub, keywords);
          allPosts = allPosts.concat(posts);
          console.log(`  r/${sub}: found ${posts.length} keyword-matching posts`);
        } catch (err) {
          console.error(`  Error scraping r/${sub}:`, (err as Error).message);
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
    } else {
      // Fallback: search Reddit for keywords
      const searchResults = await scrapeRedditSearch(keywords);
      allPosts = searchResults;
      console.log(`Search found ${allPosts.length} keyword-matching posts`);
    }

    console.log(`Total keyword-matching posts found: ${allPosts.length}`);
  }

  // Step 6: Save new posts to DB (skipped in upvote-only mode)
  if (MODE !== 'upvote') {
    let newPostCount = 0;
    for (const post of allPosts) {
      const exists = await Post.findOne({ url: post.url, ...(CRON_USER_ID && { userId: CRON_USER_ID }) });
      if (!exists) {
        await Post.create({
          url: post.url,
          platform: 'reddit',
          ...(CRON_USER_ID && { userId: CRON_USER_ID }),
          author: post.author,
          content: post.content,
          keywordsMatched: keywords.filter((kw) =>
            post.content.toLowerCase().includes(kw.toLowerCase())
          ),
          status: 'new',
        });
        newPostCount++;
      }
    }
    console.log(`Saved ${newPostCount} new posts to DB`);
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'reddit', 'info', 'scrape', `Scraped ${allPosts.length} posts, saved ${newPostCount} new ones`);

    // Step 7: Evaluate unevaluated Reddit posts
    const unevaluatedPosts = await Post.find({
      platform: 'reddit',
      status: 'new',
      ...(CRON_USER_ID && { userId: CRON_USER_ID }),
    }).limit(10);

    console.log(`Evaluating ${unevaluatedPosts.length} new Reddit posts`);

    for (const post of unevaluatedPosts) {
      try {
        await Post.findByIdAndUpdate(post._id, { status: 'evaluating' });

        const evaluation = await evaluatePost(
          post.content,
          settings.companyName,
          settings.companyDescription,
          settings.promptTemplate || undefined
        );

        await Post.findByIdAndUpdate(post._id, {
          status: 'evaluated',
          aiReply: evaluation.suggestedReply,
          aiRelevanceScore: evaluation.score,
          aiTone: evaluation.tone,
          aiReasoning: evaluation.reasoning,
          evaluatedAt: new Date(),
        });

        console.log(`  Post ${post._id}: score=${evaluation.score}`);
      } catch (err) {
        console.error(`  Failed to evaluate post ${post._id}:`, (err as Error).message);
        await Post.findByIdAndUpdate(post._id, { status: 'new' });
      }
    }
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'reddit', 'info', 'evaluate', `Evaluated ${unevaluatedPosts.length} posts`);
  }

  // ── Guaranteed upvote pass (80% of sessions) ─────────────────────────────
  // Upvoting is the safest engagement action on Reddit — always attempt it
  // regardless of what the action picker selects below.
  const todayEngageStart = getTodayStartUTC(tz);
  const todayUpvoteCount = await Post.countDocuments({ platform: 'reddit', likedByBot: true, updatedAt: { $gte: todayEngageStart }, ...(CRON_USER_ID && { userId: CRON_USER_ID }) });
  const isWarmupEngage = dailyLimit === 0;
  const dailyUpvoteTarget = isWarmupEngage ? 5 + Math.floor(Math.random() * 4) : 3 + Math.floor(Math.random() * 3);
  const upvoteRemaining = Math.max(0, dailyUpvoteTarget - todayUpvoteCount);

  const shouldUpvoteRd = isWarmupEngage ? true : Math.random() < 0.80;
  if (upvoteRemaining > 0 && shouldUpvoteRd) {
    const thisSessionUpvotes = Math.min(upvoteRemaining, isWarmupEngage ? 2 + Math.floor(Math.random() * 2) : 1 + Math.floor(Math.random() * 2));
    // No freshness filter for upvotes — evaluated posts stay valid for upvoting
    const upCandidates = await Post.find({
      platform: 'reddit',
      status: { $in: ['evaluated', 'posted'] },
      aiRelevanceScore: { $gte: Math.min(autoPostThreshold, 50) },
      likedByBot: { $ne: true },
      postDeleted: { $ne: true },
      ...(CRON_USER_ID && { userId: CRON_USER_ID }),
    }).sort({ aiRelevanceScore: -1 }).limit(thisSessionUpvotes);

    if (upCandidates.length > 0) {
      let upvoted = 0;
      console.log(`[Upvote] Guaranteed pass: upvoting up to ${thisSessionUpvotes} posts (${todayUpvoteCount}/${dailyUpvoteTarget} today)`);
      for (const candidate of upCandidates) {
        try {
          console.log(`  Upvoting: ${(candidate.url as string).slice(0, 70)}`);
          const success = await upvoteRedditPost(candidate.url as string);
          if (success) {
            await Post.findByIdAndUpdate(candidate._id, { likedByBot: true });
            upvoted++;
            if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'reddit', 'info', 'upvote_post',
              `Upvoted a post (score ${candidate.aiRelevanceScore})`,
              { url: candidate.url, score: candidate.aiRelevanceScore },
            );
          } else {
            console.log('  Upvote returned false — button not found or already upvoted');
          }
          await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000)); // 2-4s gap (was 3-7s)
        } catch (e) { console.warn('  Upvote error:', (e as Error).message); }
      }
      console.log(`[Upvote] Done: upvoted ${upvoted} posts`);
    }
  }

  // ── Unified main action phase (Twitter-style) ─────────────────────────────
  // Pick 0–3 actions per run from a weighted pool, shuffle execution order,
  // then run with bell-curve delays between each.
  type RedditAction = 'browse_feed' | 'crosspost' | 'comment';

  const noCommentMode = browseOnlyOverride || rdCommentBlocked || (!process.env.CRON_MANUAL && sessionType !== 'full');
  const validSubs = (settings.subreddits as string[] || []).filter(isValidSubreddit);
  const hasCrosspostSubs = validSubs.length >= 2;

  const rdWeights: Record<RedditAction, number> = {
    browse_feed: 30,  // scroll subreddits without acting
    crosspost:   hasCrosspostSubs ? 12 : 0, // only if 2+ subs
    comment:     noCommentMode ? 0 : 25,    // full sessions only
  };

  const RD_RUN_COUNT_DIST = [
    { count: 0, weight: 10 },
    { count: 1, weight: 30 },
    { count: 2, weight: 40 },
    { count: 3, weight: 20 },
  ];

  function pickRdRunCount(): number {
    const total = RD_RUN_COUNT_DIST.reduce((s, d) => s + d.weight, 0);
    let r = Math.random() * total;
    for (const { count, weight } of RD_RUN_COUNT_DIST) { r -= weight; if (r <= 0) return count; }
    return 1;
  }

  function pickRdActions(weights: Record<RedditAction, number>, n: number): RedditAction[] {
    const pool = (Object.entries(weights) as [RedditAction, number][]).filter(([, w]) => w > 0);
    const selected: RedditAction[] = [];
    while (selected.length < n && pool.length > 0) {
      const total = pool.reduce((s, [, w]) => s + w, 0);
      if (total <= 0) break;
      let r = Math.random() * total;
      let idx = pool.length - 1;
      for (let i = 0; i < pool.length; i++) { r -= pool[i][1]; if (r <= 0) { idx = i; break; } }
      selected.push(pool[idx][0]);
      pool.splice(idx, 1);
    }
    for (let i = selected.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [selected[i], selected[j]] = [selected[j], selected[i]];
    }
    return selected;
  }

  function rdBetweenDelay(): Promise<void> {
    const r1 = Math.random(), r2 = Math.random();
    const ms = Math.round(30_000 + ((r1 + r2) / 2) * 150_000);
    console.log(`[Social] Waiting ${Math.round(ms / 1000)}s before next action...`);
    return new Promise(r => setTimeout(r, ms));
  }

  const rdRunCount = pickRdRunCount();
  const rdActions = pickRdActions(rdWeights, rdRunCount);
  console.log(`Main action phase: ${rdRunCount} action(s) — [${rdActions.join(', ') || 'none (warmup-only run)'}]`);
  if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'reddit', 'info', 'social', `Active session — plan: ${rdActions.join(' → ') || 'idle'}`, { actions: rdActions });

  for (let ai = 0; ai < rdActions.length; ai++) {
    if (ai > 0) await rdBetweenDelay();
    const action = rdActions[ai];

    // ── browse_feed ───────────────────────────────────────────────────────
    if (action === 'browse_feed') {
      const subreddits = settings.subreddits?.length ? settings.subreddits as string[] : [];
      const browseCount = 1 + Math.floor(Math.random() * 2); // visit 1-2 subs
      const browsedSubs: string[] = [];
      console.log(`[browse_feed] Browsing ${browseCount} subreddit(s)`);
      for (const sub of subreddits.slice(0, browseCount)) {
        try {
          await scrapeSubredditPosts(sub, []);
          browsedSubs.push(sub);
          console.log(`  Visited r/${sub}`);
        } catch { /* non-critical */ }
        await new Promise(r => setTimeout(r, getActionGap()));
      }
      if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'reddit', 'info', 'browse_feed',
        `Browsed r/${browsedSubs.join(', r/')}`,
        { count: browsedSubs.length, subreddits: browsedSubs },
      );

    // ── crosspost ─────────────────────────────────────────────────────────
    } else if (action === 'crosspost') {
      try {
        const crosspostSource = await Post.findOne({
          platform: 'reddit',
          status: { $in: ['new', 'evaluated'] },
          crosspostedByBot: { $ne: true },
          ...(CRON_USER_ID && { userId: CRON_USER_ID }),
        }).sort({ _id: -1 }).lean();

        if (crosspostSource) {
          const sourceSubreddit = extractSubreddit(crosspostSource.url as string);
          const otherSubs = validSubs.filter(s => s.toLowerCase() !== sourceSubreddit);
          if (otherSubs.length > 0) {
            const targetSubreddit = otherSubs[Math.floor(Math.random() * otherSubs.length)];
            console.log(`[crosspost] r/${sourceSubreddit} → r/${targetSubreddit}`);
            const cpResult = await crosspostRedditPost(crosspostSource.url as string, targetSubreddit);
            if (cpResult.success) {
              await Post.findByIdAndUpdate(crosspostSource._id, { crosspostedByBot: true });
              console.log('[crosspost] Success');
              if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'reddit', 'info', 'crosspost',
                `Crossposted to r/${targetSubreddit}`, { sourceUrl: crosspostSource.url, targetSubreddit },
              );
            } else {
              console.warn(`[crosspost] Failed: ${cpResult.error}`);
              if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'reddit', 'warn', 'crosspost_failed',
                `Crosspost to r/${targetSubreddit} failed: ${cpResult.error}`,
              );
            }
          }
        } else {
          console.log('[crosspost] No candidates found');
        }
      } catch (e) { console.warn('[crosspost] Error:', (e as Error).message); }

    // ── comment ───────────────────────────────────────────────────────────
    } else if (action === 'comment') {
      const recheck = await getTodayCommentCount(accountId, tz);
      if (recheck >= dailyLimit) {
        console.log(`[comment] Daily limit reached (${recheck}/${dailyLimit}) — skipping`);
        if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'reddit', 'info', 'limit', `Daily limit reached (${recheck}/${dailyLimit}). Will resume tomorrow.`);
      } else {
        // Author dedup (7 days)
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const recentlyPostedOn = await Post.find({ platform: 'reddit', status: 'posted', postedAt: { $gte: sevenDaysAgo }, ...(CRON_USER_ID && { userId: CRON_USER_ID }) }).select('author url').lean();
        const recentAuthors = new Set(recentlyPostedOn.map(p => p.author as string).filter(a => a && a !== 'Unknown'));
        if (recentAuthors.size > 0 && CRON_USER_ID) await logActivity(CRON_USER_ID, 'reddit', 'info', 'author_dedup', `Skipping ${recentAuthors.size} author(s) engaged in last 7 days`, { count: recentAuthors.size });

        // Subreddit dedup (1/sub/day)
        const todayStart = getTodayStartUTC(tz);
        const todayPosted = await Post.find({ platform: 'reddit', status: 'posted', postedAt: { $gte: todayStart }, ...(CRON_USER_ID && { userId: CRON_USER_ID }) }).select('url').lean();
        const todaySubreddits = new Set(todayPosted.map(p => extractSubreddit(p.url as string)).filter(Boolean));

        // Reddit posts stay relevant — 7-day window for comments
        const freshCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const candidates = await Post.find({
          platform: 'reddit', status: 'evaluated',
          aiRelevanceScore: { $gte: autoPostThreshold },
          aiReply: { $exists: true, $ne: '' },
          postAttempts: { $not: { $gte: 3 } },
          postDeleted: { $ne: true },
          scrapedAt: { $gte: freshCutoff },
          ...(CRON_USER_ID && { userId: CRON_USER_ID }),
        }).sort({ _id: -1 }).limit(20).lean();

        const autoPostCandidate = candidates.find(c => {
          if (c.author && c.author !== 'Unknown' && recentAuthors.has(c.author as string)) return false;
          if (todaySubreddits.has(extractSubreddit(c.url as string))) return false;
          return true;
        }) || null;

        if (!autoPostCandidate && candidates.length > 0) {
          console.log(`[comment] All ${candidates.length} candidate(s) filtered by dedup`);
        }

        if (autoPostCandidate) {
    let replyText = autoPostCandidate.editedReply || '';

    if (!replyText) {
      replyText = await generateVariedComment(
        autoPostCandidate.content,
        settings.companyName,
        settings.companyDescription,
        brandMentionRate
      );
    }

    // Fallback to existing AI reply if fresh generation failed
    if (!replyText && autoPostCandidate.aiReply) {
      console.log('Using existing aiReply as fallback');
      replyText = autoPostCandidate.aiReply;
    }

    // ── Pre-post preview ─────────────────────────────────────────────────────
    console.log('─'.repeat(60));
    console.log('COMMENT PREVIEW (before posting)');
    console.log(`  Post URL : ${autoPostCandidate.url}`);
    console.log(`  Score    : ${autoPostCandidate.aiRelevanceScore}`);
    console.log(`  Length   : ${replyText?.length ?? 0} chars`);
    console.log(`  Text     :\n\n${replyText}\n`);
    console.log('─'.repeat(60));

    // Detect if the comment looks like JSON or still has ANSI/payload garbage
    const looksLikeJson = /^\s*[\[{]/.test(replyText || '');
    const hasAnsi = /\x1b\[[\d;]*m/.test(replyText || '');
    const hasPayloads = /"payloads"\s*:/.test(replyText || '');

    if (looksLikeJson || hasAnsi || hasPayloads) {
      console.error('COMMENT FAILED FORMAT CHECK — contains JSON/ANSI garbage, skipping');
      console.error('  looksLikeJson:', looksLikeJson, '| hasAnsi:', hasAnsi, '| hasPayloads:', hasPayloads);
      if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'reddit', 'warn', 'comment_format_error', 'Generated comment failed format check (JSON/ANSI garbage) — skipped', { url: autoPostCandidate.url });
    } else if (!replyText || replyText.length < 5 || /error|failed|exception|undefined|null/i.test(replyText)) {
      console.error('Generated comment failed safety check, skipping:', replyText?.slice(0, 100));
      if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'reddit', 'warn', 'comment_safety_error', 'Generated comment failed safety check — skipped', { url: autoPostCandidate.url });
    } else {
      console.log(
        `Auto-posting comment on ${autoPostCandidate.url} (score: ${autoPostCandidate.aiRelevanceScore})`
      );

      // Warm-up: join subreddit → read rules → upvote existing comments → visit author profile
      const targetSubreddit = extractSubreddit(autoPostCandidate.url);
      if (targetSubreddit) {
        try {
          console.log(`  Warm-up: joining r/${targetSubreddit}`);
          const joined = await joinSubreddit(targetSubreddit);
          if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'reddit', 'info', 'join_subreddit',
            joined ? `Joined r/${targetSubreddit}` : `Already a member of r/${targetSubreddit}`,
            { subreddit: targetSubreddit },
          );
          await new Promise((r) => setTimeout(r, getActionGap()));

          console.log(`  Warm-up: reading rules for r/${targetSubreddit}`);
          const rules = await readSubredditRules(targetSubreddit);
          if (rules.length > 0) console.log(`    Found ${rules.length} rule(s) — respecting community guidelines`);
          if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'reddit', 'info', 'read_rules',
            `Read ${rules.length} rule(s) for r/${targetSubreddit} before commenting`,
            { subreddit: targetSubreddit, ruleCount: rules.length },
          );
          await new Promise((r) => setTimeout(r, getActionGap()));

          console.log('  Warm-up: upvoting existing comments in thread');
          const upvoted = await upvoteCommentsInThread(autoPostCandidate.url, 2);
          console.log(`    Upvoted ${upvoted} comment(s)`);
          if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'reddit', 'info', 'upvote_comments',
            `Upvoted ${upvoted} existing comment(s) in thread before posting`,
            { count: upvoted, url: autoPostCandidate.url },
          );
          await new Promise((r) => setTimeout(r, getActionGap()));
        } catch (e) {
          console.warn('  Warm-up step failed, continuing:', (e as Error).message);
          if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'reddit', 'warn', 'warmup_failed',
            `Warm-up step failed (non-critical): ${(e as Error).message}`,
          );
        }
      }

      // Visit author profile before commenting (humanizes session)
      if (autoPostCandidate.author && autoPostCandidate.author !== 'Unknown') {
        try {
          console.log(`  Visiting author profile: u/${autoPostCandidate.author}`);
          await visitRedditAuthorProfile(autoPostCandidate.author as string);
          if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'reddit', 'info', 'visit_profile',
            `Visited author profile u/${autoPostCandidate.author} before commenting`,
            { author: autoPostCandidate.author },
          );
          await new Promise((r) => setTimeout(r, getActionGap()));
        } catch (e) { /* non-critical */ }
      }

      // Upvote the post itself before commenting
      if (!autoPostCandidate.likedByBot) {
        try {
          await upvoteRedditPost(autoPostCandidate.url);
          await Post.findByIdAndUpdate(autoPostCandidate._id, { likedByBot: true });
          console.log('  Upvoted post');
          if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'reddit', 'info', 'upvote_post',
            `Upvoted target post before commenting`,
            { url: autoPostCandidate.url },
          );
          await new Promise((r) => setTimeout(r, 2000 + Math.random() * 2000));
        } catch (e) { console.warn('Upvote failed, continuing:', (e as Error).message); }
      }

      const result = await postRedditComment(autoPostCandidate.url, replyText);

      if (result.success) {
        await Post.findByIdAndUpdate(autoPostCandidate._id, {
          status: 'posted',
          postedAt: new Date(),
          editedReply: replyText,
          postedByAccount: accountId,
        });
        // Update account health on success
        if (CRON_USER_ID) {
          const acc = await BrowserCookie.findOne({ userId: CRON_USER_ID, platform: 'reddit' }).lean();
          if (acc) {
            const patch = buildSuccessPatch(acc as Parameters<typeof buildSuccessPatch>[0]);
            await BrowserCookie.updateOne({ userId: CRON_USER_ID, platform: 'reddit' }, patch.$set ? { $set: patch.$set } : patch);
          }
        }
        console.log(`Comment posted successfully${accountId ? ` (account: ${accountId})` : ''}`);
        if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'reddit', 'success', 'post', `Comment posted on ${autoPostCandidate.url}`, { score: autoPostCandidate.aiRelevanceScore });

        // Shadow-removal check: re-visit post after 40s to verify comment is still visible
        try {
          const shadowStatus = await checkCommentShadowRemoved(autoPostCandidate.url, replyText.slice(0, 30));
          if (shadowStatus === 'removed') {
            console.warn(`[Shadow] Comment disappeared after 40s — likely shadow-removed by Reddit spam filter`);
            await Post.findByIdAndUpdate(autoPostCandidate._id, { status: 'failed' });
            if (CRON_USER_ID) {
              await logActivity(CRON_USER_ID, 'reddit', 'warn', 'shadow_removal',
                'Comment shadow-removed by Reddit — not visible on re-visit. Applying 4h backoff.',
                { url: autoPostCandidate.url },
              );
              const acc = await BrowserCookie.findOne({ userId: CRON_USER_ID, platform: 'reddit' }).lean();
              if (acc) {
                const backoffUntil = new Date(Date.now() + 4 * 60 * 60 * 1000);
                const patch = buildFailurePatch(acc as Parameters<typeof buildFailurePatch>[0], backoffUntil);
                await BrowserCookie.updateOne({ userId: CRON_USER_ID, platform: 'reddit' }, { $set: patch.$set });
              }
            }
          } else {
            console.log(`[Shadow] Comment status: ${shadowStatus} — ${shadowStatus === 'visible' ? 'confirmed visible' : 'unknown (treating as ok)'}`);
          }
        } catch (e) {
          console.warn('[Shadow] Shadow-removal check failed (non-critical):', (e as Error).message);
        }
      } else {
        const newAttempts = (autoPostCandidate.postAttempts || 0) + 1;
        const isStructuralError = (result.error || '').match(/comment box not found|locked|archived|comments are disabled|login session expired/i);
        if (isStructuralError || newAttempts >= 3) {
          // Permanently skip — post is locked/archived or max retries hit
          await Post.findByIdAndUpdate(autoPostCandidate._id, { status: 'failed', postAttempts: newAttempts });
          console.error(`Reddit post permanently skipped (${isStructuralError ? 'structural' : 'max retries'}): ${result.error}`);
        } else {
          await Post.findByIdAndUpdate(autoPostCandidate._id, { $inc: { postAttempts: 1 } });
        }
        // Update account health on failure
        if (CRON_USER_ID) {
          const acc = await BrowserCookie.findOne({ userId: CRON_USER_ID, platform: 'reddit' }).lean();
          if (acc) {
            const backoffUntil = new Date(Date.now() + 1 * 60 * 60 * 1000);
            const patch = buildFailurePatch(acc as Parameters<typeof buildFailurePatch>[0], backoffUntil);
            await BrowserCookie.updateOne({ userId: CRON_USER_ID, platform: 'reddit' }, { $set: patch.$set });
          }
        }
        console.error('Failed to post Reddit comment:', result.error);
        if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'reddit', 'error', 'post_failed', `Failed to post Reddit comment: ${result.error || 'Unknown error'}`, { url: autoPostCandidate.url });
      }
    }
        } else {
          console.log('[comment] No posts above auto-post threshold');
          if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'reddit', 'info', 'skip', 'No posts above auto-post threshold');
        }
      }
    }
  }

  console.log(`[${new Date().toISOString()}] Reddit Cron: complete`);
  if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'reddit', 'info', 'cron_end', 'Reddit cron completed');
  await closeBrowser();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('Fatal error:', err);
  await closeBrowser().catch(() => {});
  process.exit(1);
});
