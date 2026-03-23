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
import BrowserCookie from '../src/models/BrowserCookie';
import { buildSuccessPatch, buildFailurePatch } from '../src/lib/accountHealth';

// HTTP-only posting (no Chromium)
import {
  replyToTweetHttp,
  likeTweetHttp,
  postTweetHttp,
  retweetHttp,
  bookmarkHttp,
  followUserHttp,
  unfollowUserHttp,
  extractTweetId,
  isTwitterConfiguredHttp,
  verifyCredentialsHttp,
} from '../src/lib/twitterHttp';

// Browser-based scraping + fallback posting (needs Chromium)
import { searchTweets, searchCommunityTweets, closeBrowser, scrollHomeFeed, replyToTweet, likeTweet } from '../src/lib/twitter';

import TwitterFollowed from '../src/models/TwitterFollowed';

// Human-like engagement engine
import {
  pickEngagementActions,
  getReadingDelay,
  getActionGap,
  getInterReplyDelay,
  getWarmupLimit,
  getAccountAge,
  shouldRandomlySkip,
  humanSleep,
  jitterCooldown,
} from '../src/lib/antiBan';

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
  return (modeArg?.split('=')[1] || 'full') as 'scrape' | 'post' | 'full' | 'engage';
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

async function generateOriginalTweet(
  keyword: string,
  companyName: string,
  companyDescription: string,
  brandMentionRate = 25,
): Promise<string> {
  const randomSeed = Math.floor(Math.random() * 1000);
  const mentionBrand = Math.random() < (brandMentionRate / 100);

  const brandRule = mentionBrand
    ? `- Mention "${companyName}" once, naturally — e.g. as a tool you use or recommend`
    : `- Do NOT mention any brand or company name — just share the insight`;

  const prompt = `You are an SEO practitioner who posts regularly on Twitter/X. Write a single original tweet about the topic below.

TOPIC: "${keyword}"
CONTEXT about ${companyName}: ${companyDescription}

RULES:
- Write ONLY the tweet text — no quotes, no labels, no explanation
- Under 240 characters
- Sound like a real person sharing a genuine tip, insight, or question about the topic
${brandRule}
- No URLs
- 0–2 relevant hashtags, only if they fit naturally
- Vary format: sometimes a tip, sometimes a question, sometimes a quick stat or observation
- Never use marketing phrases like "game-changer", "seamless", "leverage", "robust"
- Never start with "Hey", "Hi", or "Absolutely"
- Random variety seed: ${randomSeed}

Write the tweet now:`;

  try {
    const raw = await askOpenClaw(prompt);
    let tweet = raw;

    if (tweet.trimStart().startsWith('{')) {
      try {
        const parsed = JSON.parse(tweet);
        tweet = parsed?.payloads?.[0]?.text || parsed?.result?.content || parsed?.content || parsed?.message || '';
      } catch {
        const m = tweet.match(/"text"\s*:\s*"([^"]+)"/);
        if (m) tweet = m[1];
      }
    }

    tweet = tweet
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/^(Tweet|Post|Here'?s?\s*(the|my|a)?\s*(tweet|post)?:?\s*)/i, '')
      .replace(/\n/g, ' ')
      .replace(/https?:\/\/\S+/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (tweet.length > 260) tweet = tweet.slice(0, 257) + '...';

    return tweet;
  } catch (err) {
    console.error('Failed to generate original tweet:', (err as Error).message);
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
      console.log(`  Community ${communityId}: ${tweets.length} found, ${newPostCount} new saved`);
      await new Promise((r) => setTimeout(r, 3000));
    } catch (err) {
      console.error(`Error scraping community ${communityId}:`, (err as Error).message, (err as Error).stack?.split('\n')[1]);
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
    // ── Human-like engagement: simulate reading the post ──
    const readTime = getReadingDelay((candidate.content || '').length);
    console.log(`  Simulating reading (${Math.round(readTime / 1000)}s)...`);
    await new Promise(r => setTimeout(r, readTime));

    // ── Pick random engagement actions based on relevance score ──
    const actions = pickEngagementActions(candidate.aiRelevanceScore || 0, {
      likeRate: settings.twitterLikeRate,
      retweetRate: settings.twitterRetweetRate,
      bookmarkRate: settings.twitterBookmarkRate,
      replyRate: settings.twitterReplyRate,
    });

    if (actions.length === 0) {
      console.log('  Scrolled past (random skip) — no engagement this time');
      return 'skip';
    }

    console.log(`  Actions: [${actions.join(', ')}]`);

    let replyId = '';
    let didReply = false;

    for (const action of actions) {
      // Gap between actions on the same post
      await new Promise(r => setTimeout(r, getActionGap()));

      switch (action) {
        case 'like':
          if (!candidate.likedByBot) {
            try {
              await likeTweetHttp(PROFILE_DIR, tweetId);
              await Post.findByIdAndUpdate(candidate._id, { likedByBot: true });
              console.log(`  Liked tweet ${tweetId}`);
            } catch {
              try {
                await likeTweet(tweetId);
                await Post.findByIdAndUpdate(candidate._id, { likedByBot: true });
                console.log(`  Liked tweet ${tweetId} (browser fallback)`);
              } catch { /* ignore */ }
            }
          }
          break;

        case 'retweet':
          if (!candidate.retweetedByBot) {
            try {
              await retweetHttp(PROFILE_DIR, tweetId);
              await Post.findByIdAndUpdate(candidate._id, { retweetedByBot: true });
              console.log(`  Retweeted tweet ${tweetId}`);
            } catch (e) {
              console.log(`  Retweet failed: ${(e as Error).message.slice(0, 80)}`);
            }
          }
          break;

        case 'bookmark':
          if (!candidate.bookmarkedByBot) {
            try {
              await bookmarkHttp(PROFILE_DIR, tweetId);
              await Post.findByIdAndUpdate(candidate._id, { bookmarkedByBot: true });
              console.log(`  Bookmarked tweet ${tweetId}`);
            } catch (e) {
              console.log(`  Bookmark failed: ${(e as Error).message.slice(0, 80)}`);
            }
          }
          break;

        case 'reply':
          try {
            const result = await replyToTweetHttp(PROFILE_DIR, tweetText, tweetId);
            replyId = result.data.id;
            didReply = true;
            console.log('  Reply posted via HTTP');
          } catch (httpErr) {
            const msg = (httpErr as Error).message;
            if (msg.includes('226') || msg.includes('403') || msg.includes('automated')) {
              console.log(`  HTTP blocked, falling back to browser...`);
              const result = await replyToTweet(tweetText, tweetId);
              replyId = result.data.id;
              didReply = true;
              console.log('  Reply posted via browser fallback');
            } else if (msg.includes('344') || msg.toLowerCase().includes('daily limit') || msg.includes('429') || msg.toLowerCase().includes('rate limit')) {
              console.log('  Twitter daily limit reached — stopping batch');
              if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'twitter', 'info', 'rate_limit', 'Twitter daily tweet limit reached — will retry on next run');
              return 'daily_limit';
            } else {
              throw httpErr;
            }
          }
          break;
      }
    }

    // Update post status if we replied
    if (didReply && replyId) {
      const replyUrl = `https://x.com/i/status/${replyId}`;
      await Post.findByIdAndUpdate(candidate._id, {
        status: 'posted',
        postedAt: new Date(),
        editedReply: tweetText,
        replyUrl,
        postedByAccount: accountId,
      });

      // Update account health — success resets errorCount and boosts score
      if (CRON_USER_ID) {
        const acc = await BrowserCookie.findOne({ userId: CRON_USER_ID, platform: 'twitter' }).lean();
        if (acc) {
          const patch = buildSuccessPatch(acc as Parameters<typeof buildSuccessPatch>[0]);
          await BrowserCookie.updateOne({ userId: CRON_USER_ID, platform: 'twitter' }, patch.$set ? { $set: patch.$set } : patch);
        }
      }

      console.log(`Reply posted successfully: ${replyUrl}`);
      if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'twitter', 'success', 'post', `Reply posted to ${candidate.url}`, { replyUrl, score: candidate.aiRelevanceScore });
    } else {
      // Engaged but didn't reply — log as engagement-only
      console.log(`  Engaged with tweet (no reply this time): ${actions.join(', ')}`);
    }

    return didReply ? 'posted' : 'skip';
  } catch (err) {
    const msg = (err as Error).message;
    const isAuthError = msg.includes('ct0') || msg.includes('auth_token') || msg.includes('cookies') || msg.includes('No cookies') || msg.includes('session expired');
    const isAutomationBlock = msg.includes('automated activity') || msg.includes('226') || msg.toLowerCase().includes('automation');
    const isSuspended = msg.includes('suspended') || msg.includes('locked') || msg.includes('64') || msg.includes('326');
    const isDuplicate = msg.includes('Duplicate tweet') || msg.includes('187');

    // Helper: apply failure patch to health score
    const applyFailurePatch = async (backoffHours: number) => {
      if (!CRON_USER_ID) return;
      const acc = await BrowserCookie.findOne({ userId: CRON_USER_ID, platform: 'twitter' }).lean();
      if (acc) {
        const backoffUntil = new Date(Date.now() + backoffHours * 60 * 60 * 1000);
        const patch = buildFailurePatch(acc as Parameters<typeof buildFailurePatch>[0], backoffUntil);
        await BrowserCookie.updateOne({ userId: CRON_USER_ID, platform: 'twitter' }, { $set: patch.$set });
        console.log(`[Twitter] Health patch applied — errorCount+1, backoff ${backoffHours}h, score updated`);
      }
    };

    if (isAuthError) {
      console.error(`[Twitter] Auth error: ${msg}`);
      await applyFailurePatch(4);
      if (CRON_USER_ID) {
        await logActivity(CRON_USER_ID, 'twitter', 'error', 'auth_error', 'Twitter cookies expired — re-upload from dashboard');
        await notifyAuthError(CRON_USER_ID, 'twitter', 'Twitter cookies expired — re-upload from dashboard');
      }
      return 'auth_error';
    } else if (isAutomationBlock) {
      const attempts = (candidate.postAttempts || 0) + 1;
      await Post.findByIdAndUpdate(candidate._id, { $inc: { postAttempts: 1 } });
      await applyFailurePatch(attempts >= 3 ? 24 : 4);
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
      await applyFailurePatch(24);
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
      await applyFailurePatch(1);
      console.error(`[Twitter] Reply failed (attempt ${attempts}/3): ${msg}`);
      if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'twitter', 'error', 'post_failed', `Reply failed (attempt ${attempts}/3): ${msg}`);
      return 'error';
    }
  }
}

// ── Unified social phase: randomised action selection ─────────────────────────
// Each cron run picks 0–4 action types at random (weighted, without replacement),
// shuffles their order, then executes them with human-paced delays between each.
// Replaces the separate deterministic postPhase + single-action engagePhase.

type SocialAction = 'reply' | 'original_tweet' | 'like' | 'retweet' | 'bookmark' | 'follow' | 'unfollow' | 'browse';

/** Base weights — higher = more likely to be selected */
const BASE_ACTION_WEIGHTS: Record<SocialAction, number> = {
  reply:          30,
  original_tweet: 15,
  like:           25,
  retweet:        12,
  bookmark:       12,
  follow:         10,
  unfollow:        8,
  browse:         15,
};

/** How many distinct actions to run this invocation — 0–4, weighted */
const RUN_COUNT_DIST: { count: number; weight: number }[] = [
  { count: 0, weight: 15 },
  { count: 1, weight: 35 },
  { count: 2, weight: 25 },
  { count: 3, weight: 20 },
  { count: 4, weight:  5 },
];

function pickRunCount(): number {
  const total = RUN_COUNT_DIST.reduce((s, d) => s + d.weight, 0);
  let r = Math.random() * total;
  for (const { count, weight } of RUN_COUNT_DIST) {
    r -= weight;
    if (r <= 0) return count;
  }
  return 1;
}

/** Pick N distinct actions without replacement using weighted random, then shuffle */
function pickActions(weights: Partial<Record<SocialAction, number>>, n: number): SocialAction[] {
  const pool: [SocialAction, number][] = Object.entries(weights) as [SocialAction, number][];
  const selected: SocialAction[] = [];

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

  // Shuffle the selected actions — random execution order
  for (let i = selected.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [selected[i], selected[j]] = [selected[j], selected[i]];
  }

  return selected;
}

/** Random delay between actions: 30s–3min */
function betweenActionDelay(): Promise<void> {
  const ms = 30_000 + Math.random() * 150_000;
  console.log(`[Social] Waiting ${Math.round(ms / 1000)}s before next action...`);
  return new Promise(r => setTimeout(r, ms));
}

/** ms pause between micro-steps within one action (likes, bookmarks, etc.) */
function engageDelay(minS: number, maxS: number): Promise<void> {
  return new Promise(r => setTimeout(r, (minS + Math.random() * (maxS - minS)) * 1000));
}

const MAX_FOLLOWS_PER_DAY = 5;

// ── Individual action executors ───────────────────────────────────────────────

async function executeReplyAction(settings: any, accountId: string, dailyLimit: number, autoPostThreshold: number): Promise<void> {
  const todayCount = await getTodayReplyCount(accountId);
  if (todayCount >= dailyLimit) {
    console.log(`[Reply] Daily limit reached (${todayCount}/${dailyLimit}), skipping`);
    return;
  }

  const candidate = await Post.findOne({
    platform: 'twitter',
    status: 'evaluated',
    aiRelevanceScore: { $gte: autoPostThreshold },
    aiReply: { $exists: true, $ne: '' },
    postAttempts: { $not: { $gte: 3 } },
    ...(CRON_USER_ID && { userId: CRON_USER_ID }),
  }).sort({ aiRelevanceScore: -1, _id: -1 });

  if (!candidate) {
    console.log('[Reply] No candidates above auto-post threshold');
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'twitter', 'info', 'skip', 'No tweets above auto-post threshold');
    return;
  }

  await postOneTweet(candidate, settings, accountId);
}

async function executeOriginalTweetAction(settings: any, accountId: string): Promise<void> {
  const keywords: string[] = settings.twitterKeywords?.length
    ? settings.twitterKeywords
    : settings.keywords ?? [];

  if (keywords.length === 0) {
    console.log('[OriginalTweet] No keywords configured, skipping');
    return;
  }

  const keyword = keywords[Math.floor(Math.random() * keywords.length)];
  console.log(`[OriginalTweet] Generating tweet about: "${keyword}"`);

  const tweetText = await generateOriginalTweet(
    keyword,
    settings.companyName,
    settings.companyDescription,
    settings.twitterBrandMentionRate ?? 25,
  );

  if (!tweetText || tweetText.length < 5) {
    console.error('[OriginalTweet] Generated text failed safety check, skipping');
    return;
  }

  console.log(`[OriginalTweet] "${tweetText}"`);
  try {
    const result = await postTweetHttp(PROFILE_DIR, tweetText);
    const tweetId = result?.data?.create_tweet?.tweet_results?.result?.rest_id;
    const tweetUrl = tweetId ? `https://x.com/i/status/${tweetId}` : `https://x.com/${accountId}`;

    await Post.create({
      url: tweetUrl,
      platform: 'twitter',
      ...(CRON_USER_ID && { userId: CRON_USER_ID }),
      author: accountId,
      content: tweetText,
      keywordsMatched: [keyword],
      isOriginalTweet: true,
      status: 'posted',
      postedAt: new Date(),
      postedByAccount: accountId,
    });

    console.log(`[OriginalTweet] Posted: ${tweetUrl}`);
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'twitter', 'info', 'original_tweet', `Posted original tweet about "${keyword}"`, { keyword, tweetUrl });
  } catch (err) {
    console.error('[OriginalTweet] Failed:', (err as Error).message);
  }
}

async function executeLikeAction(): Promise<void> {
  const count = 2 + Math.floor(Math.random() * 3); // 2–4
  const candidates = await Post.find({
    platform: 'twitter',
    likedByBot: { $ne: true },
    aiRelevanceScore: { $gte: 30 },
    ...(CRON_USER_ID && { userId: CRON_USER_ID }),
  }).sort({ aiRelevanceScore: -1 }).limit(count * 2);

  if (candidates.length === 0) { console.log('[Like] No candidates found'); return; }

  const shuffled = candidates.sort(() => Math.random() - 0.5).slice(0, count);
  let liked = 0;

  for (const post of shuffled) {
    const tweetId = extractTweetId(post.url);
    if (!tweetId) continue;
    try {
      await likeTweetHttp(PROFILE_DIR, tweetId);
      await Post.findByIdAndUpdate(post._id, { likedByBot: true });
      liked++;
      console.log(`[Like] Liked tweet ${tweetId}`);
      if (liked < shuffled.length) await engageDelay(30, 90);
    } catch (err) {
      console.warn(`[Like] Failed for ${tweetId}:`, (err as Error).message);
    }
  }

  if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'twitter', 'info', 'engage', `Liked ${liked} tweet${liked !== 1 ? 's' : ''}`);
}

async function executeRetweetAction(): Promise<void> {
  const candidate = await Post.findOne({
    platform: 'twitter',
    retweetedByBot: { $ne: true },
    aiRelevanceScore: { $gte: 55 },
    ...(CRON_USER_ID && { userId: CRON_USER_ID }),
  }).sort({ aiRelevanceScore: -1 });

  if (!candidate) { console.log('[Retweet] No candidates found'); return; }

  const tweetId = extractTweetId(candidate.url);
  if (!tweetId) return;

  try {
    await retweetHttp(PROFILE_DIR, tweetId);
    await Post.findByIdAndUpdate(candidate._id, { retweetedByBot: true });
    console.log(`[Retweet] Retweeted tweet ${tweetId}`);
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'twitter', 'info', 'engage', `Retweeted ${candidate.url}`);
  } catch (err) {
    console.warn('[Retweet] Failed:', (err as Error).message);
  }
}

async function executeBookmarkAction(): Promise<void> {
  const count = 1 + Math.floor(Math.random() * 2); // 1–2
  const candidates = await Post.find({
    platform: 'twitter',
    bookmarkedByBot: { $ne: true },
    aiRelevanceScore: { $gte: 40 },
    ...(CRON_USER_ID && { userId: CRON_USER_ID }),
  }).sort({ aiRelevanceScore: -1 }).limit(count);

  let bookmarked = 0;
  for (const post of candidates) {
    const tweetId = extractTweetId(post.url);
    if (!tweetId) continue;
    try {
      await bookmarkHttp(PROFILE_DIR, tweetId);
      await Post.findByIdAndUpdate(post._id, { bookmarkedByBot: true });
      bookmarked++;
      console.log(`[Bookmark] Bookmarked tweet ${tweetId}`);
      if (bookmarked < candidates.length) await engageDelay(20, 60);
    } catch (err) {
      console.warn(`[Bookmark] Failed for ${tweetId}:`, (err as Error).message);
    }
  }

  if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'twitter', 'info', 'engage', `Bookmarked ${bookmarked} tweet${bookmarked !== 1 ? 's' : ''}`);
}

async function executeFollowAction(): Promise<void> {
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const followsToday = await TwitterFollowed.countDocuments({ userId: CRON_USER_ID, followedAt: { $gte: todayStart } });
  if (followsToday >= MAX_FOLLOWS_PER_DAY) {
    console.log(`[Follow] Daily cap reached (${followsToday}/${MAX_FOLLOWS_PER_DAY})`);
    return;
  }

  const alreadyFollowing = await TwitterFollowed.distinct('targetHandle', { userId: CRON_USER_ID, isFollowing: true });
  const candidate = await Post.findOne({
    platform: 'twitter',
    author: { $exists: true, $ne: '', $nin: alreadyFollowing },
    aiRelevanceScore: { $gte: 50 },
    ...(CRON_USER_ID && { userId: CRON_USER_ID }),
  }).sort({ aiRelevanceScore: -1 });

  if (!candidate?.author) { console.log('[Follow] No candidate found'); return; }

  const handle = (candidate.author as string).replace(/^@/, '');
  if (!handle) return;

  try {
    await followUserHttp(PROFILE_DIR, handle);
    await TwitterFollowed.findOneAndUpdate(
      { userId: CRON_USER_ID, targetHandle: handle },
      { userId: CRON_USER_ID, targetHandle: handle, followedAt: new Date(), isFollowing: true, unfollowedAt: null },
      { upsert: true, new: true },
    );
    console.log(`[Follow] Followed @${handle}`);
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'twitter', 'info', 'engage', `Followed @${handle}`);
  } catch (err) {
    console.warn(`[Follow] @${handle} failed:`, (err as Error).message);
  }
}

async function executeUnfollowAction(): Promise<void> {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const target = await TwitterFollowed.findOne({
    userId: CRON_USER_ID,
    isFollowing: true,
    followedAt: { $lt: threeDaysAgo },
  }).sort({ followedAt: 1 });

  if (!target) { console.log('[Unfollow] No candidates (follow someone first, or wait 3+ days)'); return; }

  try {
    await unfollowUserHttp(PROFILE_DIR, target.targetHandle);
    await TwitterFollowed.findByIdAndUpdate(target._id, { isFollowing: false, unfollowedAt: new Date() });
    console.log(`[Unfollow] Unfollowed @${target.targetHandle}`);
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'twitter', 'info', 'engage', `Unfollowed @${target.targetHandle}`);
  } catch (err) {
    console.warn(`[Unfollow] @${target.targetHandle} failed:`, (err as Error).message);
  }
}

async function executeBrowseAction(): Promise<void> {
  const browseMs = 45_000 + Math.random() * 45_000;
  console.log(`[Browse] Scrolling home feed for ${Math.round(browseMs / 1000)}s`);
  await scrollHomeFeed(browseMs);
  await closeBrowser();
  if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'twitter', 'info', 'engage', `Browsed home feed for ${Math.round(browseMs / 1000)}s`);
}

async function socialPhase(settings: any, accountId: string, dailyLimit: number, autoPostThreshold: number): Promise<void> {
  // Build dynamic weights — reduce or exclude actions based on current state
  const weights: Partial<Record<SocialAction, number>> = { ...BASE_ACTION_WEIGHTS };

  // Reduce reply weight as we approach daily limit; exclude if at limit
  const todayCount = await getTodayReplyCount(accountId);
  if (todayCount >= dailyLimit) {
    delete weights.reply;
    console.log(`[Social] Reply limit reached (${todayCount}/${dailyLimit}) — excluded`);
  } else {
    const fraction = todayCount / dailyLimit;
    weights.reply = Math.max(5, Math.round(BASE_ACTION_WEIGHTS.reply * (1 - fraction * 0.7)));
  }

  // Exclude reply if within cooldown window (with jitter to avoid mechanical patterns)
  if (weights.reply !== undefined && !process.env.CRON_MANUAL) {
    const MIN_COMMENT_GAP_MS = jitterCooldown(settings.twitterCooldownMinutes ?? 60);
    const lastPosted = await Post.findOne({
      platform: 'twitter', status: 'posted', isOriginalTweet: { $ne: true }, postedAt: { $exists: true },
      ...(CRON_USER_ID && { userId: CRON_USER_ID }),
    }).sort({ postedAt: -1 }).select('postedAt');
    if (lastPosted?.postedAt) {
      const elapsed = Date.now() - new Date(lastPosted.postedAt).getTime();
      if (elapsed < MIN_COMMENT_GAP_MS) {
        const remainMin = Math.ceil((MIN_COMMENT_GAP_MS - elapsed) / 60000);
        console.log(`[Social] Reply cooldown: ${remainMin}m remaining — excluded`);
        delete weights.reply;
      }
    }
  }

  // original_tweet: exclude if disabled or daily limit reached
  if (!settings.twitterOriginalTweetsEnabled) {
    delete weights.original_tweet;
  } else {
    const originalDailyLimit = settings.twitterOriginalTweetDailyLimit ?? 2;
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayOriginalCount = await Post.countDocuments({
      platform: 'twitter', isOriginalTweet: true, postedAt: { $gte: todayStart },
      ...(CRON_USER_ID && { userId: CRON_USER_ID }),
    });
    if (todayOriginalCount >= originalDailyLimit) {
      delete weights.original_tweet;
      console.log(`[Social] Original tweet limit reached (${todayOriginalCount}/${originalDailyLimit}) — excluded`);
    }
  }

  // follow: exclude if daily cap reached
  const todayStartForFollow = new Date(); todayStartForFollow.setHours(0, 0, 0, 0);
  const followsToday = await TwitterFollowed.countDocuments({ userId: CRON_USER_ID, followedAt: { $gte: todayStartForFollow } });
  if (followsToday >= MAX_FOLLOWS_PER_DAY) {
    delete weights.follow;
    console.log(`[Social] Follow cap reached (${followsToday}/${MAX_FOLLOWS_PER_DAY}) — excluded`);
  }

  const n = pickRunCount();
  if (n === 0) {
    console.log('[Social] 0-action run — idle cycle (randomised to reduce detection risk)');
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'twitter', 'info', 'social', 'Idle cron run');
    return;
  }

  const actions = pickActions(weights, n);
  if (actions.length === 0) {
    console.log('[Social] No eligible actions after weight filtering');
    return;
  }

  console.log(`[Social] Plan: ${actions.join(' → ')}`);
  if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'twitter', 'info', 'social', `Run plan: ${actions.join(' → ')}`);

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    console.log(`\n[Social] (${i + 1}/${actions.length}) ${action}`);

    switch (action) {
      case 'reply':          await executeReplyAction(settings, accountId, dailyLimit, autoPostThreshold); break;
      case 'original_tweet': await executeOriginalTweetAction(settings, accountId); break;
      case 'like':           await executeLikeAction(); break;
      case 'retweet':        await executeRetweetAction(); break;
      case 'bookmark':       await executeBookmarkAction(); break;
      case 'follow':         await executeFollowAction(); break;
      case 'unfollow':       await executeUnfollowAction(); break;
      case 'browse':         await executeBrowseAction(); break;
    }

    if (i < actions.length - 1) await betweenActionDelay();
  }

  // Close browser if it was opened (browse or posting fallback)
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

  // Random skip — 15% chance to skip this run (mimics human inconsistency)
  if (!process.env.CRON_MANUAL && shouldRandomlySkip()) {
    console.log('Random skip triggered — skipping this run (human-like inconsistency)');
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
  // Apply warmup limit for new accounts (ramp up over 30 days)
  const configuredLimit: number = settings.twitterDailyLimit ?? DEFAULT_DAILY_LIMIT;
  const accountAddedAt = getAccountAge(settings, 'twitter');
  const dailyLimit = getWarmupLimit(configuredLimit, accountAddedAt);
  if (dailyLimit < configuredLimit) {
    console.log(`Warmup active: daily limit ${dailyLimit} (configured: ${configuredLimit})`);
  }
  const autoPostThreshold: number = settings.twitterAutoPostThreshold ?? DEFAULT_AUTO_POST_THRESHOLD;

  let accountId = getCurrentAccountId();

  const todayCount = await getTodayReplyCount(accountId);
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

  if (MODE === 'post' || MODE === 'full' || MODE === 'engage') {
    await socialPhase(settings, accountId, dailyLimit, autoPostThreshold);
  }

  console.log(`[${new Date().toISOString()}] Twitter Cron: complete`);
  if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'twitter', 'info', 'cron_end', 'Twitter cron completed');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
