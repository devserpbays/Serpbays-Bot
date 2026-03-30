/**
 * BullMQ Browser Worker — processes browser-tasks queue.
 * Run separately from Next.js: pm2 start "npx tsx src/worker.ts" --name bot-serp-worker
 *
 * Handles: cookie validation, scraping, posting, cron runs.
 * Concurrency controlled by MAX_BROWSER_CONCURRENCY env var.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { Worker, Job } from 'bullmq';
import IORedis from 'bullmq/node_modules/ioredis';
import { REDIS_URL } from './lib/redis';
import { connectDB } from './lib/mongodb';
import { saveCookies } from './lib/cookieStore';
import type { BrowserJobData, ValidateCookiesJob, ScrapeJob, PostReplyJob, CronRunJob, EvaluatePostsJob } from './lib/queue';
import { releaseUserSlot, enqueueJob } from './lib/queue';
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { join, resolve } from 'path';
import { mkdirSync, rmSync } from 'fs';
import { detectChromiumPath } from './lib/browserPath';

const PROJECT_ROOT = resolve(__dirname, '..');
const CONCURRENCY = parseInt(process.env.MAX_BROWSER_CONCURRENCY || '3', 10);
const WORKER_ID = process.env.pm_id || '0';
const SHUTDOWN_TIMEOUT = 30_000; // 30s hard kill

// Mark this process as a worker (used by mongodb.ts for pool sizing)
process.env.WORKER_PROCESS = '1';

console.log(`[worker:${WORKER_ID}] Starting browser-tasks worker (concurrency: ${CONCURRENCY})`);

// ── Cookie Validation Handlers ─────────────────────────────────

async function handleValidateTwitter(data: ValidateCookiesJob) {
  const { userId, platform, cookies } = data;
  const cookieList = cookies as Array<{ name: string; value: string; domain: string; path: string; expires?: number; secure?: boolean; httpOnly?: boolean; sameSite?: 'Strict' | 'Lax' | 'None' }>;

  // Use temp dir for browser context
  const tmpDir = join('/tmp', `browser-${userId}-${platform}-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });

  let context;
  try {
    const execPath = detectChromiumPath();
    context = await chromium.launchPersistentContext(tmpDir, {
      ...(execPath && { executablePath: execPath }),
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 900 },
      locale: 'en-US',
    });

    await context.addCookies(cookieList);
    const page = context.pages()[0] || (await context.newPage());

    const urlMap: Record<string, string> = {
      twitter: 'https://x.com/home',
      facebook: 'https://www.facebook.com/',
      reddit: 'https://old.reddit.com/',
      quora: 'https://www.quora.com/',
      youtube: 'https://www.youtube.com/',
      pinterest: 'https://www.pinterest.com/',
    };

    await page.goto(urlMap[platform] || urlMap.twitter, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const currentUrl = page.url();

    // Check if redirected to login or any challenge/verification page
    const loginPatterns = [
      '/login', '/i/flow/login', '/accounts/login', '/register',
      '/i/flow/suspended', '/i/flow/consent', '/account/access',
      '/i/flow/verify', '/challenge', '/checkpoint',
    ];
    const isLoggedOut = loginPatterns.some(p => currentUrl.includes(p));

    if (isLoggedOut) {
      await context.close();
      return { success: false, loggedIn: false, message: 'Cookies invalid or expired — redirected to login page' };
    }

    // Platform-specific identity extraction
    let username = '';
    let displayName = '';
    let accountId = '';

    if (platform === 'twitter') {
      // Extra Twitter-specific check: verify the user is actually logged in by checking
      // for the profile link in the sidebar (not just URL check)
      username = await page.evaluate(() => {
        const link = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]') as HTMLAnchorElement | null;
        if (link?.href) return link.href.split('/').filter(Boolean).pop() || '';
        return '';
      }).catch(() => '');

      // If no profile link found, Twitter might be showing a logged-out state
      // even at /home (e.g., bot detection challenge rendered client-side)
      if (!username) {
        const isActuallyLoggedOut = await page.evaluate(() => {
          // Check for login button in the sidebar
          const loginBtn = document.querySelector('a[href="/login"]');
          const signupBtn = document.querySelector('a[href="/i/flow/login"]');
          return !!(loginBtn || signupBtn);
        }).catch(() => false);

        if (isActuallyLoggedOut) {
          await context.close();
          return { success: false, loggedIn: false, message: 'Cookies invalid — Twitter shows login prompt' };
        }
      }

      displayName = await page.evaluate(() => {
        const switcher = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
        if (switcher) {
          for (const span of switcher.querySelectorAll('span')) {
            const t = span.textContent?.trim();
            if (t && !t.startsWith('@')) return t;
          }
        }
        return '';
      }).catch(() => '');

      // Use both x.com and twitter.com cookies to ensure nothing is missed
      const [xCookies, twitterCookies] = await Promise.all([
        context.cookies('https://x.com'),
        context.cookies('https://twitter.com'),
      ]);
      // Merge, deduplicating by name+domain
      const cookieSet = new Map<string, typeof xCookies[0]>();
      for (const c of [...twitterCookies, ...xCookies]) {
        cookieSet.set(`${c.name}:${c.domain}`, c);
      }
      const cookies2 = Array.from(cookieSet.values());

      const twid = cookies2.find(c => c.name === 'twid')?.value || '';
      const twitterUserId = twid ? decodeURIComponent(twid).replace('u=', '') : '';
      accountId = username ? `tw_${username}` : `tw_${twitterUserId || userId}`;

      // Save verified cookies to MongoDB
      console.log(`[worker:${WORKER_ID}] Saving ${platform} cookies to DB (${cookies2.length} cookies)...`);
      await saveCookies(userId, platform, cookies2, { accountId, username, displayName, verified: true });
      console.log(`[worker:${WORKER_ID}] ${platform} cookies saved to DB`);
    } else if (platform === 'facebook') {
      username = await page.evaluate(() => {
        const link = document.querySelector('a[href*="/profile"]') as HTMLAnchorElement | null;
        return link?.textContent?.trim() || '';
      }).catch(() => '');
      accountId = `fb_${username || userId}`;
      const cookies2 = await context.cookies();
      await saveCookies(userId, platform, cookies2, { accountId, username, displayName: username, verified: true });
    } else if (platform === 'reddit') {
      username = await page.evaluate(() => {
        const el = document.querySelector('.user a') || document.querySelector('#header-bottom-right .user a');
        return el?.textContent?.trim() || '';
      }).catch(() => '');
      accountId = `rd_${username || userId}`;
      const cookies2 = await context.cookies();
      await saveCookies(userId, platform, cookies2, { accountId, username, displayName: username, verified: true });
    } else {
      // Generic handler for quora, youtube, pinterest
      accountId = `${platform.slice(0, 2)}_${userId}`;
      const cookies2 = await context.cookies();
      await saveCookies(userId, platform, cookies2, { accountId, username: '', displayName: '', verified: true });
    }

    await context.close();

    // Write cookies.json + .verified to profile dir so cron scripts can load them
    try {
      const profileDirRelative = `profiles/${userId}/${platform}`;
      const profileDirAbs = join(PROJECT_ROOT, profileDirRelative);
      mkdirSync(profileDirAbs, { recursive: true });
      const { writeFileSync } = await import('fs');

      // Write cookies.json from MongoDB (decrypted)
      const { loadCookies: loadCookiesFromDB } = await import('./lib/cookieStore');
      const dbCookies = await loadCookiesFromDB(userId, platform);
      if (dbCookies && dbCookies.length > 0) {
        writeFileSync(join(profileDirAbs, 'cookies.json'), JSON.stringify(dbCookies, null, 2));
      }

      // Write .verified identity file
      writeFileSync(join(profileDirAbs, '.verified'), JSON.stringify({
        loggedIn: true,
        accountId,
        username,
        displayName,
        ts: new Date().toISOString(),
      }));
    } catch (e) {
      console.error(`[worker:${WORKER_ID}] Failed to write profile files:`, (e as Error).message);
    }

    // Save to Settings.socialAccounts so dashboard reflects the connection
    try {
      const Settings = (await import('./models/Settings')).default;
      const profileDirRelative = `profiles/${userId}/${platform}`;
      let settings = await Settings.findOne({ userId });
      // Preserve original addedAt if this platform was already connected
      const existingAccount = (settings?.socialAccounts || []).find(
        (a: { platform: string }) => a.platform === platform
      );
      const newAccount = {
        id: accountId,
        platform,
        username: username || '',
        displayName: displayName || username || '',
        profileDir: profileDirRelative,
        accountIndex: 0,
        addedAt: existingAccount?.addedAt || new Date().toISOString(), // preserve original date
        active: true,
      };
      if (!settings) {
        settings = await Settings.create({ userId, companyName: '', companyDescription: '', socialAccounts: [newAccount] });
      } else {
        settings.socialAccounts = (settings.socialAccounts || []).filter(
          (a: { platform: string }) => a.platform !== platform
        );
        settings.socialAccounts.push(newAccount);
        await settings.save();
      }
    } catch (e) {
      console.error(`[worker:${WORKER_ID}] Failed to save account to settings:`, (e as Error).message);
    }

    return {
      success: true,
      loggedIn: true,
      accountId,
      username,
      displayName,
      message: `${platform} credentials verified — logged in as ${username || accountId}`,
    };
  } catch (err) {
    await context?.close().catch(() => {});
    return { success: false, error: (err as Error).message };
  } finally {
    // Clean up temp dir
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

// ── Scrape Handler ─────────────────────────────────────────────

async function handleScrape(data: ScrapeJob, jobId?: string) {
  // Import scraper dynamically to avoid loading heavy modules at startup
  const { runScraper } = await import('./lib/scraper');
  const result = await runScraper(data.platforms, data.userId);

  // Chain an evaluate-posts job on completion
  try {
    await enqueueJob({
      type: 'evaluate-posts',
      userId: data.userId,
      scrapeJobId: jobId,
    });
  } catch (err) {
    console.error(`[worker:${WORKER_ID}] Failed to chain evaluate-posts job: ${(err as Error).message}`);
  }

  return result;
}

// ── Evaluate Posts Handler ─────────────────────────────────────

async function handleEvaluatePosts(data: EvaluatePostsJob) {
  await connectDB();
  const Settings = (await import('./models/Settings')).default;
  const Post = (await import('./models/Post')).default;
  const { evaluatePost } = await import('./lib/openclaw');

  const settings = await Settings.findOne({ userId: data.userId });
  if (!settings) {
    return { evaluated: 0, skipped: 0, errors: ['Settings not configured — evaluation skipped'] };
  }

  const summary = { evaluated: 0, skipped: 0, autoApproved: 0, errors: [] as string[] };
  const newPosts = await Post.find({ userId: data.userId, status: 'new' }).limit(20);

  if (newPosts.length === 0) return summary;

  // Batch mark all as 'evaluating' in one DB call
  const postIds = newPosts.map(p => p._id);
  await Post.updateMany({ _id: { $in: postIds } }, { $set: { status: 'evaluating' } });

  // Evaluate in parallel (max 5 concurrent AI calls to avoid rate limits)
  const CONCURRENCY = 5;
  for (let i = 0; i < newPosts.length; i += CONCURRENCY) {
    const batch = newPosts.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (post) => {
        const evaluation = await evaluatePost(
          post.content,
          settings.companyName,
          settings.companyDescription,
          settings.promptTemplate || undefined,
        );
        return { postId: post._id, evaluation };
      })
    );

    // Batch collect updates
    const successOps: { updateOne: { filter: object; update: object } }[] = [];
    const failIds: typeof postIds = [];

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      const post = batch[j];
      if (result.status === 'fulfilled') {
        const { evaluation } = result.value;
        successOps.push({
          updateOne: {
            filter: { _id: post._id },
            update: {
              $set: {
                status: 'evaluated',
                aiReply: evaluation.suggestedReply,
                aiRelevanceScore: evaluation.score,
                aiTone: evaluation.tone,
                aiReasoning: evaluation.reasoning,
                evaluatedAt: new Date(),
              },
            },
          },
        });
        summary.evaluated++;
      } else {
        failIds.push(post._id);
        summary.errors.push(`Evaluate post ${post._id}: ${result.reason?.message || 'Unknown error'}`);
        summary.skipped++;
      }
    }

    // Batch write successes and failures
    if (successOps.length > 0) await Post.bulkWrite(successOps);
    if (failIds.length > 0) await Post.updateMany({ _id: { $in: failIds } }, { $set: { status: 'new' } });
  }

  return summary;
}

// ── Post Reply Handler ─────────────────────────────────────────

async function handlePostReply(data: PostReplyJob) {
  await connectDB();
  const Post = (await import('./models/Post')).default;
  const post = await Post.findById(data.postId);
  if (!post) return { error: 'Post not found' };
  if (post.userId !== data.userId) return { error: 'Unauthorized' };

  if (data.platform === 'reddit') {
    const { postRedditComment } = await import('./lib/reddit');
    const result = await postRedditComment(post.url, post.aiReply);
    if (result.success) {
      await Post.findByIdAndUpdate(data.postId, { status: 'posted', postedAt: new Date() });
    }
    return result;
  } else if (data.platform === 'facebook') {
    const { postComment } = await import('./lib/facebook');
    const result = await postComment(post.url, post.aiReply);
    if (result.success) {
      await Post.findByIdAndUpdate(data.postId, { status: 'posted', postedAt: new Date() });
    }
    return result;
  }

  return { error: `Platform ${data.platform} not supported for queue posting` };
}

// ── Cron Run Handler ───────────────────────────────────────────

async function handleCronRun(data: CronRunJob): Promise<{ started: boolean; platform: string }> {
  const { runCronForPlatform } = await import('./lib/cronRunner');
  const result = await runCronForPlatform(data.platform, data.userId, data.mode || 'full');
  if (!result.success) {
    console.log(`[worker:${WORKER_ID}] Cron ${data.platform}: ${result.message}`);
  }
  return { started: true, platform: data.platform };
}

// ── Worker Setup ───────────────────────────────────────────────

const worker = new Worker(
  'browser-tasks',
  async (job: Job<BrowserJobData>) => {
    await connectDB();
    const data = job.data;

    console.log(`[worker:${WORKER_ID}] Processing job ${job.id}: ${data.type} (user: ${data.userId})`);

    try {
      switch (data.type) {
        case 'validate-cookies':
          return await handleValidateTwitter(data);
        case 'scrape':
          return await handleScrape(data, job.id);
        case 'post-reply':
          return await handlePostReply(data);
        case 'cron-run':
          return await handleCronRun(data);
        case 'evaluate-posts':
          return await handleEvaluatePosts(data);
        default:
          throw new Error(`Unknown job type: ${(data as { type: string }).type}`);
      }
    } finally {
      await releaseUserSlot(data.userId);
    }
  },
  {
    connection: new IORedis(REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: false }),
    concurrency: CONCURRENCY,
    limiter: {
      max: CONCURRENCY,
      duration: 1000, // max N jobs started per second
    },
    stalledInterval: 60000, // check for stalled jobs every 60s (default: 30s)
    maxStalledCount: 2,     // retry stalled jobs up to 2 times
  },
);

worker.on('completed', (job) => {
  console.log(`[worker:${WORKER_ID}] Job ${job.id} (${job.name}) completed`);
});

worker.on('failed', (job, err) => {
  console.error(`[worker:${WORKER_ID}] Job ${job?.id} (${job?.name}) failed: ${err.message}`);
});

worker.on('error', (err) => {
  console.error(`[worker:${WORKER_ID}] Worker error:`, err.message);
});

worker.on('stalled', (jobId) => {
  console.warn(`[worker:${WORKER_ID}] Job ${jobId} stalled — will be retried automatically`);
});

// ── Graceful Shutdown ─────────────────────────────────────────
let isShuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[worker:${WORKER_ID}] ${signal} received — closing gracefully (${SHUTDOWN_TIMEOUT / 1000}s timeout)...`);

  // Force-kill timer
  const forceTimer = setTimeout(() => {
    console.error(`[worker:${WORKER_ID}] Shutdown timeout — force exiting`);
    process.exit(1);
  }, SHUTDOWN_TIMEOUT);
  forceTimer.unref();

  try {
    // Stop accepting new jobs, wait for current jobs to finish
    await worker.close();
    console.log(`[worker:${WORKER_ID}] Worker closed — all jobs finished`);
  } catch (err) {
    console.error(`[worker:${WORKER_ID}] Error during worker close:`, (err as Error).message);
  }

  try {
    const mongoose = await import('mongoose');
    await mongoose.default.disconnect();
    console.log(`[worker:${WORKER_ID}] MongoDB disconnected`);
  } catch {}

  clearTimeout(forceTimer);
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

console.log(`[worker:${WORKER_ID}] Browser-tasks worker ready and listening for jobs`);
