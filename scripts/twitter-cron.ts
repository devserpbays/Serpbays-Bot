/**
 * Twitter/X Auto-Reply Cron Script (Optimized)
 *
 * Supports three modes:
 *   --mode=scrape  — search tweets + evaluate with AI (needs browser)
 *   --mode=post    — reply to evaluated tweets (HTTP-only, no browser)
 *   --mode=full    — both scrape + post (default, backward compatible)
 *
 * Posting uses HTTP-only client (no Chromium) — 100x lighter than browser mode.
 * Scraping still needs browser for Twitter's SearchTimeline network interception.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

const CRON_USER_ID = process.env.CRON_USER_ID;

import { readFileSync } from 'fs';
import { join } from 'path';
import { connectDB } from '../src/lib/mongodb';
import { evaluatePost, askOpenClaw } from '../src/lib/openclaw';
import { logActivity, notifyAuthError } from '../src/lib/activityLog';
import { isWithinSchedule } from '../src/lib/schedule';
import Post from '../src/models/Post';
import Settings from '../src/models/Settings';

// HTTP-only posting (no Chromium)
import {
  replyToTweetHttp,
  likeTweetHttp,
  extractTweetId,
  isTwitterConfiguredHttp,
  verifyCredentialsHttp,
} from '../src/lib/twitterHttp';

// Browser-based scraping + fallback posting (needs Chromium)
import { searchTweets, searchCommunityTweets, closeBrowser, replyToTweet, likeTweet } from '../src/lib/twitter';

const DEFAULT_DAILY_LIMIT = 4;
const DEFAULT_AUTO_POST_THRESHOLD = 70;
const MIN_ENGAGEMENT_SCORE = 1;

// Resolve profile dir for this user — require env var in multi-user mode
if (CRON_USER_ID && !process.env.TWITTER_PROFILE_DIR) {
  console.log('No Twitter account connected for this user, skipping.');
  process.exit(0);
}
const PROFILE_DIR = process.env.TWITTER_PROFILE_DIR
  ? join(process.cwd(), process.env.TWITTER_PROFILE_DIR)
  : join(process.cwd(), '.twitter-profile');

// Parse --mode flag
const MODE = (() => {
  const modeArg = process.argv.find(a => a.startsWith('--mode='));
  return (modeArg?.split('=')[1] || 'full') as 'scrape' | 'post' | 'full';
})();

// --- Read current Twitter account identity from profile dir's .verified file ---
function getExistingAccountData(): Record<string, string> {
  try {
    const raw = readFileSync(join(PROFILE_DIR, '.verified'), 'utf8');
    return JSON.parse(raw);
  } catch {}
  try {
    const raw = readFileSync(join(process.cwd(), '.twitter-account'), 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function getCurrentAccountId(): string {
  return getExistingAccountData().accountId || '';
}

async function getTodayReplyCount(accountId: string): Promise<number> {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60000;
  const istNow = new Date(now.getTime() + istOffset);
  const startOfDay = new Date(istNow);
  startOfDay.setHours(0, 0, 0, 0);
  const startOfDayUTC = new Date(startOfDay.getTime() - istOffset);

  const query: Record<string, unknown> = {
    platform: 'twitter',
    status: 'posted',
    postedAt: { $gte: startOfDayUTC },
  };
  if (accountId) query.postedByAccount = accountId;
  if (CRON_USER_ID) query.userId = CRON_USER_ID;

  return Post.countDocuments(query);
}

async function generateTweetReply(
  postContent: string,
  companyName: string,
  companyDescription: string,
  brandMentionRate = 25
): Promise<string> {
  const randomSeed = Math.floor(Math.random() * 1000);
  const mentionBrand = Math.random() < (brandMentionRate / 100);

  const brandRule = mentionBrand
    ? `- Mention "${companyName}" once, naturally woven into the reply (e.g. "been using ${companyName} for this", "${companyName} has decent options for this")`
    : `- Do NOT mention any brand, company, or service by name\n- Reply as a knowledgeable SEO person sharing a genuine tip or insight`;

  const prompt = `You are an SEO practitioner who regularly builds backlinks and guest posts. Reply to this tweet naturally, like a real person sharing experience.

TWEET:
"""
${postContent.slice(0, 280)}
"""

CONTEXT about ${companyName}: ${companyDescription}

RULES:
- Write ONLY the reply text — no quotes, no labels, no explanation
- Under 240 characters
- Sound like a real SEO person casually sharing what worked for them — NOT a brand rep or sales pitch
${brandRule}
- No URLs, no hashtags, no emojis unless it fits naturally
- Vary tone: sometimes enthusiastic, sometimes matter-of-fact, sometimes giving a tip
- Never start with "Hey", "Hi", "Great tweet", or "Absolutely"
- Never use marketing phrases like "game-changer", "seamless", "leverage", "robust", "check out", "highly recommend"
- Random variety seed: ${randomSeed}

Write the reply now:`;

  try {
    const raw = await askOpenClaw(prompt);
    let reply = raw;

    if (reply.trimStart().startsWith('{')) {
      try {
        const parsed = JSON.parse(reply);
        reply = parsed?.payloads?.[0]?.text
          || parsed?.result?.content
          || parsed?.content
          || parsed?.message
          || '';
      } catch {
        const textMatch = reply.match(/"text"\s*:\s*"([^"]+)"/);
        if (textMatch) reply = textMatch[1];
      }
    }

    reply = reply
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/^(Reply|Response|Here'?s?\s*(the|my|a)?\s*(reply|response)?:?\s*)/i, '')
      .replace(/\n/g, ' ')
      .replace(/https?:\/\/\S+/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (reply.length > 260) {
      reply = reply.slice(0, 257) + '...';
    }

    return reply;
  } catch (err) {
    console.error('Failed to generate tweet reply:', (err as Error).message);
    return '';
  }
}

// === SCRAPE PHASE: search tweets + evaluate with AI (needs browser) ===
async function scrapePhase(settings: any, keywords: string[]): Promise<{ totalFound: number; newPostCount: number }> {
  let totalFound = 0;
  let newPostCount = 0;

  for (const keyword of keywords) {
    try {
      console.log(`Searching tweets for: "${keyword}"`);
      const tweets = await searchTweets(keyword, 25);
      totalFound += tweets.length;

      for (const tweet of tweets) {
        if (!tweet.text || tweet.text.length < 15) continue;

        const engagementScore = tweet.likeCount + tweet.retweetCount + tweet.replyCount;
        if (engagementScore < MIN_ENGAGEMENT_SCORE) continue;

        const exists = await Post.findOne({ url: tweet.url, ...(CRON_USER_ID && { userId: CRON_USER_ID }) });
        if (!exists) {
          await Post.create({
            url: tweet.url,
            platform: 'twitter',
            ...(CRON_USER_ID && { userId: CRON_USER_ID }),
            author: tweet.authorHandle || tweet.author,
            content: tweet.text.slice(0, 2000),
            keywordsMatched: [keyword],
            likeCount: tweet.likeCount,
            retweetCount: tweet.retweetCount,
            replyCount: tweet.replyCount,
            bookmarkCount: tweet.bookmarkCount,
            viewCount: tweet.viewCount,
            status: 'new',
          });
          newPostCount++;
          console.log(`  Saved tweet ${tweet.id} (engagement: ${engagementScore})`);
        }
      }

      await new Promise((r) => setTimeout(r, 3000));
    } catch (err) {
      console.error(`Error searching tweets for "${keyword}":`, (err as Error).message);
    }
  }

  // Scrape Twitter Communities
  const communityIds: string[] = settings.twitterCommunityIds?.length ? settings.twitterCommunityIds : [];
  for (const communityId of communityIds) {
    try {
      console.log(`Scraping Twitter Community: ${communityId}`);
      const tweets = await searchCommunityTweets(communityId, 25);
      totalFound += tweets.length;

      for (const tweet of tweets) {
        if (!tweet.text || tweet.text.length < 15) continue;

        const engagementScore = tweet.likeCount + tweet.retweetCount + tweet.replyCount;
        if (engagementScore < MIN_ENGAGEMENT_SCORE) continue;

        const exists = await Post.findOne({ url: tweet.url, ...(CRON_USER_ID && { userId: CRON_USER_ID }) });
        if (!exists) {
          await Post.create({
            url: tweet.url,
            platform: 'twitter',
            ...(CRON_USER_ID && { userId: CRON_USER_ID }),
            author: tweet.authorHandle || tweet.author,
            content: tweet.text.slice(0, 2000),
            keywordsMatched: [`community:${communityId}`],
            likeCount: tweet.likeCount,
            retweetCount: tweet.retweetCount,
            replyCount: tweet.replyCount,
            bookmarkCount: tweet.bookmarkCount,
            viewCount: tweet.viewCount,
            status: 'new',
          });
          newPostCount++;
          console.log(`  Saved community tweet ${tweet.id} (engagement: ${engagementScore})`);
        }
      }

      await new Promise((r) => setTimeout(r, 3000));
    } catch (err) {
      console.error(`Error scraping community ${communityId}:`, (err as Error).message);
    }
  }

  // Close browser immediately after scraping to free RAM
  await closeBrowser();

  console.log(`Found ${totalFound} tweets, saved ${newPostCount} new posts to DB`);
  if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'twitter', 'info', 'scrape', `Scraped ${totalFound} tweets, saved ${newPostCount} new`, { totalFound, newPostCount });

  // Evaluate unevaluated posts (no browser needed)
  const unevaluatedPosts = await Post.find({
    platform: 'twitter',
    status: 'new',
    ...(CRON_USER_ID && { userId: CRON_USER_ID }),
  }).limit(10);

  console.log(`Evaluating ${unevaluatedPosts.length} new Twitter posts`);

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

  if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'twitter', 'info', 'evaluate', `Evaluated ${unevaluatedPosts.length} posts`);

  return { totalFound, newPostCount };
}

// === POST PHASE: reply to evaluated tweets via HTTP (no browser) ===
// Posts a batch of up to MAX_BATCH replies per cron run to get closer to daily limit.
const MAX_BATCH_PER_RUN = 3; // max replies in one cron run (with delays between each)
const INTER_REPLY_DELAY_MS = 45_000; // 45s between replies within a batch

async function postOneTweet(
  candidate: any,
  settings: any,
  accountId: string,
): Promise<'posted' | 'daily_limit' | 'auth_error' | 'skip' | 'error'> {
  let replyText = candidate.editedReply || '';

  if (!replyText) {
    replyText = await generateTweetReply(
      candidate.content,
      settings.companyName,
      settings.companyDescription,
      settings.twitterBrandMentionRate ?? 25
    );
  }

  if (!replyText && candidate.aiReply) {
    replyText = candidate.aiReply;
  }

  // Safety checks
  const looksLikeJson = /^\s*[\[{]/.test(replyText || '');
  // eslint-disable-next-line no-control-regex
  const hasAnsi = /\x1b\[[\d;]*m/.test(replyText || '');
  const hasPayloads = /"payloads"\s*:/.test(replyText || '');
  const hasDebugPrefix = /\[agent\/embedded\]/.test(replyText || '');

  if (looksLikeJson || hasAnsi || hasPayloads || hasDebugPrefix) {
    console.error('Generated reply failed format check, skipping:', replyText?.slice(0, 100));
    return 'skip';
  }
  if (!replyText || replyText.length < 5 || /error|failed|exception|undefined|null/i.test(replyText)) {
    console.error('Generated reply failed safety check, skipping:', replyText?.slice(0, 100));
    return 'skip';
  }

  const tweetText = replyText.length > 280 ? replyText.slice(0, 277) + '...' : replyText;
  const tweetId = extractTweetId(candidate.url);

  if (!tweetId) {
    console.error('No tweet ID found in URL, cannot reply — skipping');
    return 'skip';
  }

  const engagement = (candidate.likeCount || 0) + (candidate.retweetCount || 0) + (candidate.replyCount || 0);
  console.log(`Auto-replying to ${candidate.url} (score: ${candidate.aiRelevanceScore}, engagement: ${engagement})`);
  console.log(`Reply: "${tweetText}"`);

  try {
    // Like via HTTP (no browser)
    if (!candidate.likedByBot) {
      try {
        await likeTweetHttp(PROFILE_DIR, tweetId);
        await Post.findByIdAndUpdate(candidate._id, { likedByBot: true });
        console.log(`  Liked tweet ${tweetId}`);
        await new Promise((r) => setTimeout(r, 2000 + Math.random() * 2000));
      } catch {
        try {
          await likeTweet(tweetId);
          await Post.findByIdAndUpdate(candidate._id, { likedByBot: true });
          console.log(`  Liked tweet ${tweetId} (via browser fallback)`);
        } catch { /* ignore like failures */ }
      }
    }

    // Reply via HTTP first, fall back to browser if 226
    let replyId = '';
    try {
      const result = await replyToTweetHttp(PROFILE_DIR, tweetText, tweetId);
      replyId = result.data.id;
      console.log('  Reply posted via HTTP');
    } catch (httpErr) {
      const msg = (httpErr as Error).message;
      if (msg.includes('226') || msg.includes('403') || msg.includes('automated')) {
        console.log(`  HTTP blocked (${msg.includes('403') ? '403' : '226'}), falling back to browser posting...`);
        const result = await replyToTweet(tweetText, tweetId);
        replyId = result.data.id;
        console.log('  Reply posted via browser fallback');
      } else if (msg.includes('344') || msg.toLowerCase().includes('daily limit') || msg.includes('429') || msg.toLowerCase().includes('rate limit')) {
        console.log('  Twitter daily limit reached — stopping batch, will retry on next run');
        if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'twitter', 'info', 'rate_limit', 'Twitter daily tweet limit reached — will retry on next run');
        return 'daily_limit';
      } else {
        throw httpErr;
      }
    }

    const replyUrl = `https://x.com/i/status/${replyId}`;
    await Post.findByIdAndUpdate(candidate._id, {
      status: 'posted',
      postedAt: new Date(),
      editedReply: tweetText,
      replyUrl,
      postedByAccount: accountId,
    });

    console.log(`Reply posted successfully: ${replyUrl}`);
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'twitter', 'success', 'post', `Reply posted to ${candidate.url}`, { replyUrl, score: candidate.aiRelevanceScore });
    return 'posted';
  } catch (err) {
    const msg = (err as Error).message;
    const isAuthError = msg.includes('ct0') || msg.includes('auth_token') || msg.includes('cookies') || msg.includes('No cookies') || msg.includes('session expired');
    const isAutomationBlock = msg.includes('automated activity') || msg.includes('226') || msg.toLowerCase().includes('automation');
    const isSuspended = msg.includes('suspended') || msg.includes('locked') || msg.includes('64') || msg.includes('326');
    const isDuplicate = msg.includes('Duplicate tweet') || msg.includes('187');

    if (isAuthError) {
      console.error(`[Twitter] Auth error: ${msg}`);
      if (CRON_USER_ID) {
        await logActivity(CRON_USER_ID, 'twitter', 'error', 'auth_error', 'Twitter cookies expired — re-upload from dashboard');
        await notifyAuthError(CRON_USER_ID, 'twitter', 'Twitter cookies expired — re-upload from dashboard');
      }
      return 'auth_error';
    } else if (isAutomationBlock) {
      const attempts = (candidate.postAttempts || 0) + 1;
      await Post.findByIdAndUpdate(candidate._id, { $inc: { postAttempts: 1 } });
      console.warn(`[Twitter] Automation block (attempt ${attempts}/3): ${msg}`);
      if (CRON_USER_ID) {
        await logActivity(CRON_USER_ID, 'twitter', 'warn', 'automation_block', `Twitter flagged posting as automated activity (attempt ${attempts}/3). Posting paused — will retry automatically.`);
        if (attempts >= 3) {
          await notifyAuthError(CRON_USER_ID, 'twitter', 'Twitter is blocking posts as automated activity. Try posting less frequently or re-upload fresher cookies.');
        }
      }
      return 'error';
    } else if (isSuspended) {
      console.error(`[Twitter] Account locked/suspended: ${msg}`);
      if (CRON_USER_ID) {
        await logActivity(CRON_USER_ID, 'twitter', 'error', 'account_suspended', msg);
        await notifyAuthError(CRON_USER_ID, 'twitter', msg);
      }
      return 'auth_error';
    } else if (isDuplicate) {
      console.warn(`[Twitter] Duplicate tweet — marking post as posted to skip retry`);
      await Post.findByIdAndUpdate(candidate._id, { status: 'posted', postedAt: new Date(), postedByAccount: accountId });
      if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'twitter', 'warn', 'duplicate', 'Duplicate tweet skipped — reply already exists');
      return 'posted';
    } else {
      const attempts = (candidate.postAttempts || 0) + 1;
      await Post.findByIdAndUpdate(candidate._id, { $inc: { postAttempts: 1 } });
      console.error(`[Twitter] Reply failed (attempt ${attempts}/3): ${msg}`);
      if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'twitter', 'error', 'post_failed', `Reply failed (attempt ${attempts}/3): ${msg}`);
      return 'error';
    }
  }
}

async function postPhase(settings: any, accountId: string, dailyLimit: number, autoPostThreshold: number): Promise<void> {
  const todayCount = await getTodayReplyCount(accountId);
  if (todayCount >= dailyLimit) {
    console.log(`Daily limit reached (${todayCount}/${dailyLimit}), skipping auto-reply`);
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'twitter', 'info', 'limit', `Daily limit reached (${todayCount}/${dailyLimit}). Will resume tomorrow.`);
    return;
  }

  // Cooldown between runs (user-configured, default 60min)
  if (!process.env.CRON_MANUAL) {
    const MIN_COMMENT_GAP_MS = (settings.twitterCooldownMinutes ?? 60) * 60 * 1000;
    const lastPosted = await Post.findOne({
      platform: 'twitter', status: 'posted', postedAt: { $exists: true },
      ...(CRON_USER_ID && { userId: CRON_USER_ID }),
    }).sort({ postedAt: -1 }).select('postedAt');
    if (lastPosted?.postedAt) {
      const elapsed = Date.now() - new Date(lastPosted.postedAt).getTime();
      if (elapsed < MIN_COMMENT_GAP_MS) {
        const remainMin = Math.ceil((MIN_COMMENT_GAP_MS - elapsed) / 60000);
        console.log(`Cooldown: last reply was ${Math.floor(elapsed / 60000)}m ago, need ${remainMin}m more. Skipping.`);
        return;
      }
    }
  }

  // How many can we post this run?
  const remaining = dailyLimit - todayCount;
  const batchSize = Math.min(MAX_BATCH_PER_RUN, remaining);
  console.log(`Post phase: will attempt up to ${batchSize} replies (${todayCount}/${dailyLimit} used today)`);

  // Track IDs already posted this batch to avoid re-querying the same candidate
  const postedIds: string[] = [];
  let postedThisRun = 0;

  for (let i = 0; i < batchSize; i++) {
    const candidate = await Post.findOne({
      platform: 'twitter',
      status: 'evaluated',
      aiRelevanceScore: { $gte: autoPostThreshold },
      aiReply: { $exists: true, $ne: '' },
      postAttempts: { $not: { $gte: 3 } },
      ...(postedIds.length > 0 ? { _id: { $nin: postedIds } } : {}),
      ...(CRON_USER_ID && { userId: CRON_USER_ID }),
    }).sort({ aiRelevanceScore: -1, _id: -1 });

    if (!candidate) {
      if (i === 0) {
        console.log('No tweets above auto-post threshold, skipping');
        if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'twitter', 'info', 'skip', 'No tweets above auto-post threshold');
      } else {
        console.log('No more candidates for this run');
      }
      break;
    }

    postedIds.push(candidate._id.toString());

    const result = await postOneTweet(candidate, settings, accountId);

    if (result === 'posted') {
      postedThisRun++;
      // Delay between replies within the batch (except after the last one)
      if (i < batchSize - 1) {
        const delay = INTER_REPLY_DELAY_MS + Math.random() * 15_000;
        console.log(`  Waiting ${Math.round(delay / 1000)}s before next reply...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    } else if (result === 'daily_limit' || result === 'auth_error') {
      break; // stop the batch on hard limits
    }
    // 'skip' or 'error' → continue to next candidate
  }

  if (postedThisRun > 0) {
    console.log(`Batch complete: posted ${postedThisRun} repl${postedThisRun === 1 ? 'y' : 'ies'} this run`);
  }

  // Close browser if it was opened for fallback
  await closeBrowser();
}

async function main() {
  console.log(`[${new Date().toISOString()}] Twitter Cron: starting (user: ${CRON_USER_ID || 'default'}, mode: ${MODE})`);
  if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'twitter', 'info', 'cron_start', 'Twitter cron started');

  // Check credentials — cookies.json is required for all modes (posting uses HTTP, scraping uses browser)
  if (!isTwitterConfiguredHttp(PROFILE_DIR)) {
    console.error('No cookies.json found in profile dir — cannot run. Re-set cookies from dashboard.');
    if (CRON_USER_ID) {
      await logActivity(CRON_USER_ID, 'twitter', 'error', 'auth_error', 'No Twitter cookies found — re-set cookies from dashboard');
      await notifyAuthError(CRON_USER_ID, 'twitter', 'No Twitter cookies found — re-set cookies from dashboard');
    }
    process.exit(1);
  }

  await connectDB();

  const settings = await Settings.findOne(CRON_USER_ID ? { userId: CRON_USER_ID } : {});
  if (!settings) {
    console.error('No settings configured, exiting');
    process.exit(0);
  }

  if (!settings.companyName) {
    console.log('No company name configured. Set it in dashboard settings.');
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'twitter', 'error', 'config_error', 'No company name configured — set it in dashboard settings');
    process.exit(0);
  }

  const schedule = settings.platformSchedules?.get('twitter');
  if (!process.env.CRON_MANUAL && !isWithinSchedule(schedule)) {
    console.log('Outside scheduled hours, exiting');
    process.exit(0);
  }

  if (!process.env.CRON_MANUAL && settings.autoPostingPaused) {
    console.log('Auto-posting is paused via dashboard, exiting');
    process.exit(0);
  }

  const keywords: string[] = settings.twitterKeywords?.length
    ? settings.twitterKeywords
    : (settings.keywords?.length ? settings.keywords : []);
  if (keywords.length === 0) {
    console.log('No Twitter keywords configured. Add keywords in dashboard settings.');
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'twitter', 'warn', 'config_error', 'No Twitter keywords configured — add keywords in dashboard settings');
    process.exit(0);
  }
  const dailyLimit: number = settings.twitterDailyLimit ?? DEFAULT_DAILY_LIMIT;
  const autoPostThreshold: number = settings.twitterAutoPostThreshold ?? DEFAULT_AUTO_POST_THRESHOLD;

  let accountId = getCurrentAccountId();

  const todayCount = await getTodayReplyCount(accountId);
  if (todayCount >= dailyLimit) {
    console.log(`Daily limit reached: ${todayCount}/${dailyLimit}${accountId ? ` (account: ${accountId})` : ''}`);
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'twitter', 'info', 'limit', `Daily limit reached (${todayCount}/${dailyLimit}). Will resume tomorrow.`);
    process.exit(0);
  }
  console.log(`Replies posted today: ${todayCount}/${dailyLimit}${accountId ? ` (account: ${accountId})` : ''}`);

  // Verify credentials via HTTP (lightweight, no browser)
  if (isTwitterConfiguredHttp(PROFILE_DIR)) {
    try {
      const user = await verifyCredentialsHttp(PROFILE_DIR);
      console.log(`Twitter authenticated as: @${user.username} (${user.name}) [HTTP]`);
      if (user.username) accountId = `tw_${user.username}`;
    } catch (err) {
      console.warn('HTTP credential check failed:', (err as Error).message);
      // Not fatal — cookies might still work for posting
    }
  }

  // Execute based on mode
  if (MODE === 'scrape' || MODE === 'full') {
    await scrapePhase(settings, keywords);
  }

  if (MODE === 'post' || MODE === 'full') {
    await postPhase(settings, accountId, dailyLimit, autoPostThreshold);
  }

  console.log(`[${new Date().toISOString()}] Twitter Cron: complete`);
  if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'twitter', 'info', 'cron_end', 'Twitter cron completed');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
