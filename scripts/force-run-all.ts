/**
 * Force-run script: Twitter + Facebook reply to ALL evaluated posts up to daily limit.
 * Bypasses: schedule guard, AI relevance score threshold.
 * Run: npx tsx scripts/force-run-all.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { connectDB } from '../src/lib/mongodb';
import { evaluatePost, askOpenClaw } from '../src/lib/openclaw';
import {
  searchTweets,
  replyToTweet,
  extractTweetId,
  isTwitterConfigured,
  verifyCredentials,
} from '../src/lib/twitter';
import {
  ensureFacebookLoggedIn,
  getJoinedGroups,
  scrapeGroupPosts,
  postComment,
  closeBrowser,
} from '../src/lib/facebook';
import { writeFileSync } from 'fs';
import { join } from 'path';
import Post from '../src/models/Post';
import Settings from '../src/models/Settings';

const DEFAULT_TWITTER_DAILY_LIMIT = 10;
const DEFAULT_FB_DAILY_LIMIT = 5;

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getTwitterTodayCount(): Promise<number> {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60000;
  const istNow = new Date(now.getTime() + istOffset);
  const startOfDay = new Date(istNow);
  startOfDay.setHours(0, 0, 0, 0);
  const startOfDayUTC = new Date(startOfDay.getTime() - istOffset);
  return Post.countDocuments({ platform: 'twitter', status: 'posted', postedAt: { $gte: startOfDayUTC } });
}

async function getFBTodayCount(): Promise<number> {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60000;
  const istNow = new Date(now.getTime() + istOffset);
  const startOfDay = new Date(istNow);
  startOfDay.setHours(0, 0, 0, 0);
  const startOfDayUTC = new Date(startOfDay.getTime() - istOffset);
  return Post.countDocuments({ platform: 'facebook', status: 'posted', postedAt: { $gte: startOfDayUTC } });
}

async function generateTweetReply(postContent: string, companyName: string, companyDescription: string): Promise<string> {
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
- Mention "${companyName}" once, naturally woven into the reply
- No URLs, no hashtags, no emojis unless it fits naturally
- Vary tone: sometimes enthusiastic, sometimes matter-of-fact, sometimes giving a tip
- Never start with "Hey", "Hi", "Great tweet", or "Absolutely"
- Never use marketing phrases like "game-changer", "seamless", "leverage", "robust"
- Random variety seed: ${randomSeed}

Write the reply now:`;

  try {
    const raw = await askOpenClaw(prompt);
    let reply = raw;
    if (reply.trimStart().startsWith('{')) {
      try {
        const parsed = JSON.parse(reply);
        reply = parsed?.payloads?.[0]?.text || parsed?.result?.content || parsed?.content || parsed?.message || '';
      } catch {
        const m = reply.match(/"text"\s*:\s*"([^"]+)"/);
        if (m) reply = m[1];
      }
    }
    reply = reply
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/^(Reply|Response|Here'?s?\s*(the|my|a)?\s*(reply|response)?:?\s*)/i, '')
      .replace(/\n/g, ' ')
      .replace(/https?:\/\/\S+/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (reply.length > 260) reply = reply.slice(0, 257) + '...';
    return reply;
  } catch (err) {
    console.error('Failed to generate tweet reply:', (err as Error).message);
    return '';
  }
}

async function generateFBComment(postContent: string, companyName: string, companyDescription: string): Promise<string> {
  const randomSeed = Math.floor(Math.random() * 1000);
  const styles = [
    'share personal experience using serpbays for backlinks',
    'casually recommend serpbays guest posting to solve the poster\'s problem',
    'mention you found serpbays helpful for link building in a similar situation',
    'ask a follow-up question then briefly mention serpbays niche edits or guest posts',
    'give a tip and suggest serpbays as a resource for backlinks or guest post opportunities',
  ];
  const style = styles[randomSeed % styles.length];
  const prompt = `You are a real person in a Facebook SEO/marketing group leaving a helpful comment.

POST:
"""
${postContent.slice(0, 500)}
"""

YOUR TASK: Write 1-3 sentence comment that ${style}.

RULES:
- Write ONLY the comment text, nothing else
- Sound like a genuine group member sharing a real recommendation from experience
- Mention "${companyName}" naturally — tie it specifically to backlinks, guest posting, or link building
- NEVER include website URLs or domains — just the brand name
- Vary your opening — do NOT always start with "Hey" or "I"
- Use natural, conversational language — no buzzwords, no excessive emojis, no hashtags
- Do NOT write generic praise — connect the mention to the post topic
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
        comment = parsed?.payloads?.[0]?.text || parsed?.result?.content || parsed?.content || parsed?.message || '';
      } catch {
        const m = comment.match(/"text"\s*:\s*"([^"]+)"/);
        if (m) comment = m[1];
      }
    }
    comment = comment
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/^(Comment|Reply|Response|Here'?s?\s*(the|my|a)?\s*(comment|reply)?:?\s*)/i, '')
      .replace(/\n/g, ' ')
      .replace(/https?:\/\/\S+/gi, '')
      .replace(new RegExp(companyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\.com', 'gi'), companyName)
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (comment.length > 300) comment = comment.slice(0, 297) + '...';
    return comment;
  } catch (err) {
    console.error('Failed to generate FB comment:', (err as Error).message);
    return '';
  }
}

// ─── Twitter ──────────────────────────────────────────────────────────────────

async function runTwitter(settings: any) {
  console.log('\n===== TWITTER =====');

  if (!isTwitterConfigured()) {
    console.error('Twitter credentials not configured. Set TWITTER_AUTH_TOKEN and TWITTER_CT0 in .env.local');
    return;
  }

  const keywords: string[] = settings.twitterKeywords?.length
    ? settings.twitterKeywords
    : (settings.keywords?.length ? settings.keywords : []);
  if (keywords.length === 0) {
    console.log('No Twitter keywords configured, skipping Twitter.');
    return;
  }
  const dailyLimit: number = settings.twitterDailyLimit ?? DEFAULT_TWITTER_DAILY_LIMIT;

  let todayCount = await getTwitterTodayCount();
  console.log(`Replies posted today: ${todayCount}/${dailyLimit}`);
  if (todayCount >= dailyLimit) {
    console.log('Twitter daily limit already reached, skipping');
    return;
  }

  // Verify credentials
  try {
    const user = await verifyCredentials();
    console.log(`Authenticated as: @${user.username} (${user.name})`);
  } catch (err) {
    console.error('Twitter credentials invalid:', (err as Error).message);
    return;
  }

  // Search tweets
  let totalFound = 0, newPostCount = 0;
  for (const keyword of keywords) {
    try {
      console.log(`Searching tweets for: "${keyword}"`);
      const tweets = await searchTweets(keyword, 25);
      totalFound += tweets.length;
      for (const tweet of tweets) {
        if (!tweet.text || tweet.text.length < 15) continue;
        const exists = await Post.findOne({ url: tweet.url });
        if (!exists) {
          await Post.create({
            url: tweet.url,
            platform: 'twitter',
            author: tweet.authorHandle || tweet.author,
            content: tweet.text.slice(0, 2000),
            keywordsMatched: [keyword],
            status: 'new',
          });
          newPostCount++;
        }
      }
      await new Promise((r) => setTimeout(r, 3000));
    } catch (err) {
      console.error(`Error searching tweets for "${keyword}":`, (err as Error).message);
    }
  }
  console.log(`Found ${totalFound} tweets, saved ${newPostCount} new posts`);

  // Evaluate new posts
  const unevaluated = await Post.find({ platform: 'twitter', status: 'new' }).limit(10);
  console.log(`Evaluating ${unevaluated.length} new Twitter posts`);
  for (const post of unevaluated) {
    try {
      await Post.findByIdAndUpdate(post._id, { status: 'evaluating' });
      const evaluation = await evaluatePost(post.content, settings.companyName, settings.companyDescription, settings.promptTemplate || undefined);
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

  // Auto-reply to ALL evaluated posts (NO score threshold) up to daily limit
  todayCount = await getTwitterTodayCount();
  if (todayCount >= dailyLimit) {
    console.log('Daily limit reached after evaluation, skipping replies');
    return;
  }

  const remaining = dailyLimit - todayCount;
  // No score filter — reply to all evaluated posts
  const candidates = await Post.find({
    platform: 'twitter',
    status: 'evaluated',
    aiReply: { $exists: true, $ne: '' },
  }).sort({ aiRelevanceScore: -1 }).limit(remaining);

  console.log(`Found ${candidates.length} evaluated Twitter posts to reply to`);

  for (const candidate of candidates) {
    if (todayCount >= dailyLimit) {
      console.log(`Daily limit reached (${todayCount}/${dailyLimit}), stopping`);
      break;
    }

    let replyText = candidate.editedReply || '';
    if (!replyText) {
      replyText = await generateTweetReply(candidate.content, settings.companyName, settings.companyDescription);
    }

    if (!replyText || replyText.length < 5 || /error|failed|exception|undefined|null/i.test(replyText)) {
      console.error('Reply failed safety check, skipping:', replyText?.slice(0, 100));
      continue;
    }

    const tweetText = replyText.length > 280 ? replyText.slice(0, 277) + '...' : replyText;
    const tweetId = extractTweetId(candidate.url);

    if (!tweetId) {
      console.error('No tweet ID found in URL, skipping:', candidate.url);
      continue;
    }

    console.log(`Replying to ${candidate.url} (score: ${candidate.aiRelevanceScore ?? 'N/A'})`);
    console.log(`Reply: "${tweetText}"`);

    try {
      const result = await replyToTweet(tweetText, tweetId);
      const replyUrl = `https://x.com/i/status/${result.data.id}`;
      await Post.findByIdAndUpdate(candidate._id, {
        status: 'posted',
        postedAt: new Date(),
        editedReply: tweetText,
        replyUrl,
      });
      console.log(`Posted: ${replyUrl}`);
      todayCount++;
      await new Promise((r) => setTimeout(r, 5000));
    } catch (err) {
      console.error('Failed to post reply:', (err as Error).message);
    }
  }

  console.log(`Twitter done. Total replies today: ${todayCount}/${dailyLimit}`);
}

// ─── Facebook ────────────────────────────────────────────────────────────────

async function runFacebook(settings: any) {
  console.log('\n===== FACEBOOK =====');

  const keywords: string[] = settings.facebookKeywords?.length
    ? settings.facebookKeywords
    : (settings.keywords?.length ? settings.keywords : []);
  if (keywords.length === 0) {
    console.log('No Facebook keywords configured, skipping Facebook.');
    return;
  }
  const dailyLimit: number = settings.facebookDailyLimit ?? DEFAULT_FB_DAILY_LIMIT;

  let todayCount = await getFBTodayCount();
  console.log(`Comments posted today: ${todayCount}/${dailyLimit}`);
  if (todayCount >= dailyLimit) {
    console.log('Facebook daily limit already reached, skipping');
    return;
  }

  // Ensure logged in
  const loggedIn = await ensureFacebookLoggedIn();
  if (!loggedIn) {
    try {
      writeFileSync(join(process.cwd(), '.fb-profile', '.verified'), JSON.stringify({ loggedIn: false, ts: new Date().toISOString(), message: 'Session expired — cron detected not logged in' }));
    } catch {}
    console.error('Not logged in to Facebook. Run: npx tsx scripts/fb-login.ts');
    return;
  }
  console.log('Facebook login confirmed');

  // Get groups
  let groupUrls: string[] = settings.facebookGroups?.length
    ? settings.facebookGroups
    : await getJoinedGroups();

  if (groupUrls.length === 0) {
    console.log('No Facebook groups to scrape');
    return;
  }
  console.log(`Scraping ${groupUrls.length} groups`);

  // Scrape posts
  let allPosts: Array<{ url: string; author: string; content: string; groupUrl: string }> = [];
  for (const groupUrl of groupUrls) {
    try {
      const posts = await scrapeGroupPosts(groupUrl, keywords);
      allPosts = allPosts.concat(posts);
      console.log(`  ${groupUrl}: found ${posts.length} keyword-matching posts`);
    } catch (err) {
      console.error(`  Error scraping ${groupUrl}:`, (err as Error).message);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.log(`Total posts found: ${allPosts.length}`);

  // Save new posts to DB
  let newPostCount = 0;
  for (const post of allPosts) {
    const exists = await Post.findOne({ url: post.url });
    if (!exists) {
      await Post.create({
        url: post.url,
        platform: 'facebook',
        author: post.author,
        content: post.content,
        keywordsMatched: keywords.filter((kw) => post.content.toLowerCase().includes(kw.toLowerCase())),
        status: 'new',
      });
      newPostCount++;
    }
  }
  console.log(`Saved ${newPostCount} new posts to DB`);

  // Evaluate unevaluated Facebook posts
  const unevaluated = await Post.find({ platform: 'facebook', status: 'new' }).limit(10);
  console.log(`Evaluating ${unevaluated.length} new Facebook posts`);
  for (const post of unevaluated) {
    try {
      await Post.findByIdAndUpdate(post._id, { status: 'evaluating' });
      const evaluation = await evaluatePost(post.content, settings.companyName, settings.companyDescription, settings.promptTemplate || undefined);
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

  // Auto-post comments on ALL evaluated posts (NO score threshold) up to daily limit
  todayCount = await getFBTodayCount();
  if (todayCount >= dailyLimit) {
    console.log('Daily limit reached after evaluation, skipping comments');
    return;
  }

  const remaining = dailyLimit - todayCount;
  // No score filter — post on all evaluated posts
  const candidates = await Post.find({
    platform: 'facebook',
    status: 'evaluated',
    aiReply: { $exists: true, $ne: '' },
  }).sort({ aiRelevanceScore: -1 }).limit(remaining);

  console.log(`Found ${candidates.length} evaluated Facebook posts to comment on`);

  for (const candidate of candidates) {
    if (todayCount >= dailyLimit) {
      console.log(`Daily limit reached (${todayCount}/${dailyLimit}), stopping`);
      break;
    }

    let replyText = candidate.editedReply || '';
    if (!replyText) {
      replyText = await generateFBComment(candidate.content, settings.companyName, settings.companyDescription);
    }

    if (!replyText || replyText.length < 5 || /error|failed|exception|undefined|null/i.test(replyText)) {
      console.error('Comment failed safety check, skipping:', replyText?.slice(0, 100));
      continue;
    }

    console.log(`Commenting on ${candidate.url} (score: ${candidate.aiRelevanceScore ?? 'N/A'})`);
    console.log(`Comment: "${replyText}"`);

    const success = await postComment(candidate.url, replyText);
    if (success) {
      await Post.findByIdAndUpdate(candidate._id, {
        status: 'posted',
        postedAt: new Date(),
        editedReply: replyText,
      });
      console.log('Comment posted successfully');
      todayCount++;
    } else {
      console.error('Failed to post comment');
    }

    // Delay between posts
    await new Promise((r) => setTimeout(r, 5000));
  }

  console.log(`Facebook done. Total comments today: ${todayCount}/${dailyLimit}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[${new Date().toISOString()}] Force-run ALL: starting (no schedule guard, no score threshold)`);

  await connectDB();

  const settings = await Settings.findOne();
  if (!settings) {
    console.error('No settings configured, exiting');
    process.exit(1);
  }

  console.log(`Settings: company="${settings.companyName}", twitterLimit=${settings.twitterDailyLimit ?? DEFAULT_TWITTER_DAILY_LIMIT}, fbLimit=${settings.facebookDailyLimit ?? DEFAULT_FB_DAILY_LIMIT}`);

  await runTwitter(settings);
  await runFacebook(settings);

  console.log(`\n[${new Date().toISOString()}] Force-run ALL: complete`);
  await closeBrowser().catch(() => {});
  process.exit(0);
}

main().catch(async (err) => {
  console.error('Fatal error:', err);
  await closeBrowser().catch(() => {});
  process.exit(1);
});
