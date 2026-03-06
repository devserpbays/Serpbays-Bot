import { NextResponse } from 'next/server';
import { runScraper } from '@/lib/scraper';
import { connectDB } from '@/lib/mongodb';
import Post from '@/models/Post';
import Settings from '@/models/Settings';
import { evaluatePost } from '@/lib/openclaw';

const EVAL_LIMIT = 50;        // max posts to evaluate per run
const BATCH_SIZE = 3;          // concurrent evaluations per batch

export async function POST() {
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
    const scrapeResult = await runScraper();
    summary.scraped = scrapeResult.totalScraped;
    summary.newPosts = scrapeResult.newPosts;
    if (scrapeResult.errors?.length) summary.errors.push(...scrapeResult.errors);
  } catch (err) {
    summary.errors.push(`Scrape failed: ${(err as Error).message}`);
  }

  // ── Step 2: Evaluate all 'new' posts (batched concurrency) ───────────────
  try {
    const settings = await Settings.findOne();
    if (!settings) {
      summary.errors.push('Settings not configured — evaluation skipped');
    } else {
      const newPosts = await Post.find({ status: 'new' })
        .sort({ scrapedAt: -1 })
        .limit(EVAL_LIMIT);

      // Process in batches of BATCH_SIZE for concurrency
      for (let i = 0; i < newPosts.length; i += BATCH_SIZE) {
        const batch = newPosts.slice(i, i + BATCH_SIZE);

        const results = await Promise.allSettled(
          batch.map(async (post) => {
            await Post.findByIdAndUpdate(post._id, { status: 'evaluating' });
            try {
              const evaluation = await evaluatePost(
                post.content,
                settings.companyName,
                settings.companyDescription,
                settings.promptTemplate || undefined
              );

              // Determine auto-approve threshold for this platform
              const thresholdKey = `${post.platform}AutoPostThreshold` as keyof typeof settings;
              const threshold = (settings[thresholdKey] as number) ?? 70;
              const shouldAutoApprove = evaluation.relevant && evaluation.score >= threshold;

              await Post.findByIdAndUpdate(post._id, {
                status: shouldAutoApprove ? 'approved' : 'evaluated',
                aiReply: evaluation.suggestedReply,
                aiRelevanceScore: evaluation.score,
                aiTone: evaluation.tone,
                aiReasoning: evaluation.reasoning,
                evaluatedAt: new Date(),
                ...(shouldAutoApprove ? { approvedAt: new Date() } : {}),
              });

              return { evaluated: true, autoApproved: shouldAutoApprove };
            } catch (err) {
              await Post.findByIdAndUpdate(post._id, { status: 'new' });
              throw new Error(`Post ${post._id}: ${(err as Error).message}`);
            }
          })
        );

        for (const result of results) {
          if (result.status === 'fulfilled') {
            summary.evaluated++;
            if (result.value.autoApproved) summary.autoApproved++;
          } else {
            summary.errors.push(`Evaluate ${result.reason?.message || 'unknown error'}`);
            summary.skipped++;
          }
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
