/**
 * Multi-user master cron runner with parallel batch processing.
 *
 * Runs platform cron scripts for all active users concurrently in batches.
 * Twitter tasks (HTTP-only posting) get higher concurrency than browser tasks.
 *
 * Usage:
 *   npx tsx scripts/master-cron.ts [platform] [--mode=scrape|post|full]
 *
 * Env vars:
 *   MAX_CONCURRENT_TASKS=8    — total concurrent cron tasks (default 8)
 *   MAX_BROWSER_TASKS=3       — max browser-requiring tasks at once (default 3)
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { connectDB } from '../src/lib/mongodb';
import Settings from '../src/models/Settings';
import BrowserCookie from '../src/models/BrowserCookie';
import { isWithinSchedule } from '../src/lib/schedule';
import { checkAndNotifyCookieExpiry } from '../src/lib/cookieExpiryChecker';
import { cronStart, cronFinish } from '../src/lib/cronState';
import { spawn } from 'child_process';
import { join } from 'path';

const ALL_PLATFORMS = ['twitter', 'reddit', 'facebook', 'quora', 'youtube', 'pinterest'] as const;

// Twitter posting is HTTP-only (no browser), others need Chromium
const HTTP_ONLY_PLATFORMS = new Set(['twitter']);

const PLATFORM_SCRIPTS: Record<string, string> = {
  twitter:   'scripts/twitter-cron.ts',
  facebook:  'scripts/fb-comment-cron.ts',
  reddit:    'scripts/reddit-cron.ts',
  quora:     'scripts/quora-cron.ts',
  pinterest: 'scripts/pinterest-cron.ts',
  youtube:   'scripts/youtube-cron.ts',
};

const PLATFORM_ENV_KEYS: Record<string, string> = {
  twitter:   'TWITTER_PROFILE_DIR',
  reddit:    'REDDIT_PROFILE_DIR',
  facebook:  'FACEBOOK_PROFILE_DIR',
  quora:     'QUORA_PROFILE_DIR',
  youtube:   'YOUTUBE_PROFILE_DIR',
  pinterest: 'PINTEREST_PROFILE_DIR',
};

const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT_TASKS || '8', 10);
const MAX_BROWSER = parseInt(process.env.MAX_BROWSER_TASKS || '3', 10);
const INTER_PLATFORM_GAP_MS = 30 * 1000; // 30s gap between platforms per user (was 2 min — too slow, caused hour-long gaps)

// Timezone pool for auto-assigning consistent per-account timezones
const TIMEZONE_POOL = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Toronto', 'Europe/London', 'Australia/Sydney', 'Asia/Kolkata', 'Asia/Singapore',
];

// --- Semaphore for controlling concurrency ---
class Semaphore {
  private current = 0;
  private queue: Array<() => void> = [];

  constructor(private max: number) {}

  async acquire(): Promise<void> {
    if (this.current < this.max) {
      this.current++;
      return;
    }
    await new Promise<void>(resolve => this.queue.push(resolve));
    this.current++;
  }

  release(): void {
    this.current--;
    const next = this.queue.shift();
    if (next) next();
  }

  get active(): number { return this.current; }
}

interface CronTask {
  userId: string;
  platform: string;
  profileDirEnv: Record<string, string>;
  needsBrowser: boolean;
  mode: string;
}

const TASK_TIMEOUT_MS = 12 * 60 * 1000; // 12 min max per platform task

// Run a cron script for a specific user+platform
async function runCronForUser(
  task: CronTask,
): Promise<{ userId: string; platform: string; exitCode: number; durationMs: number }> {
  // Register cron start in Redis so pipeline page shows accurate last-run time
  let entryId = '';
  try { entryId = await cronStart(task.platform, 'auto', task.userId); } catch { /* best effort */ }

  return new Promise((resolve) => {
    const start = Date.now();
    let settled = false;
    const scriptPath = join(process.cwd(), PLATFORM_SCRIPTS[task.platform]);

    const child = spawn('npx', ['tsx', scriptPath, ...(task.mode !== 'full' ? [`--mode=${task.mode}`] : [])], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        CRON_USER_ID: task.userId,
        ...task.profileDirEnv,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d) => { stdout += d.toString(); });
    child.stderr?.on('data', (d) => { stderr += d.toString(); });

    // 12-minute timeout — kill if stuck
    const timeout = setTimeout(async () => {
      if (!settled) {
        settled = true;
        child.kill('SIGTERM');
        setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 5000);
        const msg = `Cron timed out after ${TASK_TIMEOUT_MS / 1000}s`;
        console.warn(`[${task.userId.slice(-8)}/${task.platform}] ${msg}`);
        try { await cronFinish(entryId, task.platform, 1, msg, task.userId); } catch {}
        resolve({ userId: task.userId, platform: task.platform, exitCode: 1, durationMs: Date.now() - start });
      }
    }, TASK_TIMEOUT_MS);

    child.on('close', async (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const durationMs = Date.now() - start;
      const lines = (stdout + stderr).trim().split('\n');
      const summary = lines.slice(-3).join(' | ');
      if (code !== 0 && stderr) {
        console.error(`[${task.userId.slice(-8)}/${task.platform}] FAILED (${code}): ${summary}`);
      }
      try { await cronFinish(entryId, task.platform, code ?? 1, summary.slice(0, 200), task.userId); } catch {}
      resolve({ userId: task.userId, platform: task.platform, exitCode: code ?? 1, durationMs });
    });

    child.on('error', async (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      console.error(`[master-cron] Spawn error ${task.platform}/${task.userId}:`, err.message);
      try { await cronFinish(entryId, task.platform, 1, err.message.slice(0, 200), task.userId); } catch {}
      resolve({ userId: task.userId, platform: task.platform, exitCode: 1, durationMs: Date.now() - start });
    });
  });
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  const args = process.argv.slice(2);
  const requestedPlatform = args.find(a => !a.startsWith('--')) || null;
  const modeArg = args.find(a => a.startsWith('--mode='));
  const mode = modeArg?.split('=')[1] || 'full';

  if (requestedPlatform && !PLATFORM_SCRIPTS[requestedPlatform]) {
    console.error(`Unknown platform: ${requestedPlatform}. Valid: ${Object.keys(PLATFORM_SCRIPTS).join(', ')}`);
    process.exit(1);
  }

  console.log(`[${new Date().toISOString()}] Master Cron: starting | platform: ${requestedPlatform || 'all'} | mode: ${mode} | concurrency: ${MAX_CONCURRENT} (browser: ${MAX_BROWSER})`);

  await connectDB();

  const allSettings = await Settings.find({
    userId: { $exists: true, $nin: [null, ''] },
    autoPostingPaused: { $ne: true },
  }).lean();

  // Auto-assign cronJitterSeconds to users that don't have it yet (0–840s = 0–14min)
  const jitterUpdates = allSettings
    .filter(s => (s as any).cronJitterSeconds == null)
    .map(s => Settings.updateOne(
      { userId: s.userId },
      { $set: { cronJitterSeconds: Math.floor(Math.random() * 840) } }
    ));
  if (jitterUpdates.length > 0) {
    await Promise.all(jitterUpdates);
    console.log(`[master-cron] Auto-assigned cron jitter to ${jitterUpdates.length} users`);
    // Re-fetch to get the assigned values
    Object.assign(allSettings, await Settings.find({
      userId: { $exists: true, $nin: [null, ''] },
      autoPostingPaused: { $ne: true },
    }).lean());
  }

  // Load per-account assigned timezones from BrowserCookie
  const allUserIds = allSettings.map(s => s.userId as string).filter(Boolean);
  const cookieDocs = await BrowserCookie.find({ userId: { $in: allUserIds } }, {
    userId: 1, platform: 1, assignedTimezone: 1, proxyUrl: 1,
  }).lean();

  // Auto-assign timezone to accounts that don't have one
  const tzAssignUpdates: Promise<any>[] = [];
  for (const doc of cookieDocs) {
    const d = doc as any;
    if (!d.assignedTimezone) {
      const tz = TIMEZONE_POOL[Math.floor(Math.random() * TIMEZONE_POOL.length)];
      tzAssignUpdates.push(
        BrowserCookie.updateOne({ _id: d._id }, { $set: { assignedTimezone: tz } })
      );
      d.assignedTimezone = tz; // update in-memory too
    }
  }
  if (tzAssignUpdates.length > 0) {
    await Promise.all(tzAssignUpdates);
    console.log(`[master-cron] Auto-assigned timezones to ${tzAssignUpdates.length} accounts`);
  }

  // Build userId → platform → timezone map
  const tzMap = new Map<string, Map<string, string>>();
  for (const doc of cookieDocs) {
    const d = doc as any;
    if (!tzMap.has(d.userId)) tzMap.set(d.userId, new Map());
    if (d.assignedTimezone) tzMap.get(d.userId)!.set(d.platform, d.assignedTimezone);
  }

  // Build userId → jitter seconds map
  const jitterMap = new Map<string, number>();
  for (const s of allSettings) {
    jitterMap.set(s.userId as string, (s as any).cronJitterSeconds ?? 0);
  }

  if (allSettings.length === 0) {
    console.log('[master-cron] No active user settings found');
    process.exit(0);
  }

  // Build all tasks
  const tasks: CronTask[] = [];

  for (const settings of allSettings) {
    const userId = settings.userId as string;

    // Check user's cron schedule — skip if outside their configured hours/days
    // Only check schedule if user has explicitly set a timezone (otherwise run anytime)
    const userTz = (settings.cronTimezone as string) || '';
    const userStartHour = (settings.cronStartHour as number) ?? 9;
    const userEndHour = (settings.cronEndHour as number) ?? 18;
    const userDays = (settings.cronDays as number[]) ?? [0, 1, 2, 3, 4, 5, 6];

    if (userTz) {
      const inSchedule = isWithinSchedule({
        timezone: userTz,
        days: userDays,
        startHour: userStartHour,
        endHour: userEndHour,
      });
      if (!inSchedule) {
        console.log(`[master-cron] Skipping user ${userId.slice(-8)}: outside schedule (${userTz} ${userStartHour}:00-${userEndHour}:00)`);
        continue;
      }
    }

    // Check per-user cron interval — skip if last run was too recent
    const intervalMinutes = (settings.cronIntervalMinutes as number) || 15;
    const lastRun = settings.lastCronRunAt as Date | null;
    if (lastRun) {
      const msSinceLastRun = Date.now() - new Date(lastRun).getTime();
      const minSinceLastRun = msSinceLastRun / 60000;
      if (minSinceLastRun < intervalMinutes - 1) { // 1-min grace for cron drift
        console.log(`[master-cron] Skipping user ${userId.slice(-8)}: interval ${intervalMinutes}m, last run ${Math.round(minSinceLastRun)}m ago`);
        continue;
      }
    }

    const accounts = (settings.socialAccounts as Array<{ platform: string; profileDir?: string; active?: boolean }>) || [];
    const userTzMap = tzMap.get(userId) || new Map<string, string>();

    const profileDirEnv: Record<string, string> = {};
    for (const acc of accounts) {
      const envKey = PLATFORM_ENV_KEYS[acc.platform];
      if (envKey && acc.profileDir && acc.active !== false) {
        profileDirEnv[envKey] = acc.profileDir;
      }
      // Inject consistent timezone for this account
      const accTz = userTzMap.get(acc.platform);
      if (accTz) {
        profileDirEnv['ACCOUNT_TIMEZONE'] = accTz; // last platform's tz wins — typically same for a user
      }
    }

    // Only run platforms that have an active connected account
    const connectedPlatforms = new Set(
      accounts.filter(a => a.active !== false && a.profileDir).map(a => a.platform)
    );

    const userPlatforms = requestedPlatform
      ? (connectedPlatforms.has(requestedPlatform) ? [requestedPlatform] : [])
      : ALL_PLATFORMS.filter(p => connectedPlatforms.has(p));

    for (const platform of userPlatforms) {
      if (!PLATFORM_SCRIPTS[platform]) continue;
      // Skip if no profile dir env was set for this platform (no account connected)
      const envKey = PLATFORM_ENV_KEYS[platform];
      if (envKey && !profileDirEnv[envKey]) continue;
      tasks.push({
        userId,
        platform,
        profileDirEnv,
        needsBrowser: !HTTP_ONLY_PLATFORMS.has(platform),
        mode,
      });
    }
  }

  console.log(`[master-cron] ${allSettings.length} users, ${tasks.length} tasks queued`);

  if (tasks.length === 0) {
    process.exit(0);
  }

  // Run tasks with dual semaphore: total concurrency + browser concurrency
  const totalSem = new Semaphore(MAX_CONCURRENT);
  const browserSem = new Semaphore(MAX_BROWSER);

  let completed = 0;
  let failed = 0;
  const startTime = Date.now();

  // Group tasks by userId so platforms for the same user run sequentially
  const tasksByUser = new Map<string, typeof tasks>();
  for (const task of tasks) {
    if (!tasksByUser.has(task.userId)) tasksByUser.set(task.userId, []);
    tasksByUser.get(task.userId)!.push(task);
  }

  // Shuffle users to break alphabetical/registration-order burst patterns
  const shuffledUsers = [...tasksByUser.entries()].sort(() => Math.random() - 0.5);

  // Stagger: spread users across a fraction of the cron window so not all fire at once.
  // With 100 users and 15-min window → each user starts ~8 seconds after the previous.
  const STAGGER_MS = shuffledUsers.length > 1
    ? Math.min(15_000, Math.floor((13 * 60_000) / shuffledUsers.length))
    : 0;

  const userPromises = shuffledUsers.map(async ([userId, userTasks], idx) => {
    // Per-user jitter: deterministic offset so the same user always fires at ~the same
    // relative time within the cron window — prevents correlated bursts across runs.
    const storedJitterMs = (jitterMap.get(userId) ?? 0) * 1000;
    // Use stagger for the base spread, stored jitter adds fine-grained offset
    const totalDelay = idx * STAGGER_MS + Math.min(storedJitterMs % 30_000, 30_000);
    if (totalDelay > 0) await sleep(totalDelay);

    for (let i = 0; i < userTasks.length; i++) {
      const task = userTasks[i];
      await totalSem.acquire();
      if (task.needsBrowser) await browserSem.acquire();

      try {
        const result = await runCronForUser(task);
        completed++;
        if (result.exitCode !== 0) failed++;
        const status = result.exitCode === 0 ? 'OK' : `FAIL(${result.exitCode})`;
        const duration = (result.durationMs / 1000).toFixed(1);
        console.log(`[master-cron] [${completed}/${tasks.length}] ${task.userId.slice(-8)}/${task.platform}: ${status} (${duration}s)`);
      } finally {
        if (task.needsBrowser) browserSem.release();
        totalSem.release();
      }

      // Wait between platforms for this user (not after the last one)
      if (i < userTasks.length - 1) {
        console.log(`[master-cron] Waiting ${INTER_PLATFORM_GAP_MS / 1000}s before next platform for user ${task.userId.slice(-8)}...`);
        await sleep(INTER_PLATFORM_GAP_MS);
      }
    }
  });

  await Promise.all(userPromises);

  // Update lastCronRunAt for each user that had tasks
  const userIds = [...new Set(tasks.map(t => t.userId))];
  const now = new Date();
  await Promise.all(
    userIds.map(uid => Settings.updateOne({ userId: uid }, { $set: { lastCronRunAt: now } }))
  );

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[${new Date().toISOString()}] Master Cron: complete | ${completed} tasks in ${totalTime}s | ${failed} failed`);

  // Check for expired cookies and send email/WhatsApp notifications
  try {
    const expiryResult = await checkAndNotifyCookieExpiry();
    if (expiryResult.notified.length > 0) {
      console.log(`[master-cron] Cookie expiry notifications sent: ${expiryResult.notified.join(', ')}`);
    }
  } catch (err) {
    console.error('[master-cron] Cookie expiry check failed:', (err as Error).message);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
