/**
 * Twitter/X Auto-Reply Cron Script
 *
 * Searches Twitter for keyword-matching tweets, evaluates them with AI,
 * and auto-replies to high-scoring tweets.
 *
 * Schedule: every 15 minutes via node-cron in server.js (auto-scheduled)
 *   Also respects Mon-Fri 9AM-6PM IST schedule guard
 *   Replies to 1 newest post per run, with 15-min cooldown between comments
 *
 * Setup: set TWITTER_AUTH_TOKEN and TWITTER_CT0 in .env.local
 *   Run: npx tsx scripts/twitter-verify.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { connectDB } from '../src/lib/mongodb';
import { evaluatePost, askOpenClaw } from '../src/lib/openclaw';
import {
  searchTweets,
  replyToTweet,
  likeTweet,
  extractTweetId,
  isTwitterConfigured,
  verifyCredentials,
} from '../src/lib/twitter';
import { isWithinSchedule } from '../src/lib/schedule';
import Post from '../src/models/Post';
import Settings from '../src/models/Settings';

const DEFAULT_KEYWORDS = ['backlinks', 'guest posting', 'link building', 'seo tools', 'website ranking'];
const DEFAULT_DAILY_LIMIT = 10;
const DEFAULT_AUTO_POST_THRESHOLD = 70;
const MIN_ENGAGEMENT_SCORE = 1; // minimum likes + retweets + replies to consider a tweet worth engaging with

// --- Read current Twitter account identity ---
function getExistingAccountData(): Record<string, string> {
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

// --- Count replies posted today for the current account ---
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
  if (accountId) {
    query.postedByAccount = accountId;
  }

  return Post.countDocuments(query);
}

// --- Generate a unique, natural tweet reply mentioning the brand ---
async function generateTweetReply(
  postContent: string,
  companyName: string,
  companyDescription: string
): Promise<string> {
  const randomSeed = Math.floor(Math.random() * 1000);
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
- Mention "${companyName}" once, naturally woven into the reply (e.g. "been using SerpBays for this", "SerpBays has decent options for this", "tried SerpBays for niche edits and it's solid")
- No URLs, no hashtags, no emojis unless it fits naturally
- Vary tone: sometimes enthusiastic, sometimes matter-of-fact, sometimes giving a tip
- Never start with "Hey", "Hi", "Great tweet", or "Absolutely"
- Never use marketing phrases like "game-changer", "seamless", "leverage", "robust"
- Random variety seed: ${randomSeed}

Write the reply now:`;

  try {
    const raw = await askOpenClaw(prompt);
    let reply = raw;

    // Extract text if OpenClaw returned JSON wrapper
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

    // Clean up the response
    reply = reply
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/^(Reply|Response|Here'?s?\s*(the|my|a)?\s*(reply|response)?:?\s*)/i, '')
      .replace(/\n/g, ' ')
      // Strip any URLs that slipped through
      .replace(/https?:\/\/\S+/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    // Twitter 280 char limit with safety buffer
    if (reply.length > 260) {
      reply = reply.slice(0, 257) + '...';
    }

    return reply;
  } catch (err) {
    console.error('Failed to generate tweet reply:', (err as Error).message);
    return '';
  }
}

async function main() {
  console.log(`[${new Date().toISOString()}] Twitter Cron: starting`);

  // Step 1: Check credentials
  if (!isTwitterConfigured()) {
    console.error('Twitter credentials not configured. Set TWITTER_AUTH_TOKEN and TWITTER_CT0 in .env.local');
    console.error('Run: npx tsx scripts/twitter-verify.ts');
    process.exit(1);
  }

  await connectDB();

  // Step 2: Load settings
  const settings = await Settings.findOne();
  if (!settings) {
    console.error('No settings configured, exiting');
    process.exit(0);
  }

  // Step 2b: Schedule guard (uses per-platform schedule if configured)
  const schedule = settings.platformSchedules?.get('twitter');
  if (!isWithinSchedule(schedule)) {
    console.log('Outside scheduled hours, exiting');
    process.exit(0);
  }

  const keywords: string[] = settings.twitterKeywords?.length
    ? settings.twitterKeywords
    : (settings.keywords?.length ? settings.keywords : DEFAULT_KEYWORDS);
  const dailyLimit: number = settings.twitterDailyLimit ?? DEFAULT_DAILY_LIMIT;
  const autoPostThreshold: number = settings.twitterAutoPostThreshold ?? DEFAULT_AUTO_POST_THRESHOLD;

  // Step 3b: Read current account identity
  let accountId = getCurrentAccountId();

  // Step 4: Check daily limit (per-account)
  const todayCount = await getTodayReplyCount(accountId);
  if (todayCount >= dailyLimit) {
    console.log(`Daily limit reached: ${todayCount}/${dailyLimit} replies posted today${accountId ? ` (account: ${accountId})` : ''}`);
    process.exit(0);
  }
  console.log(`Replies posted today: ${todayCount}/${dailyLimit}${accountId ? ` (account: ${accountId})` : ''}`);

  // Step 4b: 15-minute cooldown — skip if last Twitter post was < 15 min ago
  const MIN_COMMENT_GAP_MS = 15 * 60 * 1000; // 15 minutes
  const lastPosted = await Post.findOne({ platform: 'twitter', status: 'posted', postedAt: { $exists: true } })
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

  // Step 5: Verify credentials are still valid
  try {
    const user = await verifyCredentials();
    console.log(`Twitter authenticated as: @${user.username} (${user.name})`);
    // Update account ID from live verification
    if (user.username) accountId = `tw_${user.username}`;
    // Persist account identity, preserving existing data when scraping returns empty
    try {
      const existing = getExistingAccountData();
      writeFileSync(
        join(process.cwd(), '.twitter-account'),
        JSON.stringify({
          accountId,
          username: user.username || existing.username || '',
          name: user.name || existing.name || '',
          ts: new Date().toISOString(),
        }),
        'utf8'
      );
    } catch {}
  } catch (err) {
    console.error('Twitter credentials invalid:', (err as Error).message);
    console.error('Run: npx tsx scripts/twitter-verify.ts to reconfigure');
    process.exit(1);
  }

  // Step 6: Search tweets for each keyword
  let totalFound = 0;
  let newPostCount = 0;

  for (const keyword of keywords) {
    try {
      console.log(`Searching tweets for: "${keyword}"`);
      const tweets = await searchTweets(keyword, 25);
      totalFound += tweets.length;

      for (const tweet of tweets) {
        if (!tweet.text || tweet.text.length < 15) continue;

        // Filter for high-engagement tweets — skip low-quality posts with no traction
        const engagementScore = tweet.likeCount + tweet.retweetCount + tweet.replyCount;
        if (engagementScore < MIN_ENGAGEMENT_SCORE) {
          continue;
        }

        const exists = await Post.findOne({ url: tweet.url });
        if (!exists) {
          await Post.create({
            url: tweet.url,
            platform: 'twitter',
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
          console.log(`  Saved tweet ${tweet.id} (engagement: ${engagementScore} — ${tweet.likeCount} likes, ${tweet.retweetCount} RTs, ${tweet.replyCount} replies)`);
        }
      }

      // Delay between keyword searches to respect rate limits
      await new Promise((r) => setTimeout(r, 3000));
    } catch (err) {
      console.error(`Error searching tweets for "${keyword}":`, (err as Error).message);
    }
  }

  console.log(`Found ${totalFound} tweets, saved ${newPostCount} new posts to DB`);

  // Step 7: Evaluate new Twitter posts
  const unevaluatedPosts = await Post.find({
    platform: 'twitter',
    status: 'new',
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

  // Step 8: Auto-reply to ONE newest high-scoring tweet per run
  let recheck = await getTodayReplyCount(accountId);
  if (recheck >= dailyLimit) {
    console.log('Daily limit reached after evaluation, skipping auto-reply');
    process.exit(0);
  }

  // Pick the newest evaluated tweet above threshold (1 per run)
  const candidate = await Post.findOne({
    platform: 'twitter',
    status: 'evaluated',
    aiRelevanceScore: { $gte: autoPostThreshold },
    aiReply: { $exists: true, $ne: '' },
  }).sort({ _id: -1 }); // newest first

  if (!candidate) {
    console.log('No tweets above auto-post threshold, skipping');
  } else {
    let replyText = candidate.editedReply || '';

    if (!replyText) {
      replyText = await generateTweetReply(
        candidate.content,
        settings.companyName,
        settings.companyDescription
      );
    }

    // Safety check — never post errors or empty text
    if (!replyText || replyText.length < 5 || /error|failed|exception|undefined|null/i.test(replyText)) {
      console.error('Generated reply failed safety check, skipping:', replyText?.slice(0, 100));
    } else {
      const tweetText = replyText.length > 280 ? replyText.slice(0, 277) + '...' : replyText;
      const tweetId = extractTweetId(candidate.url);

      const engagement = (candidate.likeCount || 0) + (candidate.retweetCount || 0) + (candidate.replyCount || 0);
      console.log(`Auto-replying to ${candidate.url} (score: ${candidate.aiRelevanceScore}, engagement: ${engagement})`);
      console.log(`Reply: "${tweetText}"`);

      if (!tweetId) {
        console.error('No tweet ID found in URL, cannot reply — skipping');
      } else {
        try {
          // Like the tweet first before commenting — builds rapport and looks natural
          if (!candidate.likedByBot) {
            try {
              await likeTweet(tweetId);
              await Post.findByIdAndUpdate(candidate._id, { likedByBot: true });
              console.log(`  Liked tweet ${tweetId}`);
              // Small delay between like and reply to look human
              await new Promise((r) => setTimeout(r, 2000 + Math.random() * 2000));
            } catch (likeErr) {
              console.warn(`  Failed to like tweet ${tweetId} (continuing with reply):`, (likeErr as Error).message);
            }
          }

          const result = await replyToTweet(tweetText, tweetId);
          const replyUrl = `https://x.com/i/status/${result.data.id}`;

          await Post.findByIdAndUpdate(candidate._id, {
            status: 'posted',
            postedAt: new Date(),
            editedReply: tweetText,
            replyUrl,
            postedByAccount: accountId,
          });

          console.log(`Reply posted successfully: ${replyUrl}`);
        } catch (err) {
          console.error('Failed to post reply, will retry next run:', (err as Error).message);
        }
      }
    }
  }

  console.log(`[${new Date().toISOString()}] Twitter Cron: complete`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
