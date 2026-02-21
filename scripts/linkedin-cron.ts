/**
 * LinkedIn Auto-Commenter Cron Script
 *
 * Scrapes LinkedIn for keyword-matching posts, evaluates them with AI,
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
import {
  ensureLinkedInLoggedIn,
  scrapeProfileIdentity,
  scrapeLinkedInPosts,
  postLinkedInComment,
  likeLinkedInPost,
  closeBrowser,
} from '../src/lib/linkedin';
import { isWithinSchedule } from '../src/lib/schedule';
import Post from '../src/models/Post';
import Settings from '../src/models/Settings';

const DEFAULT_KEYWORDS = ['Serpbays', 'guest post', 'backlinks', 'backlink', 'guest posting', 'link building', 'seo'];
const DEFAULT_DAILY_LIMIT = 5;
const DEFAULT_AUTO_POST_THRESHOLD = 70;

// --- Read current LinkedIn account identity ---
function getVerifiedData(): Record<string, string> {
  try {
    const raw = readFileSync(join(process.cwd(), '.linkedin-profile', '.verified'), 'utf8');
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
    platform: 'linkedin',
    status: 'posted',
    postedAt: { $gte: startOfDayUTC },
  };
  if (accountId) {
    query.postedByAccount = accountId;
  }

  return Post.countDocuments(query);
}

// --- Generate a unique, natural LinkedIn comment mentioning Serpbays ---
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

  const prompt = `You are a real SEO professional on LinkedIn leaving a thoughtful comment on a post.

POST:
"""
${postContent.slice(0, 500)}
"""

YOUR TASK: Write 1-3 sentence comment that ${style}.

RULES:
- Write ONLY the comment text, nothing else (no quotes, no labels, no explanation)
- Sound like a genuine LinkedIn professional sharing a real recommendation from experience
- Mention "${companyName}" naturally — tie it specifically to backlinks, guest posting, or link building (whichever fits)
- NEVER include website URLs, domains, or "serpbays.com" — just the brand name
- Vary your opening — do NOT always start with "Great post" or "I"
- Use professional but conversational LinkedIn language — no buzzwords, no excessive emojis
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
  console.log(`[${new Date().toISOString()}] LinkedIn Cron: starting`);

  await connectDB();

  // Step 1: Load settings
  const settings = await Settings.findOne();
  if (!settings) {
    console.error('No settings configured, exiting');
    process.exit(0);
  }

  // Step 1b: Schedule guard (uses per-platform schedule if configured)
  const schedule = settings.platformSchedules?.get('linkedin');
  if (!isWithinSchedule(schedule)) {
    console.log('Outside scheduled hours, exiting');
    process.exit(0);
  }

  const keywords: string[] = settings.linkedinKeywords?.length
    ? settings.linkedinKeywords
    : (settings.keywords?.length ? settings.keywords : DEFAULT_KEYWORDS);
  const dailyLimit: number = settings.linkedinDailyLimit ?? DEFAULT_DAILY_LIMIT;
  const autoPostThreshold: number =
    settings.linkedinAutoPostThreshold ?? DEFAULT_AUTO_POST_THRESHOLD;

  // Step 2b: Read current account identity
  const accountId = getCurrentAccountId();
  if (accountId) {
    console.log(`Active LinkedIn account: ${accountId}`);
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
  const lastPosted = await Post.findOne({ platform: 'linkedin', status: 'posted', postedAt: { $exists: true } })
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
  const loggedIn = await ensureLinkedInLoggedIn();
  if (!loggedIn) {
    try {
      writeFileSync(join(process.cwd(), '.linkedin-profile', '.verified'), JSON.stringify({ loggedIn: false, ts: new Date().toISOString(), message: 'Session expired — cron detected not logged in' }));
    } catch {}
    console.error('Not logged in to LinkedIn. Use cookie login from the dashboard.');
    process.exit(1);
  }
  console.log('LinkedIn login confirmed');

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
    writeFileSync(join(process.cwd(), '.linkedin-profile', '.verified'), JSON.stringify({
      loggedIn: true, ts: new Date().toISOString(),
      message: 'LinkedIn session verified by cron',
      accountId: aid, displayName: dn, username: un,
    }));
  } catch {}

  // Step 5: Scrape LinkedIn posts
  const allPosts = await scrapeLinkedInPosts(keywords);
  console.log(`Found ${allPosts.length} keyword-matching posts`);

  // Step 6: Save new posts to DB
  let newPostCount = 0;
  for (const post of allPosts) {
    const exists = await Post.findOne({ url: post.url });
    if (!exists) {
      await Post.create({
        url: post.url,
        platform: 'linkedin',
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

  // Step 7: Evaluate unevaluated LinkedIn posts
  const unevaluatedPosts = await Post.find({
    platform: 'linkedin',
    status: 'new',
  }).limit(10);

  console.log(`Evaluating ${unevaluatedPosts.length} new LinkedIn posts`);

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
    platform: 'linkedin',
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

    // Safety check
    if (!replyText || replyText.length < 5 || /error|failed|exception|undefined|null/i.test(replyText)) {
      console.error('Generated comment failed safety check, skipping:', replyText?.slice(0, 100));
    } else {
      console.log(
        `Auto-posting comment on ${autoPostCandidate.url} (score: ${autoPostCandidate.aiRelevanceScore})`
      );
      console.log(`Comment: "${replyText}"`);

      // Warm-up: like post before commenting (builds rapport)
      if (!autoPostCandidate.likedByBot) {
        try {
          await likeLinkedInPost(autoPostCandidate.url);
          await Post.findByIdAndUpdate(autoPostCandidate._id, { likedByBot: true });
          console.log('  Liked post');
          await new Promise((r) => setTimeout(r, 2000 + Math.random() * 2000));
        } catch (e) { console.warn('Like failed, continuing:', (e as Error).message); }
      }

      const success = await postLinkedInComment(autoPostCandidate.url, replyText);

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

  console.log(`[${new Date().toISOString()}] LinkedIn Cron: complete`);
  await closeBrowser();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('Fatal error:', err);
  await closeBrowser().catch(() => {});
  process.exit(1);
});
