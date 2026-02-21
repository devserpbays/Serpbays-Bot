import { NextResponse } from 'next/server';
import { runScraper } from '@/lib/scraper';
import { connectDB } from '@/lib/mongodb';
import Post from '@/models/Post';
import Settings from '@/models/Settings';
import { evaluatePost } from '@/lib/openclaw';

export async function POST() {
  await connectDB();

  const summary = {
    scraped: 0,
    newPosts: 0,
    evaluated: 0,
    skipped: 0,
    errors: [] as string[],
    startedAt: new Date().toISOString(),
    finishedAt: '',
  };

  // ── Step 1: Scrape ────────────────────────────────────────────────────────
  try {
    const scrapeResult = await runScraper();
    summary.scraped  = scrapeResult.totalScraped;
    summary.newPosts = scrapeResult.newPosts;
    if (scrapeResult.errors?.length) summary.errors.push(...scrapeResult.errors);
  } catch (err) {
    summary.errors.push(`Scrape failed: ${(err as Error).message}`);
  }

  // ── Step 2: Evaluate all 'new' posts ─────────────────────────────────────
  try {
    const settings = await Settings.findOne();
    if (!settings) {
      summary.errors.push('Settings not configured — evaluation skipped');
    } else {
      const newPosts = await Post.find({ status: 'new' }).limit(20);
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

  summary.finishedAt = new Date().toISOString();
  return NextResponse.json(summary);
}
