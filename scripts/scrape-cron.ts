/**
 * Standalone cron script: scrape Facebook + evaluate new posts via OpenClaw.
 *
 * Usage:
 *   npx tsx scripts/scrape-cron.ts
 *
 * Schedule with cron (e.g. every 30 minutes):
 *   0,30 * * * * cd /var/www/ai-bot/bot-serp && npx tsx scripts/scrape-cron.ts >> /var/log/social-bot-cron.log 2>&1
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

const CRON_USER_ID = process.env.CRON_USER_ID;

import { connectDB } from '../src/lib/mongodb';
import { runScraper } from '../src/lib/scraper';
import { evaluatePost } from '../src/lib/openclaw';
import Post from '../src/models/Post';
import Settings from '../src/models/Settings';
import { acquireCronLock, releaseCronLock } from '../src/lib/cronState';

async function main() {
  if (!await acquireCronLock('scrape', CRON_USER_ID || undefined)) {
    console.log(`[${new Date().toISOString()}] Scrape Cron: already running for user ${CRON_USER_ID || 'default'}, exiting`);
    process.exit(0);
  }
  process.on('exit', () => { releaseCronLock('scrape', CRON_USER_ID || undefined).catch(() => {}); });

  console.log(`[${new Date().toISOString()}] Starting scrape + evaluate cycle`);

  await connectDB();

  // Step 1: Scrape
  try {
    const scrapeResult = await runScraper(undefined, CRON_USER_ID || undefined);
    console.log(`Scrape complete: ${scrapeResult.totalScraped} found, ${scrapeResult.newPosts} new`);
  } catch (err) {
    console.error('Scrape failed:', (err as Error).message);
  }

  // Step 2: Evaluate new posts
  const settings = await Settings.findOne(CRON_USER_ID ? { userId: CRON_USER_ID } : {});
  if (!settings) {
    console.log('No settings configured, skipping evaluation');
    return;
  }

  const newPosts = await Post.find({ status: 'new', ...(CRON_USER_ID && { userId: CRON_USER_ID }) }).limit(10);
  console.log(`Evaluating ${newPosts.length} new posts`);

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

      console.log(`  Post ${post._id}: score=${evaluation.score}, relevant=${evaluation.relevant}`);
    } catch (err) {
      console.error(`  Failed to evaluate post ${post._id}:`, (err as Error).message);
      await Post.findByIdAndUpdate(post._id, { status: 'new' });
    }
  }

  console.log(`[${new Date().toISOString()}] Cycle complete`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
