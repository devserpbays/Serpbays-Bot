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
  browseFeedAndReact,
  visitNewsFeed,
  visitNotifications,
  visitAuthorProfile,
  likeCommentsInThread,
  viewStories,
  checkForWarningOverlay,
  closeBrowser,
} from '../src/lib/facebook';
import { getWarmupLimit, getAccountAge, shouldRandomlySkip, jitterCooldown, getReadingDelay, getActionGap, capCooldown } from '../src/lib/antiBan';
import { isWithinSchedule } from '../src/lib/schedule';
import { logActivity, notifyAuthError } from '../src/lib/activityLog';
import Post from '../src/models/Post';
import Settings from '../src/models/Settings';
import BrowserCookie from '../src/models/BrowserCookie';
import { buildSuccessPatch, buildFailurePatch } from '../src/lib/accountHealth';

const DEFAULT_DAILY_LIMIT = 3;  // Facebook flags accounts posting too many group comments/day
const DEFAULT_AUTO_POST_THRESHOLD = 70; // Only comment on high-relevance posts (same bar as Twitter)

// --- Multi-session day model ---
// Defines what type of session to run based on time of day (IST).
// Morning: browse+react only. Work hours: full (react+comment). Evening: react only. Night: skip.
type SessionType = 'full' | 'react_only' | 'browse_only' | 'skip';

function getSessionType(): SessionType {
  const hour = (new Date().getUTCHours() + 5.5) % 24; // rough IST
  const h = Math.floor(hour);
  if (h >= 0 && h < 6)  return 'skip';        // 12am–6am: no activity
  if (h >= 6 && h < 9)  return 'browse_only'; // 6am–9am: morning browse
  if (h >= 9 && h < 18) return 'full';         // 9am–6pm: full session
  if (h >= 18 && h < 21) return 'react_only';  // 6pm–9pm: evening reactions
  return 'browse_only';                          // 9pm–12am: light browse
}

// --- Time-of-day activity multiplier (same pattern as Twitter) ---
// Returns 0.0–1.0 — 1.0 = peak hours, lower = off-peak
function getTimeOfDayMultiplier(): number {
  const hour = new Date().getUTCHours() + 5.5; // rough IST offset
  const h = Math.floor(hour) % 24;
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
  { value: 'short',  weight: 40 }, // 1-2 sentences
  { value: 'medium', weight: 40 }, // 2-3 sentences
  { value: 'long',   weight: 20 }, // 3-4 sentences with detail
];

// Comment style pool
const COMMENT_STYLES = [
  { value: 'helpful_tip',    weight: 25 },
  { value: 'question',       weight: 20 },
  { value: 'personal_story', weight: 20 },
  { value: 'practical_advice', weight: 20 },
  { value: 'observation',    weight: 15 },
];

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
async function getTodayReactionCount(): Promise<number> {
  const istOffset = 5.5 * 60 * 60000;
  const startOfDayUTC = new Date(new Date(Date.now() + istOffset).setHours(0, 0, 0, 0) - istOffset);
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
async function getTodayCommentCount(accountId: string): Promise<number> {
  const now = new Date();
  // Start of today in IST
  const istOffset = 5.5 * 60 * 60000;
  const istNow = new Date(now.getTime() + istOffset);
  const startOfDay = new Date(istNow);
  startOfDay.setHours(0, 0, 0, 0);
  const startOfDayUTC = new Date(startOfDay.getTime() - istOffset);

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

// --- Generate a unique, natural comment mentioning the company ---
// brandMentionRate: 0-100. Default 80 (social media manager strategy — mention brand most of the time).
// When post is highly brand-relevant, may mention brand up to 2 times.
async function generateVariedComment(
  postContent: string,
  companyName: string,
  companyDescription: string,
  brandMentionRate = 80
): Promise<string> {
  const randomSeed = Math.floor(Math.random() * 1000);
  const mentionBrand = Math.random() < (brandMentionRate / 100);

  // Detect if post is highly brand-relevant (allows a second natural mention)
  const brandKeywords = companyName.toLowerCase().split(/\s+/);
  const postLower = postContent.toLowerCase();
  const isBrandRelated = brandKeywords.some(kw => kw.length > 3 && postLower.includes(kw))
    || (companyDescription || '').toLowerCase().split(/\s+/).filter(w => w.length > 4).some(w => postLower.includes(w));
  const allowDoubleMention = mentionBrand && isBrandRelated && Math.random() < 0.5;

  const style = pickWeighted(COMMENT_STYLES);
  const length = pickWeighted(COMMENT_LENGTHS);

  const styleInstructions: Record<string, string> = {
    helpful_tip: 'share a genuine, actionable tip related to the post topic',
    question: 'ask a thoughtful, curious follow-up question about something in the post',
    personal_story: 'share a brief personal experience or lesson relevant to the discussion',
    practical_advice: 'give practical, specific advice that genuinely helps the reader',
    observation: 'share an insightful observation or perspective that builds on the post',
  };

  const lengthInstructions: Record<string, string> = {
    short: '1-2 concise sentences',
    medium: '2-3 natural sentences',
    long: '3-4 sentences with a bit of detail',
  };

  const brandInstruction = mentionBrand
    ? allowDoubleMention
      ? `As a social media manager for ${companyName} (${companyDescription}), weave in the brand naturally up to 2 times — once early and once at the end if it fits. Never force it.`
      : `If it fits organically, mention ${companyName} once — naturally, the way a social media manager would. Context: ${companyDescription}`
    : '';

  const prompt = `You are a real member of a Facebook group leaving a genuine comment.

POST:
"""
${postContent.slice(0, 500)}
"""

YOUR TASK: Write a comment (${lengthInstructions[length]}) that ${styleInstructions[style]}.
${brandInstruction}

STRICT RULES:
- Write ONLY the comment text, nothing else
- Sound like a genuine group member, NOT a spam bot or sales rep
- NEVER use phrases like "check out X", "X is amazing for", "I highly recommend X"
- NEVER include website URLs, domains, or hashtags
- The comment must genuinely add value to the discussion
- Use warm, conversational language — like a knowledgeable friend
- Do NOT include any code, errors, JSON, or technical output
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

  // Step 1b: Schedule guard (uses per-platform schedule if configured)
  const schedule = settings.platformSchedules?.get('facebook');
  if (!process.env.CRON_MANUAL && !isWithinSchedule(schedule)) {
    console.log('Outside scheduled hours, exiting');
    process.exit(0);
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
  const brandMentionRate: number = (settings as any).facebookBrandMentionRate ?? 80;
  const cooldownMinutes: number = capCooldown('facebook', (settings as any).facebookCooldownMinutes ?? 90);

  // Warmup ramp: limit daily posts based on account age to avoid detection
  const fbAddedAt = getAccountAge(settings, 'facebook');
  const dailyLimit = getWarmupLimit(configuredDailyLimit, fbAddedAt, 'facebook');
  if (dailyLimit < configuredDailyLimit) {
    console.log(`Warmup mode: daily limit capped at ${dailyLimit}/${configuredDailyLimit} (account age < 60 days)`);
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'facebook', 'info', 'warmup', `Warmup limit: ${dailyLimit}/${configuredDailyLimit}`);
  }

  // Multi-session model: determine session type from time of day
  const sessionType: SessionType = process.env.CRON_MANUAL ? 'full' : getSessionType();
  console.log(`Session type: ${sessionType} (${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST)`);

  if (sessionType === 'skip') {
    console.log('Night hours — skipping session');
    process.exit(0);
  }

  if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'facebook', 'info', 'session_start', `Session type: ${sessionType}`);

  // Within non-skip hours, still apply a probabilistic gate to avoid robotic regularity
  const todMultiplier = getTimeOfDayMultiplier();
  if (!process.env.CRON_MANUAL && Math.random() > todMultiplier) {
    console.log(`Time-of-day multiplier ${todMultiplier.toFixed(2)} → skipping this run`);
    process.exit(0);
  }

  // Random 15% skip to break up patterns (applied to all session types)
  if (!process.env.CRON_MANUAL && shouldRandomlySkip(0.15)) {
    console.log('Random skip (15% chance) — skipping this run');
    process.exit(0);
  }

  // Account health guard — skip if auto-paused or in backoff
  if (CRON_USER_ID) {
    const accHealth = await BrowserCookie.findOne({ userId: CRON_USER_ID, platform: 'facebook' }).lean() as Record<string, unknown> | null;
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
  }

  const passiveSession = sessionType !== 'full'; // browse_only and react_only both skip commenting

  // Step 2b: Read current account identity
  const accountId = getCurrentAccountId();
  if (accountId) {
    console.log(`Active Facebook account: ${accountId}`);
  }

  // Step 3: Check daily limit (per-account)
  const todayCount = await getTodayCommentCount(accountId);
  if (todayCount >= dailyLimit) {
    console.log(`Daily limit reached: ${todayCount}/${dailyLimit} comments posted today${accountId ? ` (account: ${accountId})` : ''}`);
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'facebook', 'info', 'limit', `Daily limit reached (${todayCount}/${dailyLimit}). Will resume tomorrow.`);
    process.exit(0);
  }
  console.log(`Comments posted today: ${todayCount}/${dailyLimit}${accountId ? ` (account: ${accountId})` : ''}`);

  // Step 3b: 15-minute cooldown — skip if last Facebook post was < 15 min ago
  // 15-minute cooldown (skipped for manual runs)
  if (!process.env.CRON_MANUAL) {
    const MIN_COMMENT_GAP_MS = jitterCooldown(cooldownMinutes); // ±30% jitter — avoids mechanical regularity
    const lastPosted = await Post.findOne({ platform: 'facebook', status: 'posted', postedAt: { $exists: true }, ...(CRON_USER_ID && { userId: CRON_USER_ID }) })
      .sort({ postedAt: -1 })
      .select('postedAt platform');
    if (lastPosted?.postedAt) {
      const elapsed = Date.now() - new Date(lastPosted.postedAt).getTime();
      if (elapsed < MIN_COMMENT_GAP_MS) {
        const remainMin = Math.ceil((MIN_COMMENT_GAP_MS - elapsed) / 60000);
        console.log(`Cooldown: last comment (${lastPosted.platform}) was ${Math.floor(elapsed / 60000)}m ago, need ${remainMin}m more. Skipping.`);
        process.exit(0);
      }
    }
  }

  // Step 4: Ensure logged in
  const loggedIn = await ensureFacebookLoggedIn();
  if (!loggedIn) {
    try {
      writeFileSync(join(process.cwd(), process.env.FACEBOOK_PROFILE_DIR || '.fb-profile', '.verified'), JSON.stringify({ loggedIn: false, ts: new Date().toISOString(), message: 'Session expired — cron detected not logged in' }));
    } catch {}
    console.error('Not logged in to Facebook. Re-set cookies from dashboard.');
    if (CRON_USER_ID) {
      await logActivity(CRON_USER_ID, 'facebook', 'error', 'auth_error', 'Not logged in to Facebook — re-set cookies from dashboard');
      await notifyAuthError(CRON_USER_ID, 'facebook', 'Not logged in to Facebook — re-set cookies from dashboard');
    }
    await closeBrowser();
    process.exit(1);
  }
  console.log('Facebook login confirmed');

  // Visit news feed — simulates real user checking their feed before acting
  try {
    await visitNewsFeed();
  } catch (e) { console.warn('visitNewsFeed error:', (e as Error).message); }

  // Visit notifications — part of every real user's session routine
  try {
    await visitNotifications();
  } catch (e) { console.warn('visitNotifications error:', (e as Error).message); }

  // View a few stories — real users check stories at session start
  try {
    const storyResult = await viewStories();
    if (storyResult.viewed > 0) {
      console.log(`Viewed ${storyResult.viewed} stories`);
      if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'facebook', 'info', 'stories_viewed', `Viewed ${storyResult.viewed} Facebook ${storyResult.viewed === 1 ? 'story' : 'stories'} at session start`, { count: storyResult.viewed });
    }
  } catch (e) { console.warn('viewStories error:', (e as Error).message); }

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

  // Non-full sessions: browse / react without commenting, then exit
  if (passiveSession) {
    if (sessionType === 'browse_only') {
      // Morning / late night: just browse the news feed, no reactions
      console.log('Browse-only session — visiting feed without reacting or commenting');
      await closeBrowser();
      process.exit(0);
    }
    // react_only: scroll groups and react to a few posts
    try {
      const result = await browseFeedAndReact(groupUrls.slice(0, 3), 2 + Math.floor(Math.random() * 3));
      console.log(`React-only session complete: reacted ${result.reacted} times (${result.reactions.join(', ')})`);
      if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'facebook', 'info', 'passive_session', `React-only session done — reacted ${result.reacted} times`);
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

  // Step 7b: React phase — react to 2–4 posts before evaluating/commenting
  // Reactions should always outnumber comments. Pick a random subset of scraped posts
  // that haven't been reacted to yet, regardless of whether they'll be commented on.
  if (allPosts.length > 0) {
    // Check daily reaction cap first
    const todayReactions = await getTodayReactionCount();
    if (todayReactions >= MAX_DAILY_REACTIONS) {
      console.log(`Daily reaction cap reached (${todayReactions}/${MAX_DAILY_REACTIONS}) — skipping react phase`);
    } else {
      const remainingReactionSlots = MAX_DAILY_REACTIONS - todayReactions;
      const reactCount = Math.min(2 + Math.floor(Math.random() * 3), remainingReactionSlots); // 2–4, capped by daily limit
      const shuffled = [...allPosts].sort(() => Math.random() - 0.5).slice(0, reactCount);

      console.log(`React phase: reacting to up to ${reactCount} posts (${todayReactions}/${MAX_DAILY_REACTIONS} today)`);
      let reactedCount = 0;

      for (const scraped of shuffled) {
        // Re-check cap inside loop
        if ((todayReactions + reactedCount) >= MAX_DAILY_REACTIONS) break;

        try {
          // Check if already reacted in DB
          const dbPost = await Post.findOne({
            url: scraped.url,
            ...(CRON_USER_ID && { userId: CRON_USER_ID }),
          }).select('_id likedByBot content');

          if (dbPost?.likedByBot) continue; // already reacted

          // Simulate reading the post before reacting (length-aware delay)
          const postLen = (dbPost?.content || scraped.content || '').length;
          const readMs = getReadingDelay(postLen);
          console.log(`  Reading post (${Math.round(readMs / 1000)}s before reacting)...`);
          await new Promise(r => setTimeout(r, readMs));

          const chosenReaction = pickReaction();
          const reactionResult = await reactToPost(scraped.url, chosenReaction);
          if (reactionResult.success) {
            if (dbPost) {
              await Post.findByIdAndUpdate(dbPost._id, { likedByBot: true, botReaction: reactionResult.reaction });
            }
            reactedCount++;
            console.log(`  Reacted ${reactionResult.reaction} → ${scraped.url.slice(0, 60)}`);
            if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'facebook', 'info', 'react', `Reacted ${reactionResult.reaction} to a post`, { url: scraped.url });
          }
          // Action gap between reactions (2–8s, same as Twitter)
          await new Promise(r => setTimeout(r, getActionGap()));
        } catch (e) {
          console.warn('  React phase error:', (e as Error).message);
        }
      }
      console.log(`React phase complete: reacted to ${reactedCount} posts`);
    }
  }

  // Step 8: Evaluate unevaluated Facebook posts
  const unevaluatedPosts = await Post.find({
    platform: 'facebook',
    status: 'new',
    ...(CRON_USER_ID && { userId: CRON_USER_ID }),
  }).limit(10);

  console.log(`Evaluating ${unevaluatedPosts.length} new Facebook posts`);

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

  // Step 9: Auto-post one high-scoring comment (rate limit: 1 per run)
  const recheck = await getTodayCommentCount(accountId);
  if (recheck >= dailyLimit) {
    console.log('Daily limit reached after evaluation, skipping auto-post');
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'facebook', 'info', 'limit', `Daily limit reached (${recheck}/${dailyLimit}). Will resume tomorrow.`);
    await closeBrowser();
    process.exit(0);
  }

  // Per-group comment cap: find which groups already received a comment today
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const postedToday = await Post.find({
    platform: 'facebook', status: 'posted',
    postedAt: { $gte: todayStart },
    ...(CRON_USER_ID && { userId: CRON_USER_ID }),
  }).select('url');
  const commentedGroupIds = new Set(
    postedToday.map(p => extractGroupId(p.url as string)).filter(Boolean)
  );
  if (commentedGroupIds.size > 0) {
    console.log(`Per-group cap: already commented in group(s) ${[...commentedGroupIds].join(', ')} today`);
  }

  // Author deduplication: skip authors who received a comment in the last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentlyCommentedPosts = await Post.find({
    platform: 'facebook',
    status: 'posted',
    postedAt: { $gte: sevenDaysAgo },
    ...(CRON_USER_ID && { userId: CRON_USER_ID }),
  }).select('author');
  const recentAuthors = new Set(recentlyCommentedPosts.map(p => p.author as string).filter(Boolean));
  if (recentAuthors.size > 0) {
    console.log(`Author dedup: skipping ${recentAuthors.size} author(s) commented on in the last 7 days`);
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'facebook', 'info', 'author_dedup', `Skipping ${recentAuthors.size} author(s) already engaged in the last 7 days`, { count: recentAuthors.size });
  }

  // Find candidates and pick first one not in an already-commented group today
  // and not from a recently-commented author
  const candidates = await Post.find({
    platform: 'facebook',
    status: 'evaluated',
    aiRelevanceScore: { $gte: autoPostThreshold },
    aiReply: { $exists: true, $ne: '' },
    postAttempts: { $not: { $gte: 3 } },
    ...(CRON_USER_ID && { userId: CRON_USER_ID }),
  }).sort({ _id: -1 }).limit(20);

  const autoPostCandidate = candidates.find(c => {
    const gid = extractGroupId(c.url as string);
    if (gid && commentedGroupIds.has(gid)) return false; // already commented in this group today
    if (c.author && recentAuthors.has(c.author as string)) return false; // same author within 7 days
    return true;
  }) || null;

  // Score-based skip: 5% idle cycle even when a candidate is found — breaks mechanical patterns
  if (autoPostCandidate && Math.random() < 0.05) {
    console.log('Score-based skip (5% idle cycle) — skipping candidate this run');
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'facebook', 'info', 'skip', 'Score-based idle cycle skip');
    await closeBrowser();
    process.exit(0);
  }

  if (autoPostCandidate) {
    // Generate a unique, varied comment using AI
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

    // Final safety check — block JSON/debug garbage and empty/error text
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
      console.log(
        `Auto-posting comment on ${autoPostCandidate.url} (score: ${autoPostCandidate.aiRelevanceScore})`
      );
      console.log(`Comment: "${replyText}"`);

      // Simulate reading the post before engaging (length-aware)
      const readMs = getReadingDelay((autoPostCandidate.content || '').length);
      console.log(`  Reading post (${Math.round(readMs / 1000)}s)...`);
      await new Promise(r => setTimeout(r, readMs));

      // Visit author's profile — real users check who they're replying to
      try {
        await visitAuthorProfile(autoPostCandidate.url);
      } catch (e) { console.warn('visitAuthorProfile error:', (e as Error).message); }
      await new Promise(r => setTimeout(r, getActionGap()));

      // Like 1–2 existing comments in the thread before posting ours
      try {
        const threadLikes = await likeCommentsInThread(autoPostCandidate.url, 1 + Math.floor(Math.random() * 2));
        if (threadLikes > 0) console.log(`  Liked ${threadLikes} existing comment(s) in thread`);
      } catch (e) { console.warn('likeCommentsInThread error:', (e as Error).message); }
      await new Promise(r => setTimeout(r, getActionGap()));

      // Warm-up: react to post before commenting (social media manager style — varied reactions)
      if (!autoPostCandidate.likedByBot) {
        try {
          const chosenReaction = pickReaction();
          const reactionResult = await reactToPost(autoPostCandidate.url, chosenReaction);
          if (reactionResult.success) {
            await Post.findByIdAndUpdate(autoPostCandidate._id, { likedByBot: true, botReaction: reactionResult.reaction });
            console.log(`  Reacted with ${reactionResult.reaction}`);
          }
          await new Promise(r => setTimeout(r, getActionGap()));
        } catch (e) { console.warn('React failed, continuing:', (e as Error).message); }
      }

      // Check for CAPTCHA / warning overlays before posting — back off if blocked
      const overlayCheck = await checkForWarningOverlay().catch(() => ({ blocked: false }));
      if (overlayCheck.blocked) {
        console.warn(`Warning overlay detected (${overlayCheck.reason}) — aborting comment this run`);
        if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'facebook', 'error', 'overlay_blocked', `Overlay blocked comment: ${overlayCheck.reason}`);
        await closeBrowser();
        process.exit(1);
      }

      const result = await postComment(autoPostCandidate.url, replyText);

      if (result.success) {
        await Post.findByIdAndUpdate(autoPostCandidate._id, {
          status: 'posted',
          postedAt: new Date(),
          editedReply: replyText,
          postedByAccount: accountId,
        });
        // Update account health on success
        if (CRON_USER_ID) {
          const acc = await BrowserCookie.findOne({ userId: CRON_USER_ID, platform: 'facebook' }).lean();
          if (acc) {
            const patch = buildSuccessPatch(acc as Parameters<typeof buildSuccessPatch>[0]);
            await BrowserCookie.updateOne({ userId: CRON_USER_ID, platform: 'facebook' }, patch.$set ? { $set: patch.$set } : patch);
          }
        }
        console.log(`Comment posted successfully${accountId ? ` (account: ${accountId})` : ''}`);
        if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'facebook', 'success', 'post', `Comment posted on ${autoPostCandidate.url}`, { score: autoPostCandidate.aiRelevanceScore });
      } else {
        // Structural = problem with the post itself (not with the account)
        const isStructuralError = result.error?.includes('Comment box not found') ||
          result.error?.includes('Comments are disabled') ||
          result.error?.includes('members-only') ||
          result.error?.includes('private group');

        // Account-level blocks — decrement health and use graduated backoff
        const isShadowBan   = result.error?.includes('shadow-removed') || result.error?.includes('shadow ban');
        const isFbRejected  = result.error?.includes('Facebook rejected comment') || result.error?.includes('Facebook blocked the comment');

        if (isStructuralError) {
          // Post's comment section is restricted — no point retrying it
          await Post.findByIdAndUpdate(autoPostCandidate._id, { status: 'failed', postAttempts: 3 });
          console.error('Post permanently skipped (restricted comment section):', result.error);
        } else {
          await Post.findByIdAndUpdate(autoPostCandidate._id, { $inc: { postAttempts: 1 } });
          // Update account health on failure — use graduated backoff based on consecutive errors
          if (CRON_USER_ID) {
            const acc = await BrowserCookie.findOne({ userId: CRON_USER_ID, platform: 'facebook' }).lean() as Record<string, unknown> | null;
            if (acc) {
              const errorCount = (acc.errorCount as number ?? 0) + 1;
              const backoffMs = errorCount >= 3 ? 24 * 60 * 60 * 1000
                              : errorCount === 2 ? 4 * 60 * 60 * 1000
                              : 1 * 60 * 60 * 1000;
              const backoffUntil = new Date(Date.now() + backoffMs);
              const patch = buildFailurePatch(acc as Parameters<typeof buildFailurePatch>[0], backoffUntil);
              await BrowserCookie.updateOne({ userId: CRON_USER_ID, platform: 'facebook' }, { $set: patch.$set });
            }
          }
        }
        console.error('Failed to post Facebook comment:', result.error);
        const action = isShadowBan ? 'shadow_removed' : isFbRejected ? 'post_rejected' : 'post_failed';
        const logMsg = isShadowBan
          ? `Comment shadow-removed by Facebook — possible shadow ban`
          : isFbRejected
          ? `Facebook explicitly rejected the comment: ${result.error?.slice(0, 100)}`
          : `Failed to post Facebook comment: ${result.error || 'Unknown error'}`;
        if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'facebook', 'error', action, logMsg, { url: autoPostCandidate.url });
      }
    }
  } else {
    console.log('No posts above auto-post threshold, skipping');
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'facebook', 'info', 'skip', 'No posts above auto-post threshold');
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
