/**
 * Facebook Group Commenter Cron Script
 *
 * Scrapes Facebook groups for keyword-matching posts, evaluates them with AI,
 * and auto-posts comments on high-scoring posts.
 *
 * Schedule: every 15 minutes via node-cron in server.js (auto-scheduled)
 *   Also respects Mon-Fri 9AM-6PM IST schedule guard
 *   Comments on 1 newest post per run, with 15-min cooldown between comments
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

const CRON_USER_ID = process.env.CRON_USER_ID;

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { connectDB } from '../src/lib/mongodb';
import { evaluatePost, askOpenClaw } from '../src/lib/openclaw';
import {
  ensureFacebookLoggedIn,
  scrapeProfileIdentity,
  getJoinedGroups,
  scrapeGroupPosts,
  postComment,
  reactToPost,
  pickReaction,
  sharePost,
  browseFeedAndReact,
  visitNewsFeed,
  visitNotifications,
  visitAuthorProfile,
  likeCommentsInThread,
  viewStories,
  checkForWarningOverlay,
  closeBrowser,
  setProxy as setFacebookProxy,
} from '../src/lib/facebook';
import { getWarmupLimit, getAccountAge, shouldRandomlySkip, jitterCooldown, getReadingDelay, getActionGap, capCooldown } from '../src/lib/antiBan';
import { isWithinSchedule, getTodayStartUTC, getHourInTimezone } from '../src/lib/schedule';
import { logActivity, notifyAuthError } from '../src/lib/activityLog';
import Post from '../src/models/Post';
import Settings from '../src/models/Settings';
import BrowserCookie from '../src/models/BrowserCookie';
import { buildSuccessPatch, buildFailurePatch, handleAutomationBlock, getActivityProfile } from '../src/lib/accountHealth';

const DEFAULT_DAILY_LIMIT = 3;  // Facebook flags accounts posting too many group comments/day
const DEFAULT_AUTO_POST_THRESHOLD = 70; // Only comment on high-relevance posts (same bar as Twitter)

// --- Multi-session day model ---
// Defines what type of session to run based on time of day (IST).
// Morning: browse+react only. Work hours: full (react+comment). Evening: react only. Night: skip.
type SessionType = 'full' | 'react_only' | 'browse_only' | 'skip';

function getSessionType(timezone = 'UTC'): SessionType {
  const h = getHourInTimezone(timezone);
  if (h >= 0 && h < 6)  return 'skip';        // 12am–6am: no activity
  if (h >= 6 && h < 9)  return 'browse_only'; // 6am–9am: morning browse
  if (h >= 9 && h < 18) return 'full';         // 9am–6pm: full session
  if (h >= 18 && h < 21) return 'react_only';  // 6pm–9pm: evening reactions
  return 'browse_only';                          // 9pm–12am: light browse
}

// --- Time-of-day activity multiplier (same pattern as Twitter) ---
// Returns 0.0–1.0 — 1.0 = peak hours, lower = off-peak
function getTimeOfDayMultiplier(timezone = 'UTC'): number {
  const h = getHourInTimezone(timezone);
  // Minimal activity 1–5am, ramp up morning, peak 9am–6pm, taper evening
  if (h >= 1 && h < 5) return 0.2;
  if (h >= 5 && h < 8) return 0.5;
  if (h >= 8 && h < 9) return 0.8;
  if (h >= 9 && h < 18) return 1.0;
  if (h >= 18 && h < 21) return 0.7;
  if (h >= 21 || h < 1) return 0.4;
  return 1.0;
}

// Weighted item picker
function pickWeighted<T>(items: Array<{ value: T; weight: number }>): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let rand = Math.random() * total;
  for (const item of items) {
    rand -= item.weight;
    if (rand <= 0) return item.value;
  }
  return items[0].value;
}

// Comment length targets (words)
const COMMENT_LENGTHS = [
  { value: 'short',  weight: 50 }, // 1-2 sentences — most human comments are short
  { value: 'medium', weight: 38 }, // 2-3 sentences
  { value: 'long',   weight: 12 }, // 3-4 sentences — rare, long comments stand out as AI
];

// Comment style pool — value-first styles outnumber promotional-adjacent ones
// Styles marked [pure] never allow brand mentions — they build community credibility
const COMMENT_STYLES = [
  { value: 'helpful_tip',      weight: 20 }, // [pure] share an actionable tip
  { value: 'question',         weight: 20 }, // [pure] ask a thoughtful follow-up
  { value: 'personal_story',   weight: 15 }, // [pure] brief relevant experience
  { value: 'practical_advice', weight: 15 }, // [pure] specific advice for the reader
  { value: 'agree_expand',     weight: 15 }, // [pure] agree + add depth or nuance
  { value: 'share_expertise',  weight: 10 }, // [pure] expert insight, no brand
  { value: 'observation',      weight:  5 }, // [brand-ok] insightful perspective
];

// Styles that must NEVER mention brand regardless of brandMentionRate
const PURE_VALUE_STYLES = new Set(['helpful_tip', 'question', 'personal_story', 'practical_advice', 'agree_expand', 'share_expertise']);

if (CRON_USER_ID && !process.env.FACEBOOK_PROFILE_DIR) {
  console.log('No Facebook account connected for this user, skipping.');
  process.exit(0);
}

// --- Read current Facebook account identity ---
function getVerifiedData(): Record<string, string> {
  try {
    const raw = readFileSync(join(process.cwd(), process.env.FACEBOOK_PROFILE_DIR || '.fb-profile', '.verified'), 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function getCurrentAccountId(): string {
  return getVerifiedData().accountId || '';
}

const MAX_DAILY_REACTIONS = 30; // Facebook normal user reacts to ~20–60 posts/day; cap conservatively

// --- Count reactions done today ---
async function getTodayReactionCount(timezone = 'UTC'): Promise<number> {
  const startOfDayUTC = getTodayStartUTC(timezone);
  return Post.countDocuments({
    platform: 'facebook',
    likedByBot: true,
    updatedAt: { $gte: startOfDayUTC },
    ...(CRON_USER_ID && { userId: CRON_USER_ID }),
  });
}

// --- Extract Facebook group ID from a post URL ---
function extractGroupId(postUrl: string): string | null {
  const match = postUrl.match(/facebook\.com\/groups\/([^/?#]+)/);
  return match ? match[1] : null;
}

// --- Count comments posted today for the current account ---
async function getTodayCommentCount(accountId: string, timezone = 'UTC'): Promise<number> {
  const startOfDayUTC = getTodayStartUTC(timezone);

  const query: Record<string, unknown> = {
    platform: 'facebook',
    status: 'posted',
    postedAt: { $gte: startOfDayUTC },
  };
  // Filter by account if available — allows per-account daily limits
  if (accountId) {
    query.postedByAccount = accountId;
  }
  if (CRON_USER_ID) query.userId = CRON_USER_ID;

  return Post.countDocuments(query);
}

// --- Generate a genuine, value-first community comment ---
// Guidelines:
//   - Value and education come first — brand mention is rare, never promotional
//   - "Pure value" styles (most of the pool) never mention brand at all
//   - Brand mention only happens in 'observation' style, only when contextually natural,
//     and only if the post topic genuinely connects to what the company does
//   - First-time interactions with an author: always pure value, no brand
//   - Max brand mention rate enforced: caller passes effectiveBrandRate
async function generateVariedComment(
  postContent: string,
  companyName: string,
  companyDescription: string,
  effectiveBrandRate = 25, // caller reduces this further for first-time authors
): Promise<string> {
  const randomSeed = Math.floor(Math.random() * 1000);
  const style = pickWeighted(COMMENT_STYLES);

  // Pure-value styles never get brand mentions — regardless of rate
  const isPureStyle = PURE_VALUE_STYLES.has(style);
  const mentionBrand = !isPureStyle && (Math.random() < (effectiveBrandRate / 100));

  // Only allow brand mention when the post topic directly connects to the company's domain
  // This ensures contextual relevance — not just random injection
  const companyWords = (companyDescription || '').toLowerCase().split(/\W+/).filter(w => w.length > 4);
  const postLower = postContent.toLowerCase();
  const topicOverlap = companyWords.some(w => postLower.includes(w));
  const allowBrand = mentionBrand && topicOverlap;

  const length = pickWeighted(COMMENT_LENGTHS);

  const styleInstructions: Record<string, string> = {
    helpful_tip:      'share one concrete, actionable tip that directly helps with what\'s being discussed',
    question:         'ask a genuinely curious, thoughtful follow-up question that advances the conversation',
    personal_story:   'share a brief, relevant personal experience or lesson that adds a human angle',
    practical_advice: 'give specific, practical advice the poster can actually act on',
    agree_expand:     'acknowledge something insightful in the post, then add a nuance or depth that others might have missed',
    share_expertise:  'share relevant domain knowledge or an insight that adds real value to the discussion',
    observation:      'share a thoughtful perspective that builds on the post — if your professional background in this area is directly relevant, you may mention it once, naturally',
  };

  const lengthInstructions: Record<string, string> = {
    short:  '1–2 short casual sentences — the kind you\'d type on your phone without overthinking it',
    medium: '2–3 sentences — conversational, like texting a friend who asked your opinion',
    long:   '3–4 sentences max — still casual, just with a bit more detail, like explaining something to someone in person',
  };

  // Brand instruction is intentionally minimal — it's contextual expert context, not a pitch
  const brandInstruction = allowBrand
    ? `You have professional experience with ${companyName} (${companyDescription}). If — and only if — it adds genuine context to your expert insight, you may mention ${companyName} once, briefly and naturally. Do NOT pitch, recommend, or call-to-action. The comment must read as expert knowledge sharing, not promotion. The brand mention should be ≤15% of the total comment.`
    : '';

  const prompt = `You are a regular person in a Facebook group — not an expert, not a marketer. You comment the same way you'd text a friend: casual, direct, sometimes a bit rough around the edges.

POST IN THE GROUP:
"""
${postContent.slice(0, 600)}
"""

YOUR TASK: Write a comment (${lengthInstructions[length]}) that ${styleInstructions[style]}.
${brandInstruction}

RULES — READ CAREFULLY:
- Write ONLY the comment, nothing else. No intro, no label, no "Here's my comment:"
- Write like a real person typing on their phone, not like a content writer
- Use contractions: "it's", "doesn't", "I've", "you're", "that's", "won't"
- Use casual phrases: "honestly", "tbh", "in my experience", "I've found that", "yeah", "ngl"
- Vary sentence length — short punchy sentences mixed with longer ones
- DO NOT stack industry jargon together — one technical term max per comment
- DO NOT write in "tip: ... explanation: ... conclusion:" structure
- DO NOT start with "Great point", "Absolutely", "Indeed", "Certainly", "This is spot on"
- DO NOT sound like a blog post or expert article
- NEVER use: "check out", "highly recommend", "amazing", "visit our", "learn more at"
- NEVER include URLs, domains, @ handles, or hashtags
- Respond to something SPECIFIC in the post above — not a generic take
- Seed: ${randomSeed}

Write the comment now:`;

  try {
    const raw = await askOpenClaw(prompt);

    // Extract text from OpenClaw response — may be raw JSON with payloads
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
        // Try to extract text from partial/malformed JSON
        const textMatch = comment.match(/"text"\s*:\s*"([^"]+)"/);
        if (textMatch) {
          comment = textMatch[1];
        }
      }
    }

    // Clean up the response — strip quotes, labels, extra whitespace
    comment = comment
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/^(Comment|Reply|Response|Here'?s?\s*(the|my|a)?\s*(comment|reply)?:?\s*)/i, '')
      .replace(/\n/g, ' ')
      // Remove any URLs/domains that may have slipped through
      .replace(/https?:\/\/\S+/gi, '')
      .replace(new RegExp(companyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\.com', 'gi'), companyName)
      .replace(/\s{2,}/g, ' ')
      .trim();

    // Truncate if too long for a Facebook comment
    if (comment.length > 300) {
      comment = comment.slice(0, 297) + '...';
    }

    return comment;
  } catch (err) {
    console.error('Failed to generate varied comment:', (err as Error).message);
    // Return empty so the safety check catches it
    return '';
  }
}

async function main() {
  console.log(`[${new Date().toISOString()}] FB Comment Cron: starting (user: ${CRON_USER_ID || 'default'})`);
  if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'facebook', 'info', 'cron_start', 'Facebook cron started');

  await connectDB();

  // Step 1: Load settings
  const settings = await Settings.findOne(CRON_USER_ID ? { userId: CRON_USER_ID } : {});
  if (!settings) {
    console.error('No settings configured, exiting');
    process.exit(0);
  }

  if (!settings.companyName) {
    console.log('No company name configured. Set it in dashboard settings.');
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'facebook', 'error', 'config_error', 'No company name configured');
    process.exit(0);
  }

  // Step 1b: Schedule guard — use per-platform schedule if set, else fall back to
  // the user's global cron schedule (cronTimezone / cronStartHour / cronEndHour).
  // Previously defaulted to America/New_York which silently blocked IST users.
  const cronTz = (settings as any).cronTimezone || '';
  const platformSchedule = (settings as any).platformSchedules?.get?.('facebook') || null;
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

  const keywords: string[] = settings.facebookKeywords?.length
    ? settings.facebookKeywords
    : (settings.keywords?.length ? settings.keywords : []);
  if (keywords.length === 0) {
    console.log('No Facebook keywords configured. Add keywords in dashboard settings.');
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'facebook', 'warn', 'config_error', 'No Facebook keywords configured');
    process.exit(0);
  }
  const configuredDailyLimit: number = settings.facebookDailyLimit ?? DEFAULT_DAILY_LIMIT;
  const autoPostThreshold: number =
    settings.facebookAutoPostThreshold ?? DEFAULT_AUTO_POST_THRESHOLD;
  const brandMentionRate: number = (settings as any).facebookBrandMentionRate ?? 25;
  const cooldownMinutes: number = capCooldown('facebook', (settings as any).facebookCooldownMinutes ?? 90);

  // Warmup ramp: limit daily posts based on account age to avoid detection
  const fbAddedAt = getAccountAge(settings, 'facebook');
  let dailyLimit = getWarmupLimit(configuredDailyLimit, fbAddedAt, 'facebook');
  if (dailyLimit < configuredDailyLimit) {
    console.log(`Warmup mode: daily limit capped at ${dailyLimit}/${configuredDailyLimit} (account age < 60 days)`);
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'facebook', 'info', 'warmup', `Warmup limit: ${dailyLimit}/${configuredDailyLimit}`);
  }

  // Multi-session model: determine session type from time of day
  const tz = cronTz || 'UTC';
  const sessionType: SessionType = process.env.CRON_MANUAL ? 'full' : getSessionType(tz);
  console.log(`Session type: ${sessionType} (${new Date().toLocaleTimeString('en-IN', { timeZone: tz })} ${tz})`);

  if (sessionType === 'skip') {
    console.log('Night hours — skipping session');
    process.exit(0);
  }

  if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'facebook', 'info', 'session_start', `Session type: ${sessionType}`);

  // Within non-skip hours, still apply a probabilistic gate to avoid robotic regularity
  const todMultiplier = getTimeOfDayMultiplier(tz);
  if (!process.env.CRON_MANUAL && Math.random() > todMultiplier) {
    console.log(`Time-of-day multiplier ${todMultiplier.toFixed(2)} → skipping this run`);
    process.exit(0);
  }

  // Random 15% skip to break up patterns (applied to all session types)
  if (!process.env.CRON_MANUAL && shouldRandomlySkip(0.15)) {
    console.log('Random skip (15% chance) — skipping this run');
    process.exit(0);
  }

  // Account health guard — skip if auto-paused or in backoff; browse-only if in cooldown
  let browseOnlyOverride = false;
  if (CRON_USER_ID) {
    const accHealth = await BrowserCookie.findOne({ userId: CRON_USER_ID, platform: 'facebook' }).lean() as Record<string, unknown> | null;
    if (accHealth?.proxyUrl) setFacebookProxy(accHealth.proxyUrl as string);
    if (accHealth?.autoPaused) {
      console.warn(`Facebook account auto-paused (health score: ${accHealth.healthScore ?? 0}/100) — skipping run. Resume from the Accounts page.`);
      await logActivity(CRON_USER_ID, 'facebook', 'warn', 'account_paused', `Account auto-paused (score: ${accHealth.healthScore ?? 0}/100) — cron skipped. Resume from dashboard.`);
      process.exit(0);
    }
    if (accHealth?.backoffUntil && new Date(accHealth.backoffUntil as string) > new Date()) {
      const remainMin = Math.ceil((new Date(accHealth.backoffUntil as string).getTime() - Date.now()) / 60000);
      console.warn(`Facebook account in backoff for ${remainMin} more minute(s) — skipping run.`);
      await logActivity(CRON_USER_ID, 'facebook', 'warn', 'backoff', `Account in backoff — ${remainMin}m remaining. Cron skipped.`, { remainingMinutes: remainMin });
      process.exit(0);
    }
    if (accHealth?.browseOnlyUntil && new Date(accHealth.browseOnlyUntil as string) > new Date()) {
      const remainH = Math.ceil((new Date(accHealth.browseOnlyUntil as string).getTime() - Date.now()) / 3600000);
      console.warn(`Facebook in browse-only mode for ${remainH}h more (automation cooldown) — reacting/browsing only, no commenting.`);
      await logActivity(CRON_USER_ID, 'facebook', 'warn', 'browse_only', `Browse-only mode — ${remainH}h remaining. Commenting skipped, reactions continue.`);
      browseOnlyOverride = true; // don't exit — let scrape + react continue
    }
  }

  // ── Adaptive health throttling ──
  let _fbActProfile = getActivityProfile(100); // default: healthy
  if (CRON_USER_ID) {
    const fbDoc = await BrowserCookie.findOne({ userId: CRON_USER_ID, platform: 'facebook' }).lean() as any;
    const healthScore: number = fbDoc?.healthScore ?? 100;
    _fbActProfile = getActivityProfile(healthScore);

    if (_fbActProfile.needsRecovery) {
      const alreadyInRecovery = !!(fbDoc?.browseOnlyUntil && new Date(fbDoc.browseOnlyUntil) > new Date());
      if (!alreadyInRecovery) {
        const until = new Date(Date.now() + _fbActProfile.recoveryDays * 86400000);
        await BrowserCookie.findOneAndUpdate(
          { userId: CRON_USER_ID, platform: 'facebook' },
          { $set: { browseOnlyUntil: until } },
          { upsert: true },
        );
        console.warn(`[Health] Score ${healthScore}/100 — starting ${_fbActProfile.recoveryDays}-day browse-only recovery (until ${until.toDateString()})`);
        await logActivity(CRON_USER_ID, 'facebook', 'warn', 'health_recovery',
          `Health ${healthScore}/100 — ${_fbActProfile.recoveryDays}-day browse-only recovery: reacting only, no comments`,
          { healthScore, recoveryDays: _fbActProfile.recoveryDays, until: until.toISOString() },
        );
        browseOnlyOverride = true;
      }
      dailyLimit = 0;
    } else if (_fbActProfile.commentMultiplier < 1 && dailyLimit > 1) {
      const throttledLimit = Math.max(1, Math.floor(dailyLimit * _fbActProfile.commentMultiplier));
      if (throttledLimit < dailyLimit) {
        console.warn(`[Health] Score ${healthScore}/100 (${_fbActProfile.label}) — daily limit throttled: ${throttledLimit}/${dailyLimit}`);
        await logActivity(CRON_USER_ID, 'facebook', 'warn', 'health_throttle',
          `Health throttle: ${throttledLimit}/${dailyLimit} comments/day (${_fbActProfile.label}, health ${healthScore}/100)`,
        );
        dailyLimit = throttledLimit;
      }
    }
  }

  // Step 2b: Read current account identity
  const accountId = getCurrentAccountId();
  if (accountId) {
    console.log(`Active Facebook account: ${accountId}`);
  }

  // Step 3: Check daily limit + cooldown — these only block COMMENTING, not the whole session.
  let commentBlocked = false;
  const todayCount = await getTodayCommentCount(accountId, tz);
  if (todayCount >= dailyLimit) {
    console.log(`Comment limit reached: ${todayCount}/${dailyLimit} today — commenting blocked, reactions continue`);
    commentBlocked = true;
  } else {
    console.log(`Comments posted today: ${todayCount}/${dailyLimit}${accountId ? ` (account: ${accountId})` : ''}`);
  }

  if (!commentBlocked && !process.env.CRON_MANUAL) {
    const MIN_COMMENT_GAP_MS = jitterCooldown(cooldownMinutes);
    const lastPosted = await Post.findOne({ platform: 'facebook', status: 'posted', postedAt: { $exists: true }, ...(CRON_USER_ID && { userId: CRON_USER_ID }) })
      .sort({ postedAt: -1 })
      .select('postedAt platform');
    if (lastPosted?.postedAt) {
      const elapsed = Date.now() - new Date(lastPosted.postedAt).getTime();
      if (elapsed < MIN_COMMENT_GAP_MS) {
        const remainMin = Math.ceil((MIN_COMMENT_GAP_MS - elapsed) / 60000);
        console.log(`Cooldown: ${remainMin}m remaining — commenting blocked, reactions continue`);
        commentBlocked = true;
      }
    }
  }

  // lightBrowseOnly: only quick feed browse — no group scraping (very early morning / late night)
  // noCommentMode: full group scrape + reactions, but skip commenting (react_only hours or cooldown)
  const lightBrowseOnly = sessionType === 'browse_only' && !browseOnlyOverride;
  const noCommentMode = sessionType === 'react_only' || browseOnlyOverride || commentBlocked;

  // Step 4: Ensure logged in
  const loggedIn = await ensureFacebookLoggedIn();
  if (!loggedIn) {
    const reason = 'Facebook session expired — re-upload cookies from the Accounts page';
    try {
      writeFileSync(join(process.cwd(), process.env.FACEBOOK_PROFILE_DIR || '.fb-profile', '.verified'), JSON.stringify({ loggedIn: false, ts: new Date().toISOString(), message: reason }));
    } catch {}
    console.error(reason);
    if (CRON_USER_ID) {
      await BrowserCookie.findOneAndUpdate(
        { userId: CRON_USER_ID, platform: 'facebook' },
        { $set: { autoPaused: true, autoPausedReason: reason, updatedAt: new Date() } },
        { upsert: true },
      );
      await logActivity(CRON_USER_ID, 'facebook', 'error', 'auth_error', reason);
      await notifyAuthError(CRON_USER_ID, 'facebook', reason);
    }
    await closeBrowser();
    process.exit(1);
  }
  console.log('Facebook login confirmed');

  // ── Per-run social phase ──────────────────────────────────────────────────
  // Like Twitter, each run randomly picks which warm-up actions to perform.
  // Not everything happens every run — that would look robotic.
  // Weights reflect real usage: feed browse is most common, stories less so.
  type SocialAction = 'feed' | 'notifications' | 'stories' | 'feed+notifications' | 'feed+stories' | 'notifications+stories' | 'all';
  const socialActionPool: Array<{ value: SocialAction; weight: number }> = [
    { value: 'feed',                  weight: 25 }, // browse + react feed only
    { value: 'notifications',         weight: 15 }, // check notifications only
    { value: 'stories',               weight: 10 }, // view stories only
    { value: 'feed+notifications',    weight: 25 }, // feed + notifications (most common combo)
    { value: 'feed+stories',          weight: 10 }, // feed + stories
    { value: 'notifications+stories', weight:  5 }, // notifications + stories
    { value: 'all',                   weight: 10 }, // everything (less frequent — looks human)
  ];
  const chosenSocialAction = pickWeighted(socialActionPool);
  console.log(`Social phase: ${chosenSocialAction}`);

  const doFeed          = chosenSocialAction.includes('feed') || chosenSocialAction === 'all';
  const doNotifications = chosenSocialAction.includes('notifications') || chosenSocialAction === 'all';
  const doStories       = chosenSocialAction.includes('stories') || chosenSocialAction === 'all';

  if (doFeed) {
    try {
      const feedReactions = 1 + Math.floor(Math.random() * 3); // 1–3 reactions
      const feedResult = await visitNewsFeed(feedReactions);
      if (feedResult.reacted > 0) {
        console.log(`News feed: reacted to ${feedResult.reacted} post(s) while browsing`);
        if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'facebook', 'info', 'feed_browse', `Browsed news feed and reacted to ${feedResult.reacted} post(s)`, { reacted: feedResult.reacted });
      }
    } catch (e) { console.warn('visitNewsFeed error:', (e as Error).message); }
  }

  if (doNotifications) {
    try {
      await visitNotifications();
      console.log('Checked notifications');
    } catch (e) { console.warn('visitNotifications error:', (e as Error).message); }
  }

  if (doStories) {
    try {
      const storyResult = await viewStories();
      if (storyResult.viewed > 0) {
        console.log(`Viewed ${storyResult.viewed} stories`);
        if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'facebook', 'info', 'stories_viewed', `Viewed ${storyResult.viewed} Facebook ${storyResult.viewed === 1 ? 'story' : 'stories'} at session start`, { count: storyResult.viewed });
      }
    } catch (e) { console.warn('viewStories error:', (e as Error).message); }
  }

  // Re-write .verified with loggedIn: true; scrape identity if missing
  try {
    const existing = getVerifiedData();
    let aid = existing.accountId || '';
    let dn = existing.displayName || '';
    let un = existing.username || '';
    if (!aid || !dn) {
      const scraped = await scrapeProfileIdentity();
      aid = aid || scraped.accountId;
      dn = dn || scraped.displayName;
      un = un || scraped.username;
    }
    writeFileSync(join(process.cwd(), process.env.FACEBOOK_PROFILE_DIR || '.fb-profile', '.verified'), JSON.stringify({
      loggedIn: true, ts: new Date().toISOString(),
      message: 'Facebook session verified by cron',
      accountId: aid, displayName: dn, username: un,
    }));
  } catch {}

  // Step 5: Get groups to scrape
  let groupUrls: string[] = settings.facebookGroups?.length
    ? settings.facebookGroups
    : await getJoinedGroups();

  if (groupUrls.length === 0) {
    console.log('No Facebook groups found to scrape');
    process.exit(0);
  }
  // Shuffle scrape order each run — avoids predictable group visit patterns
  groupUrls = [...groupUrls].sort(() => Math.random() - 0.5);
  console.log(`Scraping ${groupUrls.length} groups (shuffled)`);

  // Light browse-only sessions (6am–9am, 9pm–midnight): quick feed browse without group scraping
  if (lightBrowseOnly) {
    const reactTarget = 1 + Math.floor(Math.random() * 2);
    try {
      const result = await browseFeedAndReact(groupUrls.slice(0, 3), reactTarget);
      console.log(`Browse+light-react session complete: reacted ${result.reacted} times (${result.reactions.join(', ')})`);
      if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'facebook', 'info', 'passive_session', `Browse+light-react done — reacted ${result.reacted} times`);
    } catch (e) { console.warn('Passive session error:', (e as Error).message); }
    await closeBrowser();
    process.exit(0);
  }

  // Step 6: Scrape posts from each group
  let allPosts: Array<{
    url: string;
    author: string;
    content: string;
    groupUrl: string;
  }> = [];

  for (const groupUrl of groupUrls) {
    try {
      const posts = await scrapeGroupPosts(groupUrl, keywords);
      allPosts = allPosts.concat(posts);
      console.log(`  ${groupUrl}: found ${posts.length} keyword-matching posts`);
    } catch (err) {
      console.error(`  Error scraping ${groupUrl}:`, (err as Error).message);
    }
    // Be polite between groups
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log(`Total keyword-matching posts found: ${allPosts.length}`);

  // Step 7: Save new posts to DB
  let newPostCount = 0;
  for (const post of allPosts) {
    const exists = await Post.findOne({ url: post.url, ...(CRON_USER_ID && { userId: CRON_USER_ID }) });
    if (!exists) {
      await Post.create({
        url: post.url,
        platform: 'facebook',
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

  // ── Always evaluate new posts — keeps the comment pipeline primed ────────────
  const unevaluatedPosts = await Post.find({
    platform: 'facebook',
    status: 'new',
    evaluationAttempts: { $not: { $gte: 3 } },
    ...(CRON_USER_ID && { userId: CRON_USER_ID }),
  }).limit(10);

  if (unevaluatedPosts.length > 0) {
    console.log(`Evaluating ${unevaluatedPosts.length} new Facebook posts`);
    for (const post of unevaluatedPosts) {
      try {
        await Post.findByIdAndUpdate(post._id, { status: 'evaluating' });
        const evaluation = await evaluatePost(
          post.content,
          settings.companyName,
          settings.companyDescription,
          settings.promptTemplate || undefined,
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
        const attempts = ((post as any).evaluationAttempts ?? 0) + 1;
        if (attempts >= 3) {
          await Post.findByIdAndUpdate(post._id, { status: 'failed', evaluationAttempts: attempts });
          console.error(`  Giving up on post ${post._id} after ${attempts} failed evaluation attempts`);
        } else {
          await Post.findByIdAndUpdate(post._id, { status: 'new', evaluationAttempts: attempts });
        }
      }
    }
  }

  // ── Guaranteed react pass (80% of sessions) ────────────────────────────────
  // Reacting to group posts that match keywords/niche makes the feed look natural.
  // Runs independently of the action picker — ensures consistent engagement.
  // Guaranteed react pass — during warmup: ALWAYS react (no random gate), 2-3 per session, 5-7/day
  const todayEngageStart = getTodayStartUTC(tz);
  const todayBotReactCount = await Post.countDocuments({ platform: 'facebook', likedByBot: true, updatedAt: { $gte: todayEngageStart }, ...(CRON_USER_ID && { userId: CRON_USER_ID }) });
  const isWarmupEngage = dailyLimit === 0;
  const dailyReactTarget = isWarmupEngage ? 5 + Math.floor(Math.random() * 3) : 3 + Math.floor(Math.random() * 3); // warmup: 5-7, normal: 3-5
  const reactRemaining = Math.max(0, dailyReactTarget - todayBotReactCount);
  // During warmup: always react (100%). After warmup: 80% random gate.
  const shouldReact = isWarmupEngage ? true : Math.random() < 0.80;

  if (reactRemaining > 0 && shouldReact) {
    const todayReactionsCheck = await getTodayReactionCount(tz);
    if (todayReactionsCheck >= MAX_DAILY_REACTIONS) {
      console.log(`[react] Daily reaction cap reached (${todayReactionsCheck}/${MAX_DAILY_REACTIONS}) — skipping`);
    } else {
      const remainingSlots = Math.min(MAX_DAILY_REACTIONS - todayReactionsCheck, reactRemaining);
      const thisSessionReacts = Math.min(remainingSlots, isWarmupEngage ? 2 + Math.floor(Math.random() * 2) : 1 + Math.floor(Math.random() * 2));

      // Query from DB — not dependent on this session's scrape results
      const reactCandidates = await Post.find({
        platform: 'facebook',
        likedByBot: { $ne: true },
        postDeleted: { $ne: true },
        url: { $exists: true, $ne: '' },
        ...(CRON_USER_ID && { userId: CRON_USER_ID }),
      }).sort({ _id: -1 }).limit(thisSessionReacts * 3).lean();

      if (reactCandidates.length === 0) {
        console.log('[react] No unreacted posts in DB — skipping');
      } else {
        const shuffled = reactCandidates.sort(() => Math.random() - 0.5).slice(0, thisSessionReacts);
        console.log(`[react] Reacting to ${shuffled.length} post(s) this session (${todayBotReactCount}/${dailyReactTarget} today)`);
        let reactedCount = 0;

        for (const post of shuffled) {
          if ((todayReactionsCheck + reactedCount) >= MAX_DAILY_REACTIONS) break;
          try {
            const readMs = getReadingDelay((post.content || '').length);
            await new Promise(r => setTimeout(r, readMs));
            const chosenReaction = pickReaction();
            const reactionResult = await reactToPost(post.url as string, chosenReaction);
            if (reactionResult.success) {
              await Post.findByIdAndUpdate(post._id, { likedByBot: true, botReaction: reactionResult.reaction });
              reactedCount++;
              console.log(`  Reacted ${reactionResult.reaction} → ${(post.url as string).slice(0, 60)}`);
              if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'facebook', 'info', 'react', `Reacted ${reactionResult.reaction} to a post`, { url: post.url });
            }
            await new Promise(r => setTimeout(r, getActionGap()));
          } catch (e) { console.warn('  React error:', (e as Error).message); }
        }
        console.log(`[react] Done: reacted to ${reactedCount} posts`);
      }
    }
  }

  // ── Unified main action phase (Twitter-style) ─────────────────────────────
  // Pick 0–3 actions per run from a weighted pool, shuffle execution order,
  // then run with bell-curve delays between each. Session type adjusts weights.
  type FbAction = 'react_groups' | 'share' | 'comment';

  const fbMainWeights: Record<FbAction, number> = {
    react_groups: 35, // additional group reactions (on top of guaranteed pass above)
    share:         8, // rare share — max 1/day enforced inside
    comment:      noCommentMode ? 0 : 25, // zero out during react-only/cooldown sessions
  };

  const FB_RUN_COUNT_DIST = [
    { count: 0, weight: 10 }, // 10% — no main actions (pure warmup run)
    { count: 1, weight: 35 },
    { count: 2, weight: 40 },
    { count: 3, weight: 15 },
  ];

  function pickFbRunCount(): number {
    const total = FB_RUN_COUNT_DIST.reduce((s, d) => s + d.weight, 0);
    let r = Math.random() * total;
    for (const { count, weight } of FB_RUN_COUNT_DIST) {
      r -= weight;
      if (r <= 0) return count;
    }
    return 1;
  }

  function pickFbActions(weights: Record<FbAction, number>, n: number): FbAction[] {
    const pool = (Object.entries(weights) as [FbAction, number][]).filter(([, w]) => w > 0);
    const selected: FbAction[] = [];
    while (selected.length < n && pool.length > 0) {
      const total = pool.reduce((s, [, w]) => s + w, 0);
      if (total <= 0) break;
      let r = Math.random() * total;
      let idx = pool.length - 1;
      for (let i = 0; i < pool.length; i++) {
        r -= pool[i][1];
        if (r <= 0) { idx = i; break; }
      }
      selected.push(pool[idx][0]);
      pool.splice(idx, 1);
    }
    // Shuffle execution order
    for (let i = selected.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [selected[i], selected[j]] = [selected[j], selected[i]];
    }
    return selected;
  }

  // Bell-curve delay between actions: 30s–3min, biased toward center
  function fbBetweenActionDelay(): Promise<void> {
    const r1 = Math.random(), r2 = Math.random();
    const ms = Math.round(30_000 + ((r1 + r2) / 2) * 150_000);
    console.log(`[Social] Waiting ${Math.round(ms / 1000)}s before next action...`);
    return new Promise(r => setTimeout(r, ms));
  }

  const fbRunCount = pickFbRunCount();
  const fbActions = pickFbActions(fbMainWeights, fbRunCount);
  console.log(`Main action phase: ${fbRunCount} action(s) — [${fbActions.join(', ') || 'none (warmup-only run)'}]`);

  for (let actionIdx = 0; actionIdx < fbActions.length; actionIdx++) {
    if (actionIdx > 0) await fbBetweenActionDelay();
    const action = fbActions[actionIdx];

    // ── react_groups ──────────────────────────────────────────────────────────
    if (action === 'react_groups') {
      if (allPosts.length === 0) {
        console.log('[react_groups] No group posts available — skipping');
      } else {
        const todayReactions = await getTodayReactionCount(tz);
        if (todayReactions >= MAX_DAILY_REACTIONS) {
          console.log(`[react_groups] Daily cap reached (${todayReactions}/${MAX_DAILY_REACTIONS}) — skipping`);
        } else {
          const remainingSlots = MAX_DAILY_REACTIONS - todayReactions;
          const reactMin = _fbActProfile.minReacts, reactMax = _fbActProfile.maxReacts;
          const reactCount = Math.min(reactMin + Math.floor(Math.random() * (reactMax - reactMin + 1)), remainingSlots);
          const shuffled = [...allPosts].sort(() => Math.random() - 0.5).slice(0, reactCount);
          console.log(`[react_groups] Reacting to up to ${reactCount} posts (${todayReactions}/${MAX_DAILY_REACTIONS} today)`);
          let reactedCount = 0;
          for (const scraped of shuffled) {
            if ((todayReactions + reactedCount) >= MAX_DAILY_REACTIONS) break;
            try {
              const dbPost = await Post.findOne({ url: scraped.url, ...(CRON_USER_ID && { userId: CRON_USER_ID }) }).select('_id likedByBot content');
              if (dbPost?.likedByBot) continue;
              const readMs = getReadingDelay((dbPost?.content || scraped.content || '').length);
              console.log(`  Reading post (${Math.round(readMs / 1000)}s)...`);
              await new Promise(r => setTimeout(r, readMs));
              const chosenReaction = pickReaction();
              const reactionResult = await reactToPost(scraped.url, chosenReaction);
              if (reactionResult.success) {
                await Post.findOneAndUpdate(
                  { url: scraped.url, ...(CRON_USER_ID && { userId: CRON_USER_ID }) },
                  { $set: { likedByBot: true, botReaction: reactionResult.reaction }, $setOnInsert: { platform: 'facebook', author: scraped.author, content: scraped.content, status: 'new', ...(CRON_USER_ID && { userId: CRON_USER_ID }) } },
                  { upsert: true },
                );
                reactedCount++;
                console.log(`  Reacted ${reactionResult.reaction} → ${scraped.url.slice(0, 60)}`);
                if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'facebook', 'info', 'react', `Reacted ${reactionResult.reaction} to a post`, { url: scraped.url });
              }
              await new Promise(r => setTimeout(r, getActionGap()));
            } catch (e) { console.warn('  React error:', (e as Error).message); }
          }
          console.log(`[react_groups] Done: reacted to ${reactedCount} posts`);
        }
      }

    // ── share ─────────────────────────────────────────────────────────────────
    } else if (action === 'share') {
      if (allPosts.length === 0) {
        console.log('[share] No group posts available — skipping');
      } else {
        const todayStartSh = getTodayStartUTC(tz);
        const todayShares = await Post.countDocuments({ platform: 'facebook', sharedByBot: true, ...(CRON_USER_ID && { userId: CRON_USER_ID }), updatedAt: { $gte: todayStartSh } });
        if (todayShares > 0) {
          console.log('[share] Already shared today — skipping');
        } else {
          const shareTarget = allPosts[Math.floor(Math.random() * allPosts.length)];
          console.log(`[share] Sharing: ${shareTarget.url.slice(0, 60)}`);
          try {
            const shareResult = await sharePost(shareTarget.url);
            if (shareResult.success) {
              await Post.findOneAndUpdate(
                { url: shareTarget.url, ...(CRON_USER_ID && { userId: CRON_USER_ID }) },
                { $set: { sharedByBot: true }, $setOnInsert: { platform: 'facebook', author: shareTarget.author, content: shareTarget.content, status: 'new', ...(CRON_USER_ID && { userId: CRON_USER_ID }) } },
                { upsert: true },
              );
              if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'facebook', 'info', 'share', 'Shared a post to timeline', { url: shareTarget.url });
              console.log('[share] Shared successfully');
            }
          } catch (e) { console.warn('[share] Error:', (e as Error).message); }
        }
      }

    // ── comment ───────────────────────────────────────────────────────────────
    } else if (action === 'comment') {
      const recheck = await getTodayCommentCount(accountId, tz);
      if (recheck >= dailyLimit) {
        console.log(`[comment] Daily limit reached (${recheck}/${dailyLimit}) — skipping`);
        if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'facebook', 'info', 'limit', `Daily limit reached (${recheck}/${dailyLimit}). Will resume tomorrow.`);
      } else {
        // Per-group comment cap
        const todayStart = getTodayStartUTC(tz);
        const postedToday = await Post.find({ platform: 'facebook', status: 'posted', postedAt: { $gte: todayStart }, ...(CRON_USER_ID && { userId: CRON_USER_ID }) }).select('url');
        const commentedGroupIds = new Set(postedToday.map(p => extractGroupId(p.url as string)).filter(Boolean));
        if (commentedGroupIds.size > 0) console.log(`[comment] Per-group cap: already commented in group(s) ${[...commentedGroupIds].join(', ')} today`);

        // Author dedup (7-day window)
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const recentlyCommentedPosts = await Post.find({ platform: 'facebook', status: 'posted', postedAt: { $gte: sevenDaysAgo }, ...(CRON_USER_ID && { userId: CRON_USER_ID }) }).select('author');
        const recentAuthors = new Set(recentlyCommentedPosts.map(p => p.author as string).filter(a => a && a !== 'Unknown'));
        if (recentAuthors.size > 0) {
          console.log(`[comment] Author dedup: skipping ${recentAuthors.size} author(s) engaged in last 7 days`);
          if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'facebook', 'info', 'author_dedup', `Skipping ${recentAuthors.size} author(s) already engaged in the last 7 days`, { count: recentAuthors.size });
        }

        const freshCutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
        const candidates = await Post.find({
          platform: 'facebook', status: 'evaluated',
          aiRelevanceScore: { $gte: autoPostThreshold },
          aiReply: { $exists: true, $ne: '' },
          postAttempts: { $not: { $gte: 3 } },
          postDeleted: { $ne: true },
          scrapedAt: { $gte: freshCutoff },
          ...(CRON_USER_ID && { userId: CRON_USER_ID }),
        }).sort({ _id: -1 }).limit(20);

        const autoPostCandidate = candidates.find(c => {
          const gid = extractGroupId(c.url as string);
          if (gid && commentedGroupIds.has(gid)) return false;
          if (c.author && c.author !== 'Unknown' && recentAuthors.has(c.author as string)) return false;
          return true;
        }) || null;

        // 5% idle cycle — breaks mechanical patterns
        if (autoPostCandidate && Math.random() < 0.05) {
          console.log('[comment] Score-based idle cycle (5%) — skipping this run');
          if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'facebook', 'info', 'skip', 'Score-based idle cycle skip');
        } else if (autoPostCandidate) {
          let replyText = autoPostCandidate.editedReply || '';

          if (!replyText) {
            const authorName = autoPostCandidate.author as string;
            const hasEngagedAuthorBefore = authorName && authorName !== 'Unknown'
              ? (await Post.countDocuments({ platform: 'facebook', author: authorName, $or: [{ status: 'posted' }, { likedByBot: true }], _id: { $ne: autoPostCandidate._id }, ...(CRON_USER_ID && { userId: CRON_USER_ID }) })) > 0
              : true;
            const effectiveBrandRate = hasEngagedAuthorBefore ? brandMentionRate : 0;
            if (!hasEngagedAuthorBefore) console.log(`  First interaction with "${authorName}" — pure-value comment (no brand mention)`);
            replyText = await generateVariedComment(autoPostCandidate.content, settings.companyName, settings.companyDescription, effectiveBrandRate);
          }

          if (!replyText && autoPostCandidate.aiReply) {
            console.log('Using existing aiReply as fallback');
            replyText = autoPostCandidate.aiReply;
          }

          const looksLikeJson = /^\s*[\[{]/.test(replyText || '');
          // eslint-disable-next-line no-control-regex
          const hasAnsi = /\x1b\[[\d;]*m/.test(replyText || '');
          const hasPayloads = /"payloads"\s*:/.test(replyText || '');
          const hasDebugPrefix = /\[agent\/embedded\]/.test(replyText || '');

          if (looksLikeJson || hasAnsi || hasPayloads || hasDebugPrefix) {
            console.error('[comment] Format check failed (JSON/debug garbage), skipping:', replyText?.slice(0, 100));
          } else if (!replyText || replyText.length < 5 || /error|failed|exception|undefined|null/i.test(replyText)) {
            console.error('[comment] Safety check failed, skipping:', replyText?.slice(0, 100));
          } else {
            console.log(`[comment] Auto-posting on ${autoPostCandidate.url} (score: ${autoPostCandidate.aiRelevanceScore})`);
            console.log(`[comment] Text: "${replyText}"`);

            const readMs = getReadingDelay((autoPostCandidate.content || '').length);
            console.log(`  Reading post (${Math.round(readMs / 1000)}s)...`);
            await new Promise(r => setTimeout(r, readMs));

            try { await visitAuthorProfile(autoPostCandidate.url); } catch (e) { console.warn('visitAuthorProfile error:', (e as Error).message); }
            await new Promise(r => setTimeout(r, getActionGap()));

            try {
              const threadLikes = await likeCommentsInThread(autoPostCandidate.url, 1 + Math.floor(Math.random() * 2));
              if (threadLikes > 0) console.log(`  Liked ${threadLikes} existing comment(s) in thread`);
            } catch (e) { console.warn('likeCommentsInThread error:', (e as Error).message); }
            await new Promise(r => setTimeout(r, getActionGap()));

            if (!autoPostCandidate.likedByBot) {
              try {
                const chosenReaction = pickReaction();
                const reactionResult = await reactToPost(autoPostCandidate.url, chosenReaction);
                if (reactionResult.success) {
                  await Post.findByIdAndUpdate(autoPostCandidate._id, { likedByBot: true, botReaction: reactionResult.reaction });
                  console.log(`  Reacted with ${reactionResult.reaction}`);
                  if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'facebook', 'info', 'react', `Reacted ${reactionResult.reaction} before commenting`, { url: autoPostCandidate.url });
                }
                await new Promise(r => setTimeout(r, getActionGap()));
              } catch (e) { console.warn('Pre-comment react failed, continuing:', (e as Error).message); }
            }

            const overlayCheck = await checkForWarningOverlay().catch(() => ({ blocked: false }));
            if (overlayCheck.blocked) {
              const isSessionExpiry = (overlayCheck.reason || '').toLowerCase().includes('session') || (overlayCheck.reason || '').toLowerCase().includes('expired') || (overlayCheck.reason || '').toLowerCase().includes('log');
              const overlayMsg = `Overlay blocked comment: ${overlayCheck.reason}`;
              console.warn(`Warning overlay detected (${overlayCheck.reason}) — aborting`);
              if (CRON_USER_ID) {
                if (isSessionExpiry) await BrowserCookie.findOneAndUpdate({ userId: CRON_USER_ID, platform: 'facebook' }, { $set: { autoPaused: true, autoPausedReason: overlayMsg, updatedAt: new Date() } }, { upsert: true });
                await logActivity(CRON_USER_ID, 'facebook', 'error', 'overlay_blocked', overlayMsg);
              }
              await closeBrowser();
              process.exit(1);
            }

            const result = await postComment(autoPostCandidate.url, replyText);

            if (result.success) {
              await Post.findByIdAndUpdate(autoPostCandidate._id, { status: 'posted', postedAt: new Date(), editedReply: replyText, postedByAccount: accountId });
              if (CRON_USER_ID) {
                const acc = await BrowserCookie.findOne({ userId: CRON_USER_ID, platform: 'facebook' }).lean();
                if (acc) {
                  const patch = buildSuccessPatch(acc as Parameters<typeof buildSuccessPatch>[0]);
                  await BrowserCookie.updateOne({ userId: CRON_USER_ID, platform: 'facebook' }, patch.$set ? { $set: patch.$set } : patch);
                }
                await logActivity(CRON_USER_ID, 'facebook', 'success', 'post', `Comment posted on ${autoPostCandidate.url}`, { score: autoPostCandidate.aiRelevanceScore });
              }
              console.log(`[comment] Posted successfully${accountId ? ` (account: ${accountId})` : ''}`);
            } else {
              const isStructuralError = result.error?.includes('Comment box not found') || result.error?.includes('Comments are disabled') || result.error?.includes('members-only') || result.error?.includes('private group');
              const isShadowBan = result.error?.includes('shadow-removed') || result.error?.includes('shadow ban');
              const isFbRejected = result.error?.includes('Facebook rejected comment') || result.error?.includes('Facebook blocked the comment');

              if (isStructuralError) {
                await Post.findByIdAndUpdate(autoPostCandidate._id, { status: 'failed', postAttempts: 3 });
                console.error('[comment] Post permanently skipped (restricted comment section):', result.error);
              } else {
                await Post.findByIdAndUpdate(autoPostCandidate._id, { $inc: { postAttempts: 1 } });
                if (CRON_USER_ID) {
                  if (isShadowBan || isFbRejected) {
                    const { action: blockAction, hours, blockCount } = await handleAutomationBlock(CRON_USER_ID, 'facebook', BrowserCookie);
                    const actionMsg = blockAction === 'hard_pause' ? `Account hard-paused after ${blockCount} automation blocks — resume from Accounts page` : blockAction === 'browse_only' ? `Browse-only mode 24h (block #${blockCount})` : `Backoff ${hours}h (block #${blockCount})`;
                    console.warn(`[Facebook] Automation block #${blockCount}: ${actionMsg}`);
                    if (blockAction === 'hard_pause') await notifyAuthError(CRON_USER_ID, 'facebook', `Facebook automation detected ${blockCount} times in 7 days — account needs attention`);
                  } else {
                    const acc = await BrowserCookie.findOne({ userId: CRON_USER_ID, platform: 'facebook' }).lean() as Record<string, unknown> | null;
                    if (acc) {
                      const errorCount = (acc.errorCount as number ?? 0) + 1;
                      const backoffMs = errorCount >= 3 ? 24 * 60 * 60 * 1000 : errorCount === 2 ? 4 * 60 * 60 * 1000 : 1 * 60 * 60 * 1000;
                      const patch = buildFailurePatch(acc as Parameters<typeof buildFailurePatch>[0], new Date(Date.now() + backoffMs));
                      await BrowserCookie.updateOne({ userId: CRON_USER_ID, platform: 'facebook' }, { $set: patch.$set });
                    }
                  }
                }
              }
              console.error('[comment] Failed:', result.error);
              const logAction = isShadowBan ? 'shadow_removed' : isFbRejected ? 'post_rejected' : 'post_failed';
              const logMsg = isShadowBan ? 'Comment shadow-removed by Facebook — possible shadow ban' : isFbRejected ? `Facebook explicitly rejected the comment: ${result.error?.slice(0, 100)}` : `Failed to post Facebook comment: ${result.error || 'Unknown error'}`;
              if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'facebook', 'error', logAction, logMsg, { url: autoPostCandidate.url });
            }
          }
        } else {
          console.log('[comment] No posts above auto-post threshold');
          if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'facebook', 'info', 'skip', 'No posts above auto-post threshold');
        }
      }
    }
  }

  console.log(`[${new Date().toISOString()}] FB Comment Cron: complete`);
  if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'facebook', 'info', 'cron_end', 'Facebook cron completed');
  await closeBrowser();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('Fatal error:', err);
  await closeBrowser().catch(() => {});
  process.exit(1);
});
