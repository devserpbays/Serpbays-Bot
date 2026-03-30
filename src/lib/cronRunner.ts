/**
 * Inline cron runner — handles cookie loading from MongoDB,
 * writes them to disk for platform scripts, then spawns the script.
 * Ensures cronFinish is always called (even on crash).
 */

import { connectDB } from './mongodb';
import { loadCookies, getCookieMeta } from './cookieStore';
import { readCronStatus, cronStart, cronFinish } from './cronState';
import { logActivity, notifyAuthError, notifyNotConnected } from './activityLog';
import { getRedis } from './redis';
import Settings from '@/models/Settings';
import { spawn } from 'child_process';
import { join, resolve } from 'path';
import { mkdirSync, writeFileSync } from 'fs';

const PROJECT_ROOT = resolve(__dirname, '..', '..');
const CRON_TIMEOUT_MS = 12 * 60 * 1000; // 12 min max per cron run (was 8 — too short for upvote + browse)

const PLATFORM_SCRIPTS: Record<string, string> = {
  twitter: 'scripts/twitter-cron.ts',
  facebook: 'scripts/fb-comment-cron.ts',
  reddit: 'scripts/reddit-cron.ts',
  quora: 'scripts/quora-cron.ts',
  pinterest: 'scripts/pinterest-cron.ts',
  youtube: 'scripts/youtube-cron.ts',
};

const PLATFORM_ENV_KEYS: Record<string, string> = {
  twitter: 'TWITTER_PROFILE_DIR',
  reddit: 'REDDIT_PROFILE_DIR',
  facebook: 'FACEBOOK_PROFILE_DIR',
  quora: 'QUORA_PROFILE_DIR',
  youtube: 'YOUTUBE_PROFILE_DIR',
  pinterest: 'PINTEREST_PROFILE_DIR',
};

/**
 * Run a cron job for a specific platform and user.
 * 1. Loads cookies from MongoDB and writes to disk
 * 2. Spawns the platform cron script with proper env
 * 3. Guarantees cronFinish is called on success, failure, or timeout
 */
export async function runCronForPlatform(
  platform: string,
  userId: string,
  mode: string = 'full',
): Promise<{ success: boolean; message: string }> {
  // Check if already running (the platform script manages its own lock + cronStart/cronFinish)
  const statusMap = await readCronStatus();
  if (statusMap[`${userId}:${platform}`]?.running) {
    return { success: false, message: `Cron already running for ${platform}` };
  }

  let exitCode = 0;
  let message = '';
  let entryId = '';

  try {
    // Mark as running in Redis before spawning (cronFinish called below)
    entryId = await cronStart(platform, mode === 'manual' ? 'manual' : 'auto', userId);

    await connectDB();

    const settings = await Settings.findOne({ userId });
    if (!settings) {
      message = 'No settings configured';
      exitCode = 1;
      await cronFinish(entryId, platform, 1, message, userId).catch(() => {});
      return { success: false, message };
    }

    if (!settings.companyName) {
      message = 'No company name configured';
      exitCode = 1;
      await logActivity(userId, platform, 'error', 'config_error', message);
      await cronFinish(entryId, platform, 1, message, userId).catch(() => {});
      return { success: false, message };
    }

    // Check cookies exist in DB
    const cookieMeta = await getCookieMeta(userId, platform);
    if (!cookieMeta) {
      // Never connected — no BrowserCookie document at all
      message = `${platform} account not connected`;
      exitCode = 1;
      await logActivity(userId, platform, 'warn', 'not_connected', `${platform} is enabled but no account has been connected yet`);
      await notifyNotConnected(userId, platform);
      await cronFinish(entryId, platform, 1, message, userId).catch(() => {});
      return { success: false, message };
    }
    if (!cookieMeta.verified) {
      // BrowserCookie exists but verification failed
      message = `${platform} cookies not verified`;
      exitCode = 1;
      await logActivity(userId, platform, 'error', 'auth_error', message);
      await notifyAuthError(userId, platform, message);
      await cronFinish(entryId, platform, 1, message, userId).catch(() => {});
      return { success: false, message };
    }

    // Load cookies from MongoDB and write to disk for the cron script
    const cookies = await loadCookies(userId, platform);
    if (!cookies || cookies.length === 0) {
      message = `No cookies found for ${platform}`;
      exitCode = 1;
      await logActivity(userId, platform, 'error', 'auth_error', message);
      await notifyAuthError(userId, platform, message);
      await cronFinish(entryId, platform, 1, message, userId).catch(() => {});
      return { success: false, message };
    }

    const profileDir = `profiles/${userId}/${platform}`;
    const profileDirAbs = join(PROJECT_ROOT, profileDir);
    mkdirSync(profileDirAbs, { recursive: true });

    // Extend expiry of short-lived cookies (CSRF tokens, session tokens) that would
    // expire before the cron script finishes — set them to 90 days so the browser
    // accepts them. Real session validity is checked by the platform itself.
    const sixHoursFromNow = Math.floor(Date.now() / 1000) + 6 * 3600;
    const ninetyDaysFromNow = Math.floor(Date.now() / 1000) + 90 * 24 * 3600;
    const cookiesForDisk = (cookies as Array<Record<string, unknown>>).map(c => {
      const exp = Number(c.expires || c.expirationDate || 0);
      if (exp > 0 && exp < sixHoursFromNow) {
        return { ...c, expires: ninetyDaysFromNow, expirationDate: ninetyDaysFromNow };
      }
      return c;
    });
    writeFileSync(join(profileDirAbs, 'cookies.json'), JSON.stringify(cookiesForDisk, null, 2));

    // Ensure .verified exists
    const verifiedPath = join(profileDirAbs, '.verified');
    writeFileSync(verifiedPath, JSON.stringify({
      loggedIn: true,
      accountId: cookieMeta.accountId || '',
      username: cookieMeta.username || '',
      displayName: cookieMeta.displayName || '',
      ts: new Date().toISOString(),
    }));

    // Build env for the cron script
    const scriptPath = PLATFORM_SCRIPTS[platform];
    if (!scriptPath) {
      message = `No cron script for ${platform}`;
      exitCode = 1;
      await cronFinish(entryId, platform, 1, message, userId).catch(() => {});
      return { success: false, message };
    }

    const envKey = PLATFORM_ENV_KEYS[platform];
    const env = {
      ...process.env,
      CRON_USER_ID: userId,
      ...(mode === 'manual' ? { CRON_MANUAL: '1' } : {}),
      ...(envKey ? { [envKey]: profileDir } : {}),
    };

    // Spawn with timeout + abort signal support
    const result = await spawnWithTimeout(
      join(PROJECT_ROOT, scriptPath),
      env,
      CRON_TIMEOUT_MS,
      userId,
      platform,
    );

    exitCode = result.code;
    message = result.code === 0
      ? `${platform} cron completed`
      : result.stderr.slice(0, 300) || `Cron exited with code ${result.code}`;

    // Always update cron state — this is the reliable path (scripts' process.on('exit') can't run async)
    await cronFinish(entryId, platform, exitCode, message, userId).catch(() => {});

    if (result.code === 0) {
      await logActivity(userId, platform, 'info', 'cron_end', message);
    } else {
      await logActivity(userId, platform, 'error', 'cron_error', message);
      const authKeywords = ['auth', 'cookie', 'expired', 'login', 'session'];
      if (authKeywords.some(kw => message.toLowerCase().includes(kw))) {
        await notifyAuthError(userId, platform, message);
      }
    }

    return { success: result.code === 0, message };
  } catch (err) {
    exitCode = 1;
    message = (err as Error).message;
    await cronFinish(entryId, platform, 1, message, userId).catch(() => {});
    await logActivity(userId, platform, 'error', 'cron_error', `Cron failed: ${message}`).catch(() => { });
    return { success: false, message };
  }
}

function spawnWithTimeout(
  scriptPath: string,
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
  userId?: string,
  platform?: string,
): Promise<{ code: number; stderr: string }> {
  return new Promise((resolvePromise) => {
    const child = spawn('npx', ['tsx', scriptPath], {
      cwd: PROJECT_ROOT,
      env,
      stdio: 'pipe',
    });

    let stderr = '';
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });

    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 5000);
        resolvePromise({ code: 1, stderr: `Cron timed out after ${timeoutMs / 1000}s` });
      }
    }, timeoutMs);

    // Poll Redis abort signal every 5s so user can stop stuck jobs
    let abortInterval: ReturnType<typeof setInterval> | null = null;
    if (userId && platform) {
      const abortKey = `cron:abort:${userId}:${platform}`;
      abortInterval = setInterval(async () => {
        try {
          const redis = getRedis();
          const val = await redis.get(abortKey);
          if (val && !settled) {
            settled = true;
            clearTimeout(timeout);
            if (abortInterval) clearInterval(abortInterval);
            child.kill('SIGTERM');
            setTimeout(() => { try { child.kill('SIGKILL'); } catch { } }, 3000);
            await redis.del(abortKey);
            resolvePromise({ code: 1, stderr: 'Stopped by user' });
          }
        } catch { /* Redis down — skip check */ }
      }, 2000); // Poll every 2s for faster stop response
    }

    child.on('close', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        if (abortInterval) clearInterval(abortInterval);
        resolvePromise({ code: code ?? 1, stderr });
      }
    });

    child.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        if (abortInterval) clearInterval(abortInterval);
        resolvePromise({ code: 1, stderr: err.message });
      }
    });
  });
}
