/**
 * test-comment-post.ts
 *
 * Picks the highest-scoring evaluated post on a platform, generates a comment
 * via askOpenClaw, prints the RAW response AND the final cleaned text so you
 * can verify no JSON / ANSI garbage slips through, then actually posts it.
 *
 * Usage:
 *   npx tsx scripts/test-comment-post.ts [platform]   (default: reddit)
 *   npx tsx scripts/test-comment-post.ts reddit --dry-run   (no actual post)
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { connectDB } from '../src/lib/mongodb';
import { askOpenClaw } from '../src/lib/openclaw';
import { postRedditComment, closeBrowser } from '../src/lib/reddit';
import Post from '../src/models/Post';
import Settings from '../src/models/Settings';

const PLATFORM = (process.argv[2] || 'reddit').toLowerCase();
const DRY_RUN = process.argv.includes('--dry-run');

// Same styles as reddit-cron generateVariedComment
const COMMENT_STYLES = [
  'share personal experience using serpbays for backlinks',
  'casually recommend serpbays guest posting to solve the poster\'s problem',
  'mention you found serpbays helpful for link building in a similar situation',
  'ask a follow-up question then briefly mention serpbays niche edits or guest posts',
  'give a tip and suggest serpbays as a resource for backlinks or guest post opportunities',
];

async function generateComment(
  postContent: string,
  companyName: string,
  companyDescription: string
): Promise<{ raw: string; cleaned: string }> {
  const seed = Math.floor(Math.random() * 1000);
  const style = COMMENT_STYLES[seed % COMMENT_STYLES.length];

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
- Seed: ${seed}

Write the comment now:`;

  const raw = await askOpenClaw(prompt);

  // Same cleanup as generateVariedComment in reddit-cron
  let cleaned = raw;

  if (cleaned.trimStart().startsWith('{')) {
    try {
      const parsed = JSON.parse(cleaned);
      cleaned = parsed?.payloads?.[0]?.text
        || parsed?.result?.content
        || parsed?.content
        || parsed?.message
        || '';
    } catch {
      const m = cleaned.match(/"text"\s*:\s*"([^"]+)"/);
      if (m) cleaned = m[1];
    }
  }

  cleaned = cleaned
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/^(Comment|Reply|Response|Here'?s?\s*(the|my|a)?\s*(comment|reply)?:?\s*)/i, '')
    .replace(/\n/g, ' ')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/serpbays\.com/gi, 'SerpBays')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (cleaned.length > 400) cleaned = cleaned.slice(0, 397) + '...';

  return { raw, cleaned };
}

async function main() {
  await connectDB();

  const settings = await Settings.findOne();
  if (!settings) { console.error('No settings'); process.exit(1); }

  const post = await Post.findOne({
    platform: PLATFORM,
    status: { $in: ['evaluated', 'approved'] },
    aiRelevanceScore: { $gte: 60 },
    aiReply: { $exists: true, $ne: '' },
  }).sort({ aiRelevanceScore: -1 });

  if (!post) {
    console.error(`No eligible ${PLATFORM} post found (score >= 60, status evaluated/approved)`);
    process.exit(0);
  }

  console.log('\n' + '═'.repeat(64));
  console.log(`POST SELECTED`);
  console.log('═'.repeat(64));
  console.log(`  Platform : ${post.platform}`);
  console.log(`  URL      : ${post.url}`);
  console.log(`  Score    : ${post.aiRelevanceScore}`);
  console.log(`  Content  :\n\n${String(post.content).slice(0, 300)}…\n`);

  console.log('─'.repeat(64));
  console.log('Generating comment via askOpenClaw…');
  console.log('─'.repeat(64));

  const { raw, cleaned } = await generateComment(
    String(post.content),
    settings.companyName,
    settings.companyDescription
  );

  console.log('\nRAW response from askOpenClaw:');
  console.log('┌' + '─'.repeat(62) + '┐');
  raw.split('\n').forEach(line => console.log('│ ' + line.slice(0, 60).padEnd(60) + ' │'));
  console.log('└' + '─'.repeat(62) + '┘');

  console.log('\nCLEANED comment (what will be posted):');
  console.log('┌' + '─'.repeat(62) + '┐');
  // Word-wrap at 60 chars
  const words = cleaned.split(' ');
  let line = '';
  const wrappedLines: string[] = [];
  for (const w of words) {
    if ((line + ' ' + w).trim().length > 60) { wrappedLines.push(line.trim()); line = w; }
    else { line = (line + ' ' + w).trim(); }
  }
  if (line) wrappedLines.push(line);
  wrappedLines.forEach(l => console.log('│ ' + l.padEnd(60) + ' │'));
  console.log('└' + '─'.repeat(62) + '┘');

  // Format checks
  const looksLikeJson = /^\s*[\[{]/.test(cleaned);
  const hasAnsi       = /\x1b\[[\d;]*m/.test(cleaned);
  const hasPayloads   = /"payloads"\s*:/.test(cleaned);
  const tooShort      = cleaned.length < 10;

  console.log('\nFORMAT CHECKS:');
  console.log(`  looksLikeJson : ${looksLikeJson ? '❌ FAIL' : '✓ pass'}`);
  console.log(`  hasAnsiCodes  : ${hasAnsi       ? '❌ FAIL' : '✓ pass'}`);
  console.log(`  hasPayloads   : ${hasPayloads   ? '❌ FAIL' : '✓ pass'}`);
  console.log(`  tooShort      : ${tooShort      ? '❌ FAIL' : '✓ pass'} (${cleaned.length} chars)`);
  console.log('');

  const allPass = !looksLikeJson && !hasAnsi && !hasPayloads && !tooShort;

  if (!allPass) {
    console.error('FORMAT CHECK FAILED — comment would be blocked by cron safety check, not posting.');
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log('[--dry-run] Skipping actual post. Comment is clean and ready.');
    process.exit(0);
  }

  if (PLATFORM !== 'reddit') {
    console.log(`[INFO] Actual posting only wired for reddit in this test. Run with reddit platform.`);
    process.exit(0);
  }

  console.log('Posting comment on Reddit…\n');
  const success = await postRedditComment(post.url, cleaned);

  if (success) {
    await Post.findByIdAndUpdate(post._id, {
      status: 'posted',
      postedAt: new Date(),
      editedReply: cleaned,
    });
    console.log('\nPOSTED successfully. Post status set to "posted".');
  } else {
    console.error('\nFailed to post — check browser/cookie status.');
  }

  await closeBrowser().catch(() => {});
  process.exit(0);
}

main().catch(async err => {
  console.error('Fatal:', err);
  await closeBrowser().catch(() => {});
  process.exit(1);
});
