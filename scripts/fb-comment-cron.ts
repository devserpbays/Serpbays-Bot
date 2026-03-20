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
  likeFacebookPost,
  closeBrowser,
} from '../src/lib/facebook';
import { isWithinSchedule } from '../src/lib/schedule';
import { logActivity, notifyAuthError } from '../src/lib/activityLog';
import Post from '../src/models/Post';
import Settings from '../src/models/Settings';

const DEFAULT_DAILY_LIMIT = 3;  // Facebook flags accounts posting too many group comments/day
const DEFAULT_AUTO_POST_THRESHOLD = 10;

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
async function generateVariedComment(
  postContent: string,
  companyName: string,
  companyDescription: string,
  brandMentionRate = 25
): Promise<string> {
  const randomSeed = Math.floor(Math.random() * 1000);
  const mentionBrand = Math.random() < (brandMentionRate / 100);

  const genericStyles = [
    'share a genuine helpful tip related to the post topic',
    'ask a thoughtful follow-up question about something in the post',
    'share a personal experience or lesson relevant to the discussion',
    'give practical advice that adds real value to the conversation',
    'share an observation or insight that builds on the post',
  ];
  const brandStyles = [
    `give a helpful tip; only if it fits completely naturally, mention ${companyName} briefly — do NOT force it`,
    `share a genuine insight; if organic, mention you've found ${companyName} useful — otherwise leave it out`,
  ];
  const stylePool = mentionBrand ? brandStyles : genericStyles;
  const style = stylePool[randomSeed % stylePool.length];

  const prompt = `You are a real member of a Facebook group leaving a genuine comment.

POST:
"""
${postContent.slice(0, 500)}
"""

YOUR TASK: Write a 1-2 sentence comment that ${style}.

STRICT RULES:
- Write ONLY the comment text, nothing else
- Sound like a genuine group member, NOT a marketer or advertiser
- NEVER use phrases like "check out X", "X is amazing for", "I recommend X", "highly suggest X"
- NEVER include website URLs, domains, or hashtags
- The comment must genuinely add value to the discussion
- Use natural, conversational language
- Do NOT include any code, errors, JSON, or technical output
${mentionBrand ? `- Company context if it fits naturally: ${companyDescription}` : ''}
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
  const dailyLimit: number = settings.facebookDailyLimit ?? DEFAULT_DAILY_LIMIT;
  const autoPostThreshold: number =
    settings.facebookAutoPostThreshold ?? DEFAULT_AUTO_POST_THRESHOLD;
  const brandMentionRate: number = (settings as any).facebookBrandMentionRate ?? 25;
  const cooldownMinutes: number = (settings as any).facebookCooldownMinutes ?? 90;

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
    const MIN_COMMENT_GAP_MS = cooldownMinutes * 60 * 1000;
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
  console.log(`Scraping ${groupUrls.length} groups`);

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

  const autoPostCandidate = await Post.findOne({
    platform: 'facebook',
    status: 'evaluated',
    aiRelevanceScore: { $gte: autoPostThreshold },
    aiReply: { $exists: true, $ne: '' },
    postAttempts: { $not: { $gte: 3 } },
    ...(CRON_USER_ID && { userId: CRON_USER_ID }),
  }).sort({ _id: -1 }); // newest first

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

      // Warm-up: like post before commenting (builds rapport)
      if (!autoPostCandidate.likedByBot) {
        try {
          await likeFacebookPost(autoPostCandidate.url);
          await Post.findByIdAndUpdate(autoPostCandidate._id, { likedByBot: true });
          console.log('  Liked post');
          await new Promise((r) => setTimeout(r, 2000 + Math.random() * 2000));
        } catch (e) { console.warn('Like failed, continuing:', (e as Error).message); }
      }

      const result = await postComment(autoPostCandidate.url, replyText);

      if (result.success) {
        await Post.findByIdAndUpdate(autoPostCandidate._id, {
          status: 'posted',
          postedAt: new Date(),
          editedReply: replyText,
          postedByAccount: accountId,
        });
        console.log(`Comment posted successfully${accountId ? ` (account: ${accountId})` : ''}`);
        if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'facebook', 'success', 'post', `Comment posted on ${autoPostCandidate.url}`, { score: autoPostCandidate.aiRelevanceScore });
      } else {
        const isStructuralError = result.error?.includes('Comment box not found') ||
          result.error?.includes('Comments are disabled') ||
          result.error?.includes('members-only') ||
          result.error?.includes('private group');

        if (isStructuralError) {
          // Post's comment section is restricted — no point retrying it
          await Post.findByIdAndUpdate(autoPostCandidate._id, { status: 'failed', postAttempts: 3 });
          console.error('Post permanently skipped (restricted comment section):', result.error);
        } else {
          await Post.findByIdAndUpdate(autoPostCandidate._id, { $inc: { postAttempts: 1 } });
        }
        console.error('Failed to post Facebook comment:', result.error);
        if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'facebook', 'error', 'post_failed', `Failed to post Facebook comment: ${result.error || 'Unknown error'}`, { url: autoPostCandidate.url });
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
