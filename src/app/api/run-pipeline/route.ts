import { NextResponse } from 'next/server';
import { runScraper } from '@/lib/scraper';
import { connectDB } from '@/lib/mongodb';
import Post from '@/models/Post';
import Settings from '@/models/Settings';
import { evaluatePost } from '@/lib/openclaw';
import { getAuthUserId } from '@/lib/apiAuth';
import { checkRateLimit } from '@/lib/rateLimit';

const EVAL_LIMIT = 50;        // max posts to evaluate per run
const BATCH_SIZE = 3;          // concurrent evaluations per batch

export async function POST() {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  const rl = checkRateLimit(userId, 'scrape');
  if (rl) return NextResponse.json({ error: rl.error }, { status: 429 });

  await connectDB();
  const startTime = Date.now();

  const summary = {
    scraped: 0,
    newPosts: 0,
    evaluated: 0,
    skipped: 0,
    autoApproved: 0,
    errors: [] as string[],
    startedAt: new Date().toISOString(),
    finishedAt: '',
    duration: '',
  };

  // ── Step 1: Scrape ────────────────────────────────────────────────────────
  try {
    const scrapeResult = await runScraper(undefined, userId);
    summary.scraped  = scrapeResult.totalScraped;
    summary.newPosts = scrapeResult.newPosts;
    if (scrapeResult.errors?.length) summary.errors.push(...scrapeResult.errors);
  } catch (err) {
    summary.errors.push(`Scrape failed: ${(err as Error).message}`);
  }

  // ── Step 2: Evaluate all 'new' posts (batched concurrency) ───────────────
  try {
    const settings = await Settings.findOne({ userId });
    if (!settings) {
      summary.errors.push('Settings not configured — evaluation skipped');
    } else {
      const newPosts = await Post.find({ userId, status: 'new' }).limit(20);
      for (const post of newPosts) {
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
          summary.evaluated++;
        } catch (err) {
          await Post.findByIdAndUpdate(post._id, { status: 'new' });
          summary.errors.push(`Evaluate post ${post._id}: ${(err as Error).message}`);
          summary.skipped++;
        }
      }
    }
  } catch (err) {
    summary.errors.push(`Evaluation step failed: ${(err as Error).message}`);
  }

  const elapsed = Date.now() - startTime;
  const secs = Math.round(elapsed / 1000);
  summary.duration = secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : `${secs}s`;
  summary.finishedAt = new Date().toISOString();
  return NextResponse.json(summary);
}
