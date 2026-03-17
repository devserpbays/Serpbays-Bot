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
import { cronStart, cronFinish, acquireCronLock, releaseCronLock } from '../src/lib/cronState';
import {
  ensureQuoraLoggedIn,
  scrapeProfileIdentity,
  scrapeQuoraQuestions,
  postQuoraAnswer,
  closeBrowser,
} from '../src/lib/quora';
import { isWithinSchedule } from '../src/lib/schedule';
import { logActivity, notifyAuthError } from '../src/lib/activityLog';
import Post from '../src/models/Post';
import Settings from '../src/models/Settings';

const DEFAULT_DAILY_LIMIT = 3;
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

// --- Generate a unique, natural Quora answer mentioning the company ---
async function generateVariedAnswer(
  postContent: string,
  companyName: string,
  companyDescription: string
): Promise<string> {
  const randomSeed = Math.floor(Math.random() * 1000);
  const styles = [
    `share personal experience using ${companyName}`,
    `give a detailed helpful answer then naturally mention ${companyName}`,
    `mention you found ${companyName} helpful in a similar situation`,
    `provide expert advice then briefly reference ${companyName}`,
    `answer the question thoroughly and suggest ${companyName} as a resource`,
  ];
  const style = styles[randomSeed % styles.length];

  const prompt = `You are an SEO expert answering a question on Quora. Write a genuinely helpful, detailed answer.

QUESTION:
"""
${postContent.slice(0, 500)}
"""

YOUR TASK: Write a 3-5 sentence answer that ${style}.

RULES:
- Write ONLY the answer text, nothing else (no quotes, no labels, no explanation)
- Sound like a real Quora expert sharing genuine knowledge and experience
- Provide actual value first — the answer should be helpful even without the brand mention
- Mention "${companyName}" naturally once — tie it specifically to backlinks, guest posting, or link building
- NEVER include website URLs or domains — just the brand name
- Vary your opening — do NOT always start with "Great question" or "I"
- Use professional but conversational Quora language
- Do NOT write generic praise — connect the mention to the question topic
- Do NOT include any code, errors, JSON, or technical output
- Company context: ${companyDescription}
- Seed: ${randomSeed}

Write the answer now:`;

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
      .replace(/^(Answer|Reply|Response|Here'?s?\s*(the|my|a)?\s*(answer|reply)?:?\s*)/i, '')
      .replace(/https?:\/\/\S+/gi, '')
      .replace(new RegExp(companyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\.com', 'gi'), companyName)
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (comment.length > 1500) {
      comment = comment.slice(0, 1497) + '...';
    }

    return comment;
  } catch (err) {
    console.error('Failed to generate varied answer:', (err as Error).message);
    return '';
  }
}

async function main() {
  if (!await acquireCronLock('quora', CRON_USER_ID || undefined)) {
    console.log(`[${new Date().toISOString()}] Quora Cron: already running for user ${CRON_USER_ID || 'default'}, exiting`);
    process.exit(0);
  }
  process.on('exit', () => { releaseCronLock('quora', CRON_USER_ID || undefined).catch(() => {}); });

  console.log(`[${new Date().toISOString()}] Quora Cron: starting (user: ${CRON_USER_ID || 'default'})`);
  if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'quora', 'info', 'cron_start', 'Quora cron started');
  const _cronId = await cronStart('quora', 'auto', CRON_USER_ID || undefined);
  process.on('exit', (code) => { cronFinish(_cronId, 'quora', code, '', CRON_USER_ID || undefined).catch(() => {}); });

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
    const MIN_COMMENT_GAP_MS = 15 * 60 * 1000;
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

  // Step 8: Auto-post one high-scoring answer
  const recheck = await getTodayCommentCount(accountId);
  if (recheck >= dailyLimit) {
    console.log('Daily limit reached after evaluation, skipping auto-post');
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'quora', 'info', 'limit', `Daily limit reached (${recheck}/${dailyLimit}). Will resume tomorrow.`);
    await closeBrowser();
    process.exit(0);
  }

  const autoPostCandidate = await Post.findOne({
    platform: 'quora',
    status: 'evaluated',
    aiRelevanceScore: { $gte: autoPostThreshold },
    aiReply: { $exists: true, $ne: '' },
    postAttempts: { $not: { $gte: 3 } },
    ...(CRON_USER_ID && { userId: CRON_USER_ID }),
  }).sort({ _id: -1 });

  if (autoPostCandidate) {
    let replyText = autoPostCandidate.editedReply || '';

    if (!replyText) {
      replyText = await generateVariedAnswer(
        autoPostCandidate.content,
        settings.companyName,
        settings.companyDescription
      );
    }

    // Fallback to existing AI reply if fresh generation failed
    if (!replyText && autoPostCandidate.aiReply) {
      console.log('Using existing aiReply as fallback');
      replyText = autoPostCandidate.aiReply;
    }

    // Safety check — block JSON/debug garbage and empty/error text
    const looksLikeJson = /^\s*[\[{]/.test(replyText || '');
    // eslint-disable-next-line no-control-regex
    const hasAnsi = /\x1b\[[\d;]*m/.test(replyText || '');
    const hasPayloads = /"payloads"\s*:/.test(replyText || '');
    const hasDebugPrefix = /\[agent\/embedded\]/.test(replyText || '');

    if (looksLikeJson || hasAnsi || hasPayloads || hasDebugPrefix) {
      console.error('Generated answer failed format check — JSON/debug garbage, skipping:', replyText?.slice(0, 100));
    } else if (!replyText || replyText.length < 10 || /error|failed|exception|undefined|null/i.test(replyText)) {
      console.error('Generated answer failed safety check, skipping:', replyText?.slice(0, 100));
    } else {
      console.log(
        `Auto-posting answer on ${autoPostCandidate.url} (score: ${autoPostCandidate.aiRelevanceScore})`
      );
      console.log(`Answer: "${replyText.slice(0, 100)}..."`);

      const result = await postQuoraAnswer(autoPostCandidate.url, replyText);

      if (result.success) {
        await Post.findByIdAndUpdate(autoPostCandidate._id, {
          status: 'posted',
          postedAt: new Date(),
          editedReply: replyText,
          postedByAccount: accountId,
        });
        console.log(`Answer posted successfully${accountId ? ` (account: ${accountId})` : ''}`);
        if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'quora', 'success', 'post', `Comment posted on ${autoPostCandidate.url}`, { score: autoPostCandidate.aiRelevanceScore });
      } else {
        await Post.findByIdAndUpdate(autoPostCandidate._id, { $inc: { postAttempts: 1 } });
        console.error('Failed to post Quora answer:', result.error);
        if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'quora', 'error', 'post_failed', `Failed to post Quora answer: ${result.error || 'Unknown error'}`, { url: autoPostCandidate.url });
      }
    }
  } else {
    console.log('No questions above auto-post threshold, skipping');
    if (CRON_USER_ID) await logActivity(CRON_USER_ID, 'quora', 'info', 'skip', 'No posts above auto-post threshold');
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
