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
  closeBrowser,
} from '../src/lib/quora';
import { isWithinSchedule } from '../src/lib/schedule';
import { logActivity, notifyAuthError } from '../src/lib/activityLog';
import Post from '../src/models/Post';
import Settings from '../src/models/Settings';

const DEFAULT_DAILY_LIMIT = 2;  // Quora aggressively collapses spam answers
const DEFAULT_AUTO_POST_THRESHOLD = 70;

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
async function getTodayCommentCount(accountId: string): Promise<number> {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60000;
  const istNow = new Date(now.getTime() + istOffset);
  const startOfDay = new Date(istNow);
  startOfDay.setHours(0, 0, 0, 0);
  const startOfDayUTC = new Date(startOfDay.getTime() - istOffset);

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

  // Step 1b: Schedule guard (uses per-platform schedule if configured)
  const schedule = settings.platformSchedules?.get('quora');
  if (!process.env.CRON_MANUAL && !isWithinSchedule(schedule)) {
    console.log('Outside scheduled hours, exiting');
    process.exit(0);
  }

  // Pause guard — dashboard "Pause Cron" button sets this flag
  if (!process.env.CRON_MANUAL && settings.autoPostingPaused) {
    console.log('Auto-posting is paused via dashboard, exiting');
    process.exit(0);
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
  const dailyLimit: number = settings.quoraDailyLimit ?? DEFAULT_DAILY_LIMIT;
  const autoPostThreshold: number =
    settings.quoraAutoPostThreshold ?? DEFAULT_AUTO_POST_THRESHOLD;
  const brandMentionRate: number = (settings as any).quoraBrandMentionRate ?? 25;
  const cooldownMinutes: number = (settings as any).quoraCooldownMinutes ?? 120;

  // Step 2b: Read current account identity
  const accountId = getCurrentAccountId();
  if (accountId) {
    console.log(`Active Quora account: ${accountId}`);
  }

  // Step 3: Check daily limit (per-account)
  const todayCount = await getTodayCommentCount(accountId);
  if (todayCount >= dailyLimit) {
    console.log(`Daily limit reached: ${todayCount}/${dailyLimit} answers posted today${accountId ? ` (account: ${accountId})` : ''}`);
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'quora', 'info', 'limit', `Daily limit reached (${todayCount}/${dailyLimit}). Will resume tomorrow.`);
    process.exit(0);
  }
  console.log(`Answers posted today: ${todayCount}/${dailyLimit}${accountId ? ` (account: ${accountId})` : ''}`);

  // Step 3b: 15-minute cooldown (skipped for manual runs)
  if (!process.env.CRON_MANUAL) {
    const MIN_COMMENT_GAP_MS = cooldownMinutes * 60 * 1000;
    const lastPosted = await Post.findOne({ platform: 'quora', status: 'posted', postedAt: { $exists: true }, ...(CRON_USER_ID && { userId: CRON_USER_ID }) })
      .sort({ postedAt: -1 })
      .select('postedAt platform');
    if (lastPosted?.postedAt) {
      const elapsed = Date.now() - new Date(lastPosted.postedAt).getTime();
      if (elapsed < MIN_COMMENT_GAP_MS) {
        const remainMin = Math.ceil((MIN_COMMENT_GAP_MS - elapsed) / 60000);
        console.log(`Cooldown: last answer was ${Math.floor(elapsed / 60000)}m ago, need ${remainMin}m more. Skipping.`);
        process.exit(0);
      }
    }
  }

  // Step 4: Ensure logged in
  const loggedIn = await ensureQuoraLoggedIn();
  if (!loggedIn) {
    try {
      writeFileSync(join(process.cwd(), process.env.QUORA_PROFILE_DIR || '.quora-profile', '.verified'), JSON.stringify({ loggedIn: false, ts: new Date().toISOString(), message: 'Session expired — cron detected not logged in' }));
    } catch {}
    console.error('Not logged in to Quora. Use cookie login from the dashboard.');
    if (CRON_USER_ID) {
      await logActivity(CRON_USER_ID, 'quora', 'error', 'auth_error', 'Not logged in to Quora — re-set cookies from dashboard');
      await notifyAuthError(CRON_USER_ID, 'quora', 'Not logged in to Quora — re-set cookies from dashboard');
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

  // Step 8: Two-phase posting — answer first (any question), then brand comment
  const recheck = await getTodayCommentCount(accountId);
  if (recheck >= dailyLimit) {
    console.log('Daily limit reached after evaluation, skipping auto-post');
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'quora', 'info', 'limit', `Daily limit reached (${recheck}/${dailyLimit}). Will resume tomorrow.`);
    await closeBrowser();
    process.exit(0);
  }

  // Pick any evaluated question (not just high-scoring ones) — answer regardless of relevance
  const candidate = await Post.findOne({
    platform: 'quora',
    status: 'evaluated',
    aiReply: { $exists: true, $ne: '' },
    postAttempts: { $not: { $gte: 3 } },
    ...(CRON_USER_ID && { userId: CRON_USER_ID }),
  }).sort({ aiRelevanceScore: -1, _id: -1 }); // prefer higher-scoring but don't require it

  if (!candidate) {
    console.log('No evaluated questions to post on, skipping');
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'quora', 'info', 'skip', 'No evaluated questions available to answer');
    await closeBrowser();
    process.exit(0);
  }

  // --- Phase 1: Post a genuine, helpful answer to the question ---
  let answerText = await generateGenuineAnswer(
    candidate.content,
    settings.companyName,
    settings.companyDescription
  );

  // Fallback: use the pre-evaluated AI reply if genuine answer generation fails
  if (!isTextSafe(answerText) && candidate.aiReply && isTextSafe(candidate.aiReply)) {
    console.log('Generated answer failed safety check, falling back to pre-evaluated aiReply');
    answerText = candidate.aiReply;
  }

  const safeAnswer = isTextSafe(answerText);
  if (!safeAnswer) {
    console.error(`Generated answer failed safety check (len=${answerText?.length ?? 0}, preview="${(answerText ?? '').slice(0, 80)}")`);
    console.error(`Candidate content: "${candidate.content.slice(0, 100)}"`);
    await Post.findByIdAndUpdate(candidate._id, { $inc: { postAttempts: 1 } });
    await closeBrowser();
    process.exit(0);
  }

  console.log(`\n[Phase 1] Answering question: ${candidate.url}`);
  console.log(`Answer preview: "${answerText.slice(0, 120)}..."`);

  const answerResult = await postQuoraAnswer(candidate.url, answerText);
  if (answerResult.success) {
    await Post.findByIdAndUpdate(candidate._id, {
      status: 'posted',
      postedAt: new Date(),
      editedReply: answerText,
      postedByAccount: accountId,
    });
    console.log('Answer posted successfully');
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'quora', 'success', 'post', `Answered question: ${candidate.url}`, { score: candidate.aiRelevanceScore });
  } else {
    await Post.findByIdAndUpdate(candidate._id, { $inc: { postAttempts: 1 } });
    console.error('Failed to post answer:', answerResult.error);
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'quora', 'error', 'post_failed', `Failed to post answer: ${answerResult.error}`, { url: candidate.url });
    await closeBrowser();
    process.exit(0);
  }

  // --- Phase 2: Post a brand-mentioning comment on the same question (if brandMentionRate allows) ---
  const shouldComment = Math.random() < (brandMentionRate / 100);
  if (shouldComment && (recheck + 1) < dailyLimit) {
    console.log('\n[Phase 2] Posting brand comment on the same question...');
    await new Promise(r => setTimeout(r, 4000 + Math.random() * 3000)); // natural pause

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
      }
    } else {
      console.log('Comment text failed safety check — skipping comment phase');
    }
  } else {
    console.log(`[Phase 2] Skipping brand comment (rate: ${brandMentionRate}%, daily remaining: ${dailyLimit - recheck - 1})`);
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
