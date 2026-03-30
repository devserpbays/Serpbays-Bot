/**
 * Quora Auto-Answerer Cron Script
 *
 * Scrapes Quora for keyword-matching questions, evaluates them with AI,
 * and auto-posts answers on high-scoring questions.
 *
 * Schedule: every 15 minutes via node-cron in server.js (auto-scheduled)
 *   Also respects configurable schedule guard (default: Mon-Fri 9AM-6PM IST)
 *   Posts 1 answer per run, with 15-min cooldown between answers
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

const CRON_USER_ID = process.env.CRON_USER_ID;

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { connectDB } from '../src/lib/mongodb';
import { evaluatePost, askOpenClaw } from '../src/lib/openclaw';
import {
  ensureQuoraLoggedIn,
  scrapeProfileIdentity,
  scrapeQuoraQuestions,
  postQuoraAnswer,
  postQuoraComment,
  browseQuoraFeed,
  upvoteQuoraAnswer,
  followQuoraQuestion,
  followQuoraTopic,
  visitQuoraProfile,
  closeBrowser,
  setProxy as setQuoraProxy,
} from '../src/lib/quora';
import { isWithinSchedule, getTodayStartUTC, getHourInTimezone } from '../src/lib/schedule';
import { logActivity, notifyAuthError } from '../src/lib/activityLog';
import Post from '../src/models/Post';
import Settings from '../src/models/Settings';
import BrowserCookie from '../src/models/BrowserCookie';
import { buildSuccessPatch, buildFailurePatch, handleAutomationBlock, getActivityProfile } from '../src/lib/accountHealth';
import { getWarmupLimit, getAccountAge, capCooldown, jitterCooldown, shouldRandomlySkip, getActionGap } from '../src/lib/antiBan';

const DEFAULT_DAILY_LIMIT = 2;  // Quora aggressively collapses spam answers
const DEFAULT_AUTO_POST_THRESHOLD = 70;

type SessionType = 'full' | 'browse_only' | 'skip';

function getSessionType(timezone: string): SessionType {
  const h = getHourInTimezone(timezone);
  if (h < 6 || h >= 23) return 'skip';
  if (h < 9 || h >= 21) return 'browse_only';
  return 'full';
}

function getTimeOfDayMultiplier(timezone: string): number {
  const h = getHourInTimezone(timezone);
  if (h < 6 || h >= 23) return 0;
  if (h < 8 || h >= 22) return 0.3;
  if (h < 9 || h >= 21) return 0.5;
  if (h >= 10 && h < 19) return 1.0;
  return 0.7;
}

if (CRON_USER_ID && !process.env.QUORA_PROFILE_DIR) {
  console.log('No Quora account connected for this user, skipping.');
  process.exit(0);
}

// --- Read current Quora account identity ---
function getVerifiedData(): Record<string, string> {
  try {
    const raw = readFileSync(join(process.cwd(), process.env.QUORA_PROFILE_DIR || '.quora-profile', '.verified'), 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function getCurrentAccountId(): string {
  return getVerifiedData().accountId || '';
}

// --- Count answers posted today for the current account ---
async function getTodayCommentCount(accountId: string, timezone = 'UTC'): Promise<number> {
  const startOfDayUTC = getTodayStartUTC(timezone);

  const query: Record<string, unknown> = {
    platform: 'quora',
    status: 'posted',
    postedAt: { $gte: startOfDayUTC },
  };
  if (accountId) {
    query.postedByAccount = accountId;
  }
  if (CRON_USER_ID) query.userId = CRON_USER_ID;

  return Post.countDocuments(query);
}

// --- Generate a genuine, helpful answer to any question (no brand push) ---
async function generateGenuineAnswer(
  postContent: string,
  companyName: string,
  companyDescription: string
): Promise<string> {
  const randomSeed = Math.floor(Math.random() * 1000);

  const styles = [
    'provide a thorough, expert answer with actionable advice',
    'share a genuine personal experience and lessons learned',
    'explain the topic clearly with a concrete real-world example',
    'give step-by-step practical guidance',
    'share a nuanced perspective that adds real value to the discussion',
  ];
  const style = styles[randomSeed % styles.length];

  const prompt = `You are a knowledgeable expert answering a question on Quora.

QUESTION:
"""
${postContent.slice(0, 500)}
"""

YOUR TASK: Write a 3-5 sentence answer that ${style}.

STRICT RULES:
- Write ONLY the answer text — no labels, no preamble
- Sound like a genuine human expert, NOT a marketer or salesperson
- The answer must be genuinely helpful on its own merits
- Do NOT mention any brand, company, product, or service by name
- Do NOT include website URLs
- Use professional but conversational Quora language
- Do NOT start with "Great question" or any flattery
- Do NOT include code, JSON, or error text
- Seed: ${randomSeed}

Write the answer now:`;

  try {
    const raw = await askOpenClaw(prompt);
    return cleanAiText(raw, companyName, 1500);
  } catch (err) {
    console.error('Failed to generate genuine answer:', (err as Error).message);
    return '';
  }
}

// --- Generate a short brand-mentioning comment based on the question topic ---
async function generateBrandComment(
  postContent: string,
  companyName: string,
  companyDescription: string
): Promise<string> {
  const randomSeed = Math.floor(Math.random() * 1000);

  const prompt = `You are a Quora user adding a comment on an answer to this question.

QUESTION:
"""
${postContent.slice(0, 400)}
"""

ABOUT ${companyName.toUpperCase()}: ${companyDescription}

YOUR TASK: Write a 1-2 sentence comment that adds a personal note mentioning ${companyName} naturally.
The comment should feel like a genuine user sharing their experience — NOT an ad.

STRICT RULES:
- Write ONLY the comment text, nothing else
- Mention ${companyName} once, naturally (e.g. "I've found ${companyName} helpful for this", "tried ${companyName} for exactly this reason")
- Keep it under 200 characters
- Do NOT include URLs or hashtags
- Sound like a real person sharing a personal tip, not a brand rep
- Seed: ${randomSeed}

Write the comment now:`;

  try {
    const raw = await askOpenClaw(prompt);
    return cleanAiText(raw, companyName, 200);
  } catch (err) {
    console.error('Failed to generate brand comment:', (err as Error).message);
    return '';
  }
}

// --- Shared text cleaner ---
function cleanAiText(raw: string, companyName: string, maxLen: number): string {
  let text = raw;
  if (text.trimStart().startsWith('{')) {
    try {
      const parsed = JSON.parse(text);
      text = parsed?.payloads?.[0]?.text || parsed?.result?.content || parsed?.content || parsed?.message || '';
    } catch {
      const m = text.match(/"text"\s*:\s*"([^"]+)"/);
      if (m) text = m[1];
    }
  }
  text = text
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/^(Answer|Reply|Comment|Response|Here'?s?\s*(the|my|a)?\s*(answer|reply|comment)?:?\s*)/i, '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(new RegExp(companyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\.com', 'gi'), companyName)
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (text.length > maxLen) text = text.slice(0, maxLen - 3) + '...';
  return text;
}

function isTextSafe(text: string | undefined): text is string {
  if (!text || text.length < 10) return false;
  if (/^\s*[\[{]/.test(text)) return false; // JSON garbage
  // eslint-disable-next-line no-control-regex
  if (/\x1b\[[\d;]*m/.test(text)) return false; // ANSI codes
  if (/"payloads"\s*:/.test(text)) return false;
  if (/\[agent\/embedded\]/.test(text)) return false;
  if (/error|failed|exception|undefined|null/i.test(text) && text.length < 20) return false;
  return true;
}

async function main() {
  console.log(`[${new Date().toISOString()}] Quora Cron: starting (user: ${CRON_USER_ID || 'default'})`);
  if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'quora', 'info', 'cron_start', 'Quora cron started');

  await connectDB();

  // Step 1: Load settings
  const settings = await Settings.findOne(CRON_USER_ID ? { userId: CRON_USER_ID } : {});
  if (!settings) {
    console.error('No settings configured, exiting');
    process.exit(0);
  }

  if (!settings.companyName) {
    console.log('No company name configured. Set it in dashboard settings.');
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'quora', 'error', 'config_error', 'No company name configured');
    process.exit(0);
  }

  // Step 1b: Schedule guard (uses per-platform schedule if configured, else global cron schedule)
  const cronTz = (settings as any).cronTimezone || '';
  const platformSchedule = (settings as any).platformSchedules?.get?.('quora') || null;
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

  // Pause guard
  if (!process.env.CRON_MANUAL && settings.autoPostingPaused) {
    console.log('Auto-posting is paused via dashboard, exiting');
    process.exit(0);
  }

  const tz = cronTz || 'UTC';
  const hour = getHourInTimezone(tz);
  const sessionType = getSessionType(tz);
  const multiplier = getTimeOfDayMultiplier(tz);

  if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'quora', 'info', 'session_start',
    `Session started — type: ${sessionType}, hour: ${hour}:00 ${tz}, activity: ${Math.round(multiplier * 100)}%`,
    { sessionType, hour, activityMultiplier: multiplier },
  );

  // Session type gate
  if (!process.env.CRON_MANUAL) {
    if (sessionType === 'skip') {
      console.log('Outside active hours (session=skip), exiting');
      if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'quora', 'info', 'session_skip', `Skipping — outside active hours (${hour}:00 ${tz})`);
      process.exit(0);
    }
    if (Math.random() > multiplier) {
      console.log(`Time-of-day gate: skipping (multiplier=${multiplier.toFixed(2)})`);
      if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'quora', 'info', 'session_skip', `Time-of-day gate skipped run (${Math.round(multiplier * 100)}% activity at ${hour}:00)`);
      process.exit(0);
    }
    if (shouldRandomlySkip(0.15)) {
      console.log('Random skip (anti-ban), exiting');
      if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'quora', 'info', 'session_skip', 'Random skip (15% anti-ban variability)');
      process.exit(0);
    }
  }

  // Account health guard
  let browseOnlyOverride = false;
  if (CRON_USER_ID) {
    const acc = await BrowserCookie.findOne({ userId: CRON_USER_ID, platform: 'quora' }).lean() as any;
    if (acc?.proxyUrl) setQuoraProxy(acc.proxyUrl as string);
    if (acc?.autoPaused) {
      console.warn(`Quora account auto-paused: ${acc.autoPausedReason || 'unknown'}`);
      await logActivity(CRON_USER_ID, 'quora', 'warn', 'auto_paused', `Auto-paused: ${acc.autoPausedReason || 'unknown'}`);
      process.exit(0);
    }
    if (acc?.backoffUntil && new Date(acc.backoffUntil) > new Date()) {
      const remainMin = Math.ceil((new Date(acc.backoffUntil).getTime() - Date.now()) / 60000);
      console.warn(`Quora account in backoff for ${remainMin}m more, skipping`);
      await logActivity(CRON_USER_ID, 'quora', 'warn', 'backoff', `Account in backoff — ${remainMin}m remaining. Cron skipped.`, { remainingMinutes: remainMin });
      process.exit(0);
    }
    if (acc?.browseOnlyUntil && new Date(acc.browseOnlyUntil) > new Date()) {
      const remainH = Math.ceil((new Date(acc.browseOnlyUntil).getTime() - Date.now()) / 3600000);
      console.warn(`Quora in browse-only mode for ${remainH}h more`);
      await logActivity(CRON_USER_ID, 'quora', 'warn', 'browse_only', `Browse-only mode — ${remainH}h remaining. Answering skipped, browsing continues.`);
      browseOnlyOverride = true;
    }
  }

  // Step 2: Load Quora-specific settings
  const keywords: string[] = settings.quoraKeywords?.length
    ? settings.quoraKeywords
    : (settings.keywords?.length ? settings.keywords : []);
  if (keywords.length === 0) {
    console.log('No Quora keywords configured. Add keywords in dashboard settings.');
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'quora', 'warn', 'config_error', 'No Quora keywords configured');
    process.exit(0);
  }
  const configuredDailyLimit: number = settings.quoraDailyLimit ?? DEFAULT_DAILY_LIMIT;
  const accountAddedAt = getAccountAge(settings, 'quora');
  let dailyLimit: number = getWarmupLimit(configuredDailyLimit, accountAddedAt, 'quora');
  if (dailyLimit < configuredDailyLimit) {
    console.log(`Warmup mode: daily limit capped at ${dailyLimit}/${configuredDailyLimit} (account age < 60 days)`);
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'quora', 'info', 'warmup', `Warmup limit: ${dailyLimit}/${configuredDailyLimit}`);
  }

  // ── Adaptive health throttling ──
  if (CRON_USER_ID) {
    const quoraDoc = await BrowserCookie.findOne({ userId: CRON_USER_ID, platform: 'quora' }).lean() as any;
    const healthScore: number = quoraDoc?.healthScore ?? 100;
    const actProfile = getActivityProfile(healthScore);

    if (actProfile.needsRecovery) {
      const alreadyInRecovery = !!(quoraDoc?.browseOnlyUntil && new Date(quoraDoc.browseOnlyUntil) > new Date());
      if (!alreadyInRecovery) {
        const until = new Date(Date.now() + actProfile.recoveryDays * 86400000);
        await BrowserCookie.findOneAndUpdate(
          { userId: CRON_USER_ID, platform: 'quora' },
          { $set: { browseOnlyUntil: until } },
          { upsert: true },
        );
        console.warn(`[Health] Score ${healthScore}/100 — starting ${actProfile.recoveryDays}-day browse-only recovery (until ${until.toDateString()})`);
        await logActivity(CRON_USER_ID, 'quora', 'warn', 'health_recovery',
          `Health ${healthScore}/100 — ${actProfile.recoveryDays}-day browse-only recovery: upvoting only, no answers`,
          { healthScore, recoveryDays: actProfile.recoveryDays, until: until.toISOString() },
        );
        browseOnlyOverride = true;
      }
      dailyLimit = 0;
    } else if (actProfile.commentMultiplier < 1 && dailyLimit > 1) {
      const throttledLimit = Math.max(1, Math.floor(dailyLimit * actProfile.commentMultiplier));
      if (throttledLimit < dailyLimit) {
        console.warn(`[Health] Score ${healthScore}/100 (${actProfile.label}) — daily limit throttled: ${throttledLimit}/${dailyLimit}`);
        await logActivity(CRON_USER_ID, 'quora', 'warn', 'health_throttle',
          `Health throttle: ${throttledLimit}/${dailyLimit} answers/day (${actProfile.label}, health ${healthScore}/100)`,
        );
        dailyLimit = throttledLimit;
      }
    }
  }

  const autoPostThreshold: number =
    settings.quoraAutoPostThreshold ?? DEFAULT_AUTO_POST_THRESHOLD;
  const brandMentionRate: number = (settings as any).quoraBrandMentionRate ?? 25;
  const cooldownMinutes: number = capCooldown('quora', (settings as any).quoraCooldownMinutes ?? 120);

  // Step 2b: Read current account identity
  const accountId = getCurrentAccountId();
  if (accountId) {
    console.log(`Active Quora account: ${accountId}`);
  }

  // Step 3: Check daily limit + cooldown → flags only (upvotes/browsing continue)
  let qrCommentBlocked = false;
  const todayCount = await getTodayCommentCount(accountId, tz);
  if (todayCount >= dailyLimit) {
    console.log(`Answer limit reached: ${todayCount}/${dailyLimit} — answering blocked, upvotes continue`);
    qrCommentBlocked = true;
  } else {
    console.log(`Answers posted today: ${todayCount}/${dailyLimit}${accountId ? ` (account: ${accountId})` : ''}`);
  }

  // Step 3b: 15-minute cooldown (skipped for manual runs)
  if (!qrCommentBlocked && !process.env.CRON_MANUAL) {
    const MIN_COMMENT_GAP_MS = jitterCooldown(cooldownMinutes);
    const lastPosted = await Post.findOne({ platform: 'quora', status: 'posted', postedAt: { $exists: true }, ...(CRON_USER_ID && { userId: CRON_USER_ID }) })
      .sort({ postedAt: -1 })
      .select('postedAt platform');
    if (lastPosted?.postedAt) {
      const elapsed = Date.now() - new Date(lastPosted.postedAt).getTime();
      if (elapsed < MIN_COMMENT_GAP_MS) {
        const remainMin = Math.ceil((MIN_COMMENT_GAP_MS - elapsed) / 60000);
        console.log(`Cooldown: ${remainMin}m remaining — answering blocked, upvotes continue`);
        qrCommentBlocked = true;
      }
    }
  }

  // Step 4: Ensure logged in
  const loggedIn = await ensureQuoraLoggedIn();
  if (!loggedIn) {
    try {
      writeFileSync(join(process.cwd(), process.env.QUORA_PROFILE_DIR || '.quora-profile', '.verified'), JSON.stringify({ loggedIn: false, ts: new Date().toISOString(), message: 'Session expired — cron detected not logged in' }));
    } catch {}
    const loginFailReason = 'Quora session expired — re-set cookies from dashboard';
    console.error(`Not logged in to Quora: ${loginFailReason}`);
    if (CRON_USER_ID) {
      await BrowserCookie.findOneAndUpdate(
        { userId: CRON_USER_ID, platform: 'quora' },
        { $set: { autoPaused: true, autoPausedReason: loginFailReason, updatedAt: new Date() } },
        { upsert: true },
      );
      await logActivity(CRON_USER_ID, 'quora', 'error', 'auth_error', loginFailReason);
      await notifyAuthError(CRON_USER_ID, 'quora', loginFailReason);
    }
    await closeBrowser();
    process.exit(1);
  }
  console.log('Quora login confirmed');

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
    writeFileSync(join(process.cwd(), process.env.QUORA_PROFILE_DIR || '.quora-profile', '.verified'), JSON.stringify({
      loggedIn: true, ts: new Date().toISOString(),
      message: 'Quora session verified by cron',
      accountId: aid, displayName: dn, username: un,
    }));
  } catch {}

  // Step 5: Scrape questions via keyword search
  const allQuestions = await scrapeQuoraQuestions(keywords);
  console.log(`Found ${allQuestions.length} keyword-matching questions`);

  // Step 6: Save new questions to DB
  let newPostCount = 0;
  for (const question of allQuestions) {
    const exists = await Post.findOne({ url: question.url, ...(CRON_USER_ID && { userId: CRON_USER_ID }) });
    if (!exists) {
      await Post.create({
        url: question.url,
        platform: 'quora',
        ...(CRON_USER_ID && { userId: CRON_USER_ID }),
        author: question.author,
        content: question.content,
        keywordsMatched: keywords.filter((kw) =>
          question.content.toLowerCase().includes(kw.toLowerCase())
        ),
        status: 'new',
      });
      newPostCount++;
    }
  }
  console.log(`Saved ${newPostCount} new questions to DB`);

  // Step 7: Evaluate unevaluated Quora questions
  const unevaluatedPosts = await Post.find({
    platform: 'quora',
    status: 'new',
    ...(CRON_USER_ID && { userId: CRON_USER_ID }),
  }).limit(10);

  console.log(`Evaluating ${unevaluatedPosts.length} new Quora questions`);

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

      console.log(`  Question ${post._id}: score=${evaluation.score}`);
    } catch (err) {
      console.error(`  Failed to evaluate question ${post._id}:`, (err as Error).message);
      await Post.findByIdAndUpdate(post._id, { status: 'new' });
    }
  }

  // Step 7.5: Session opener — browse feed (every session, before posting)
  try {
    console.log('[Session] Browsing Quora home feed...');
    await browseQuoraFeed();
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'quora', 'info', 'browse_feed', 'Browsed Quora home feed at session start');
    await new Promise(r => setTimeout(r, getActionGap()));
  } catch (e) {
    console.warn('Feed browse failed (non-critical):', (e as Error).message);
  }

  // ── Guaranteed upvote pass ──────────────────────────────────────────────────
  // Minimum 5-7 upvotes per day, always attempt (no random skip).
  // Candidates are shuffled randomly so the bot doesn't always upvote the same top-scored posts.
  const todayEngageStart = getTodayStartUTC(tz);
  const todayUpvoteCount = await Post.countDocuments({ platform: 'quora', likedByBot: true, updatedAt: { $gte: todayEngageStart }, ...(CRON_USER_ID && { userId: CRON_USER_ID }) });
  const dailyUpvoteTarget = 5 + Math.floor(Math.random() * 3); // always 5-7/day regardless of warmup
  const upvoteRemaining = Math.max(0, dailyUpvoteTarget - todayUpvoteCount);

  console.log(`[Upvote] Today: ${todayUpvoteCount}/${dailyUpvoteTarget} | remaining: ${upvoteRemaining}`);
  if (upvoteRemaining > 0) {
    // 2-3 per session, spread across the day
    const thisSessionUpvotes = Math.min(upvoteRemaining, 2 + Math.floor(Math.random() * 2));
    // Fetch more candidates than needed, then shuffle randomly
    const upvoteCandidates = await Post.find({
      platform: 'quora',
      status: { $in: ['evaluated', 'posted'] },
      likedByBot: { $ne: true },
      postDeleted: { $ne: true },
      ...(CRON_USER_ID && { userId: CRON_USER_ID }),
    }).sort({ aiRelevanceScore: -1 }).limit(thisSessionUpvotes * 5);

    // Shuffle randomly so we don't always upvote the same top posts
    const shuffled = upvoteCandidates.sort(() => Math.random() - 0.5).slice(0, thisSessionUpvotes);
    console.log(`[Upvote] Found ${upvoteCandidates.length} candidates, picked ${shuffled.length} randomly`);

    if (shuffled.length > 0) {
      let upvoted = 0;
      for (const qPost of shuffled) {
        try {
          console.log(`  Upvoting: ${(qPost.url as string).slice(0, 60)}`);
          const count = await upvoteQuoraAnswer(qPost.url as string, 2);
          if (count > 0) {
            await Post.findByIdAndUpdate(qPost._id, { likedByBot: true });
            upvoted++;
            if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'quora', 'info', 'upvote_answer',
              `Upvoted ${count} answer(s) on a question`, { url: qPost.url, count },
            );
          }
          await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));
        } catch (e) { console.warn('  Upvote error:', (e as Error).message); }
      }
      console.log(`[Upvote] Done: upvoted on ${upvoted} question(s)`);
    }
  }

  // Step 8: Answer posting (gated by qrCommentBlocked + browse-only + daily limit)
  const isBrowseOnly = browseOnlyOverride || qrCommentBlocked || (!process.env.CRON_MANUAL && sessionType === 'browse_only');

  if (isBrowseOnly) {
    console.log(`Answer phase skipped (${browseOnlyOverride ? 'cooldown' : qrCommentBlocked ? 'limit/cooldown' : 'off-peak'}) — upvotes done`);
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'quora', 'info', 'browse_only', 'Upvotes + browsing done, answering skipped this run');
    await closeBrowser();
    process.exit(0);
  }

  const recheck = await getTodayCommentCount(accountId, tz);
  if (recheck >= dailyLimit) {
    console.log(`[answer] Daily limit reached (${recheck}/${dailyLimit}) — skipping`);
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'quora', 'info', 'limit', `Daily limit reached (${recheck}/${dailyLimit}). Upvotes done.`);
    await closeBrowser();
    process.exit(0);
  }

  // Author dedup: skip questions from askers we've answered in the last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentlyAnswered = await Post.find({
    platform: 'quora',
    status: 'posted',
    postedAt: { $gte: sevenDaysAgo },
    ...(CRON_USER_ID && { userId: CRON_USER_ID }),
  }).select('author keywordsMatched').lean();

  const recentAuthors = new Set(
    recentlyAnswered.map(p => p.author as string).filter(a => a && a !== 'Unknown')
  );
  if (recentAuthors.size > 0 && CRON_USER_ID) {
    await logActivity(CRON_USER_ID, 'quora', 'info', 'author_dedup',
      `Author dedup: skipping questions from ${recentAuthors.size} asker(s) answered in the last 7 days`,
      { count: recentAuthors.size },
    );
  }

  // Topic dedup: max 1 answer per primary keyword per day
  // Prevents answering multiple questions on the same topic in one day (looks spammy)
  const todayStart = getTodayStartUTC(tz);
  const todayAnswered = await Post.find({
    platform: 'quora',
    status: 'posted',
    postedAt: { $gte: todayStart },
    ...(CRON_USER_ID && { userId: CRON_USER_ID }),
  }).select('keywordsMatched').lean();

  const todayKeywords = new Set<string>();
  for (const p of todayAnswered) {
    const kws = (p as any).keywordsMatched as string[] | undefined;
    if (kws?.length) todayKeywords.add(kws[0].toLowerCase());
  }
  if (todayKeywords.size > 0 && CRON_USER_ID) {
    await logActivity(CRON_USER_ID, 'quora', 'info', 'topic_dedup',
      `Topic dedup: already answered a question about [${[...todayKeywords].join(', ')}] today — skipping same topics`,
      { count: todayKeywords.size },
    );
  }

  // Pick best evaluated question, respecting author + topic dedup
  // Quora questions are evergreen — no freshness filter
  const candidates = await Post.find({
    platform: 'quora',
    status: 'evaluated',
    aiReply: { $exists: true, $ne: '' },
    postAttempts: { $not: { $gte: 3 } },
    postDeleted: { $ne: true },
    ...(CRON_USER_ID && { userId: CRON_USER_ID }),
  }).sort({ aiRelevanceScore: -1, _id: -1 }).limit(20).lean();

  const candidate = candidates.find(c => {
    if (c.author && c.author !== 'Unknown' && recentAuthors.has(c.author as string)) return false;
    const kws = (c as any).keywordsMatched as string[] | undefined;
    if (kws?.length && todayKeywords.has(kws[0].toLowerCase())) return false;
    return true;
  }) || null;

  if (!candidate) {
    const msg = candidates.length > 0
      ? `All ${candidates.length} candidates filtered by author/topic dedup`
      : 'No evaluated questions available to answer';
    console.log(msg);
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'quora', 'info', 'skip', msg);
    await closeBrowser();
    process.exit(0);
  }

  // --- Warm-up before answering ---

  // 1. Upvote existing answers (show genuine interest in the topic)
  try {
    console.log('[Warm-up] Upvoting existing answers on target question...');
    const upvoted = await upvoteQuoraAnswer(candidate.url, 2);
    console.log(`  Upvoted ${upvoted} answer(s)`);
    if (upvoted > 0) {
      // Mark the candidate post as engaged-with so overview upvote count updates
      await Post.findByIdAndUpdate(candidate._id, { likedByBot: true });
    }
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'quora', 'info', 'upvote_answer',
      `Upvoted ${upvoted} existing answer(s) before posting`,
      { count: upvoted, url: candidate.url },
    );
    await new Promise(r => setTimeout(r, getActionGap()));
  } catch (e) {
    console.warn('[Warm-up] Upvote failed (non-critical):', (e as Error).message);
  }

  // 2. Follow the question (subscribe — looks like a genuinely curious user)
  try {
    console.log('[Warm-up] Following target question...');
    const followed = await followQuoraQuestion(candidate.url);
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'quora', 'info', 'follow_question',
      followed ? `Followed question before answering` : `Question already followed`,
      { url: candidate.url },
    );
    await new Promise(r => setTimeout(r, getActionGap()));
  } catch (e) {
    console.warn('[Warm-up] Follow question failed (non-critical):', (e as Error).message);
  }

  // 3. Follow a related topic (keyword-based)
  const topicToFollow = keywords[Math.floor(Math.random() * keywords.length)];
  if (topicToFollow && Math.random() < 0.5) {
    try {
      console.log(`[Warm-up] Following topic: ${topicToFollow}`);
      const followedTopic = await followQuoraTopic(topicToFollow);
      if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'quora', 'info', 'follow_topic',
        followedTopic ? `Followed topic: ${topicToFollow}` : `Already following topic: ${topicToFollow}`,
        { topic: topicToFollow },
      );
      await new Promise(r => setTimeout(r, getActionGap()));
    } catch (e) {
      console.warn('[Warm-up] Follow topic failed (non-critical):', (e as Error).message);
    }
  }

  // 4. Visit question asker's profile (if known)
  if (candidate.author && candidate.author !== 'Unknown') {
    try {
      console.log(`[Warm-up] Visiting asker profile: ${candidate.author}`);
      await visitQuoraProfile(candidate.author as string);
      if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'quora', 'info', 'visit_profile',
        `Visited asker profile before answering`,
        { author: candidate.author },
      );
      await new Promise(r => setTimeout(r, getActionGap()));
    } catch (e) { /* non-critical */ }
  }

  // --- Phase 1: Post a genuine, helpful answer ---
  let answerText = await generateGenuineAnswer(
    candidate.content,
    settings.companyName,
    settings.companyDescription
  );

  if (!isTextSafe(answerText) && candidate.aiReply && isTextSafe(candidate.aiReply)) {
    console.log('Generated answer failed safety check, falling back to pre-evaluated aiReply');
    answerText = candidate.aiReply;
  }

  if (!isTextSafe(answerText)) {
    console.error(`Answer failed safety check (len=${answerText?.length ?? 0})`);
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'quora', 'warn', 'answer_safety_error', 'Generated answer failed safety check — skipped', { url: candidate.url });
    await Post.findByIdAndUpdate(candidate._id, { $inc: { postAttempts: 1 } });
    await closeBrowser();
    process.exit(0);
  }

  console.log(`\n[Phase 1] Answering: ${candidate.url}`);
  console.log(`Preview: "${answerText.slice(0, 120)}..."`);

  const answerResult = await postQuoraAnswer(candidate.url, answerText);
  if (answerResult.success) {
    await Post.findByIdAndUpdate(candidate._id, {
      status: 'posted',
      postedAt: new Date(),
      editedReply: answerText,
      postedByAccount: accountId,
    });
    // Health score: success
    if (CRON_USER_ID) {
      const accDoc = await BrowserCookie.findOne({ userId: CRON_USER_ID, platform: 'quora' }).lean();
      if (accDoc) {
        const patch = buildSuccessPatch(accDoc as Parameters<typeof buildSuccessPatch>[0]);
        await BrowserCookie.updateOne({ userId: CRON_USER_ID, platform: 'quora' }, patch.$set ? { $set: patch.$set } : patch);
      }
    }
    console.log('Answer posted successfully');
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'quora', 'success', 'post', `Answered question: ${candidate.url}`, { score: candidate.aiRelevanceScore });
  } else {
    await Post.findByIdAndUpdate(candidate._id, { $inc: { postAttempts: 1 } });
    // Health score: failure + tiered backoff
    if (CRON_USER_ID) {
      const isAutomationBlock = (answerResult.error || '').match(/collapsed|spam|blocked|automated|rate.?limit/i);
      if (isAutomationBlock) {
        const { action, hours, blockCount } = await handleAutomationBlock(CRON_USER_ID, 'quora', BrowserCookie);
        const actionMsg = action === 'hard_pause'
          ? `Account hard-paused after ${blockCount} automation blocks`
          : action === 'browse_only'
          ? `Browse-only mode 24h (block #${blockCount})`
          : `Backoff ${hours}h (block #${blockCount})`;
        console.warn(`[Quora] Automation block #${blockCount}: ${actionMsg}`);
        await logActivity(CRON_USER_ID, 'quora', 'warn', 'automation_block', actionMsg, { blockCount, action, hours });
        if (action === 'hard_pause') {
          await notifyAuthError(CRON_USER_ID, 'quora', `Quora automation detected ${blockCount} times in 7 days`);
        }
      } else {
        const accDoc = await BrowserCookie.findOne({ userId: CRON_USER_ID, platform: 'quora' }).lean() as any;
        if (accDoc) {
          const errorCount = (accDoc.errorCount ?? 0) + 1;
          const backoffMs = errorCount >= 3 ? 24 * 60 * 60 * 1000
                          : errorCount === 2 ? 4 * 60 * 60 * 1000
                          : 1 * 60 * 60 * 1000;
          const patch = buildFailurePatch(accDoc as Parameters<typeof buildFailurePatch>[0], new Date(Date.now() + backoffMs));
          await BrowserCookie.updateOne({ userId: CRON_USER_ID, platform: 'quora' }, { $set: patch.$set });
        }
      }
    }
    console.error('Failed to post answer:', answerResult.error);
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'quora', 'error', 'post_failed', `Failed to post answer: ${answerResult.error}`, { url: candidate.url });
    await closeBrowser();
    process.exit(0);
  }

  // --- Phase 2: Optional brand comment on same question ---
  const shouldComment = Math.random() < (brandMentionRate / 100);
  if (shouldComment && (recheck + 1) < dailyLimit) {
    console.log('\n[Phase 2] Posting brand comment...');
    await new Promise(r => setTimeout(r, 4000 + Math.random() * 3000));

    const commentText = await generateBrandComment(
      candidate.content,
      settings.companyName,
      settings.companyDescription
    );

    if (isTextSafe(commentText) && commentText.length >= 10) {
      console.log(`Comment preview: "${commentText}"`);
      const commentResult = await postQuoraComment(candidate.url, commentText);
      if (commentResult.success) {
        console.log('Brand comment posted successfully');
        if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'quora', 'success', 'post', `Brand comment posted on ${candidate.url}`);
      } else {
        console.warn('Brand comment failed (non-fatal):', commentResult.error);
        if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'quora', 'warn', 'comment_failed', `Brand comment failed: ${commentResult.error}`);
      }
    } else {
      console.log('Comment text failed safety check — skipping');
      if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'quora', 'warn', 'comment_safety_error', 'Brand comment failed safety check — skipped');
    }
  } else {
    console.log(`[Phase 2] Skipping brand comment (rate: ${brandMentionRate}%, remaining today: ${dailyLimit - recheck - 1})`);
  }

  console.log(`[${new Date().toISOString()}] Quora Cron: complete`);
  if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'quora', 'info', 'cron_end', 'Quora cron completed');
  await closeBrowser();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('Fatal error:', err);
  await closeBrowser().catch(() => {});
  process.exit(1);
});
