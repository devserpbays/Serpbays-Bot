/**
 * Multi-user master scrape runner.
 *
 * Loops through all users with configured settings, runs scrape + evaluate
 * for each user's keywords.
 *
 * Usage:
 *   npx tsx scripts/master-scrape.ts
 *
 * Schedule with system crontab (e.g. every 30 minutes).
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { connectDB } from '../src/lib/mongodb';
import Settings from '../src/models/Settings';
import { spawn } from 'child_process';
import { join } from 'path';

function runScrapeForUser(userId: string): Promise<number> {
  return new Promise((resolve) => {
    const scriptPath = join(process.cwd(), 'scripts/scrape-cron.ts');

    const child = spawn('npx', ['tsx', scriptPath], {
      cwd: process.cwd(),
      env: { ...process.env, CRON_USER_ID: userId },
      stdio: 'inherit',
    });

    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', (err) => {
      console.error(`[master-scrape] Failed to spawn scrape for user ${userId}:`, err.message);
      resolve(1);
    });
  });
}

async function main() {
  console.log(`[${new Date().toISOString()}] Master Scrape: starting`);

  await connectDB();

  const allSettings = await Settings.find({
    userId: { $exists: true, $nin: [null, ''] },
  }).lean();

  if (allSettings.length === 0) {
    console.log('[master-scrape] No user settings found, exiting');
    process.exit(0);
  }

  console.log(`[master-scrape] Found ${allSettings.length} user(s)`);

  for (const settings of allSettings) {
    const userId = settings.userId as string;

    // Check if user has any keywords configured
    const hasKeywords = [
      settings.keywords,
      settings.twitterKeywords,
      settings.redditKeywords,
      settings.quoraKeywords,
      settings.youtubeKeywords,
      settings.pinterestKeywords,
      settings.facebookKeywords,
    ].some(kw => Array.isArray(kw) && kw.length > 0);

    if (!hasKeywords) {
      console.log(`[master-scrape] User ${userId}: no keywords configured, skipping`);
      continue;
    }

    console.log(`[master-scrape] User ${userId}: running scrape + evaluate`);

    const exitCode = await runScrapeForUser(userId);
    const status = exitCode === 0 ? 'OK' : `FAILED (exit: ${exitCode})`;
    console.log(`[master-scrape] User ${userId}: ${status}`);

    // Delay between users
    if (allSettings.length > 1) {
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  console.log(`[${new Date().toISOString()}] Master Scrape: complete`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
