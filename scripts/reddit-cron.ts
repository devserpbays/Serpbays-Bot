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

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { connectDB } from '../src/lib/mongodb';
import { evaluatePost, askOpenClaw } from '../src/lib/openclaw';
import { cronStart, cronFinish } from '../src/lib/cronState';
import {
  ensureRedditLoggedIn,
  scrapeProfileIdentity,
  scrapeSubredditPosts,
  scrapeRedditSearch,
  postRedditComment,
  upvoteRedditPost,
  closeBrowser,
} from '../src/lib/reddit';
import { isWithinSchedule } from '../src/lib/schedule';
import Post from '../src/models/Post';
import Settings from '../src/models/Settings';

const DEFAULT_KEYWORDS = ['Serpbays', 'guest post', 'backlinks', 'backlink', 'guest posting', 'link building', 'seo'];
const DEFAULT_DAILY_LIMIT = 5;
const DEFAULT_AUTO_POST_THRESHOLD = 70;

// --- Read current Reddit account identity ---
function getVerifiedData(): Record<string, string> {
  try {
    const raw = readFileSync(join(process.cwd(), '.reddit-profile', '.verified'), 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function getCurrentAccountId(): string {
  return getVerifiedData().accountId || '';
}

// --- Count comments posted today for the current account ---
async function getTodayCommentCount(accountId: string): Promise<number> {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60000;
  const istNow = new Date(now.getTime() + istOffset);
  const startOfDay = new Date(istNow);
  startOfDay.setHours(0, 0, 0, 0);
  const startOfDayUTC = new Date(startOfDay.getTime() - istOffset);

  const query: Record<string, unknown> = {
    platform: 'reddit',
    status: 'posted',
    postedAt: { $gte: startOfDayUTC },
  };
  if (accountId) {
    query.postedByAccount = accountId;
  }

  return Post.countDocuments(query);
}

// --- Generate a unique, natural Reddit comment mentioning Serpbays ---
async function generateVariedComment(
  postContent: string,
  companyName: string,
  companyDescription: string
): Promise<string> {
  const randomSeed = Math.floor(Math.random() * 1000);
  const styles = [
    'share personal experience using serpbays for backlinks',
    'casually recommend serpbays guest posting to solve the poster\'s problem',
    'mention you found serpbays helpful for link building in a similar situation',
    'ask a follow-up question then briefly mention serpbays niche edits or guest posts',
    'give a tip and suggest serpbays as a resource for backlinks or guest post opportunities',
  ];
  const style = styles[randomSeed % styles.length];

  const prompt = `You are a real person on Reddit leaving a helpful comment in an SEO/marketing subreddit.

POST:
"""
${postContent.slice(0, 500)}
"""

YOUR TASK: Write 1-3 sentence comment that ${style}.

RULES:
- Write ONLY the comment text, nothing else (no quotes, no labels, no explanation)
- Sound like a genuine Redditor sharing a real recommendation from experience
- Mention "${companyName}" naturally — tie it specifically to backlinks, guest posting, or link building (whichever fits)
- NEVER include website URLs, domains, or "serpbays.com" — just the brand name
- Vary your opening — do NOT always start with "Hey" or "I"
- Use natural, conversational Reddit language — no buzzwords, no excessive emojis
- Do NOT write generic praise — connect the mention to the post topic
- Do NOT include any code, errors, JSON, or technical output
- Company context: ${companyDescription}
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
      .replace(/serpbays\.com/gi, 'Serpbays')
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (comment.length > 400) {
      comment = comment.slice(0, 397) + '...';
    }

    return comment;
  } catch (err) {
    console.error('Failed to generate varied comment:', (err as Error).message);
    return '';
  }
}

async function main() {
  console.log(`[${new Date().toISOString()}] Reddit Cron: starting`);
  const _cronId = cronStart('reddit', 'auto');
  process.on('exit', (code) => cronFinish(_cronId, 'reddit', code));

  await connectDB();

  // Step 1: Load settings (needed for schedule check)
  const settings = await Settings.findOne();
  if (!settings) {
    console.error('No settings configured, exiting');
    process.exit(0);
  }

  // Step 1b: Schedule guard (uses per-platform schedule if configured)
  const schedule = settings.platformSchedules?.get('reddit');
  if (!isWithinSchedule(schedule)) {
    console.log('Outside scheduled hours, exiting');
    process.exit(0);
  }

  // Pause guard — dashboard "Pause Cron" button sets this flag
  if (settings.autoPostingPaused) {
    console.log('Auto-posting is paused via dashboard, exiting');
    process.exit(0);
  }

  const keywords: string[] = settings.redditKeywords?.length
    ? settings.redditKeywords
    : (settings.keywords?.length ? settings.keywords : DEFAULT_KEYWORDS);
  const dailyLimit: number = settings.redditDailyLimit ?? DEFAULT_DAILY_LIMIT;
  const autoPostThreshold: number =
    settings.redditAutoPostThreshold ?? DEFAULT_AUTO_POST_THRESHOLD;

  // Step 2b: Read current account identity
  const accountId = getCurrentAccountId();
  if (accountId) {
    console.log(`Active Reddit account: ${accountId}`);
  }

  // Step 3: Check daily limit (per-account)
  const todayCount = await getTodayCommentCount(accountId);
  if (todayCount >= dailyLimit) {
    console.log(`Daily limit reached: ${todayCount}/${dailyLimit} comments posted today${accountId ? ` (account: ${accountId})` : ''}`);
    process.exit(0);
  }
  console.log(`Comments posted today: ${todayCount}/${dailyLimit}${accountId ? ` (account: ${accountId})` : ''}`);

  // Step 3b: 15-minute cooldown
  const MIN_COMMENT_GAP_MS = 15 * 60 * 1000;
  const lastPosted = await Post.findOne({ platform: 'reddit', status: 'posted', postedAt: { $exists: true } })
    .sort({ postedAt: -1 })
    .select('postedAt platform');
  if (lastPosted?.postedAt) {
    const elapsed = Date.now() - new Date(lastPosted.postedAt).getTime();
    if (elapsed < MIN_COMMENT_GAP_MS) {
      const remainMin = Math.ceil((MIN_COMMENT_GAP_MS - elapsed) / 60000);
      console.log(`Cooldown: last comment was ${Math.floor(elapsed / 60000)}m ago, need ${remainMin}m more. Skipping.`);
      process.exit(0);
    }
  }

  // Step 4: Ensure logged in
  const loggedIn = await ensureRedditLoggedIn();
  if (!loggedIn) {
    try {
      writeFileSync(join(process.cwd(), '.reddit-profile', '.verified'), JSON.stringify({ loggedIn: false, ts: new Date().toISOString(), message: 'Session expired — cron detected not logged in' }));
    } catch {}
    console.error('Not logged in to Reddit. Use cookie login from the dashboard.');
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

  // Step 5: Scrape posts — use subreddits from settings if available, otherwise search
  let allPosts: Array<{ url: string; author: string; content: string; subreddit: string }> = [];

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

  // Step 6: Save new posts to DB
  let newPostCount = 0;
  for (const post of allPosts) {
    const exists = await Post.findOne({ url: post.url });
    if (!exists) {
      await Post.create({
        url: post.url,
        platform: 'reddit',
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

  // Step 7: Evaluate unevaluated Reddit posts
  const unevaluatedPosts = await Post.find({
    platform: 'reddit',
    status: 'new',
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

  // Step 8: Auto-post one high-scoring comment
  const recheck = await getTodayCommentCount(accountId);
  if (recheck >= dailyLimit) {
    console.log('Daily limit reached after evaluation, skipping auto-post');
    await closeBrowser();
    process.exit(0);
  }

  const autoPostCandidate = await Post.findOne({
    platform: 'reddit',
    status: 'evaluated',
    aiRelevanceScore: { $gte: autoPostThreshold },
    aiReply: { $exists: true, $ne: '' },
  }).sort({ _id: -1 });

  if (autoPostCandidate) {
    let replyText = autoPostCandidate.editedReply || '';

    if (!replyText) {
      replyText = await generateVariedComment(
        autoPostCandidate.content,
        settings.companyName,
        settings.companyDescription
      );
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
    } else if (!replyText || replyText.length < 5 || /error|failed|exception|undefined|null/i.test(replyText)) {
      console.error('Generated comment failed safety check, skipping:', replyText?.slice(0, 100));
    } else {
      console.log(
        `Auto-posting comment on ${autoPostCandidate.url} (score: ${autoPostCandidate.aiRelevanceScore})`
      );

      // Warm-up: upvote post before commenting (builds rapport)
      if (!autoPostCandidate.likedByBot) {
        try {
          await upvoteRedditPost(autoPostCandidate.url);
          await Post.findByIdAndUpdate(autoPostCandidate._id, { likedByBot: true });
          console.log('  Upvoted post');
          await new Promise((r) => setTimeout(r, 2000 + Math.random() * 2000));
        } catch (e) { console.warn('Upvote failed, continuing:', (e as Error).message); }
      }

      const success = await postRedditComment(autoPostCandidate.url, replyText);

      if (success) {
        await Post.findByIdAndUpdate(autoPostCandidate._id, {
          status: 'posted',
          postedAt: new Date(),
          editedReply: replyText,
          postedByAccount: accountId,
        });
        console.log(`Comment posted successfully${accountId ? ` (account: ${accountId})` : ''}`);
      } else {
        console.error('Failed to post comment, will retry next run');
      }
    }
  } else {
    console.log('No posts above auto-post threshold, skipping');
  }

  console.log(`[${new Date().toISOString()}] Reddit Cron: complete`);
  await closeBrowser();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('Fatal error:', err);
  await closeBrowser().catch(() => {});
  process.exit(1);
});
