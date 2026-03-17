/**
 * Inline cron runner — handles cookie loading from MongoDB,
 * writes them to disk for platform scripts, then spawns the script.
 * Ensures cronFinish is always called (even on crash).
 */

import { connectDB } from './mongodb';
import { loadCookies, getCookieMeta } from './cookieStore';
import { cronStart, cronFinish, acquireCronLock, releaseCronLock } from './cronState';
import { logActivity, notifyAuthError } from './activityLog';
import Settings from '@/models/Settings';
import { spawn } from 'child_process';
import { join, resolve } from 'path';
import { mkdirSync, writeFileSync } from 'fs';

const PROJECT_ROOT = resolve(__dirname, '..', '..');
const CRON_TIMEOUT_MS = 5 * 60 * 1000; // 5 min max per cron run

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
  // Acquire lock
  const lockAcquired = await acquireCronLock(platform, userId);
  if (!lockAcquired) {
    return { success: false, message: `Cron already running for ${platform}` };
  }

  const cronId = await cronStart(platform, mode === 'manual' ? 'manual' : 'auto', userId);
  let exitCode = 0;
  let message = '';

  try {
    await connectDB();

    const settings = await Settings.findOne({ userId });
    if (!settings) {
      message = 'No settings configured';
      exitCode = 1;
      return { success: false, message };
    }

    if (!settings.companyName) {
      message = 'No company name configured';
      exitCode = 1;
      await logActivity(userId, platform, 'error', 'config_error', message);
      return { success: false, message };
    }

    // Check cookies exist in DB
    const cookieMeta = await getCookieMeta(userId, platform);
    if (!cookieMeta?.verified) {
      message = `No verified cookies for ${platform}`;
      exitCode = 1;
      await logActivity(userId, platform, 'error', 'auth_error', message);
      await notifyAuthError(userId, platform, message);
      return { success: false, message };
    }

    // Load cookies from MongoDB and write to disk for the cron script
    const cookies = await loadCookies(userId, platform);
    if (!cookies || cookies.length === 0) {
      message = `No cookies found for ${platform}`;
      exitCode = 1;
      await logActivity(userId, platform, 'error', 'auth_error', message);
      await notifyAuthError(userId, platform, message);
      return { success: false, message };
    }

    const profileDir = `profiles/${userId}/${platform}`;
    const profileDirAbs = join(PROJECT_ROOT, profileDir);
    mkdirSync(profileDirAbs, { recursive: true });
    writeFileSync(join(profileDirAbs, 'cookies.json'), JSON.stringify(cookies, null, 2));

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
      return { success: false, message };
    }

    const envKey = PLATFORM_ENV_KEYS[platform];
    const env = {
      ...process.env,
      CRON_USER_ID: userId,
      ...(mode === 'manual' ? { CRON_MANUAL: '1' } : {}),
      ...(envKey ? { [envKey]: profileDir } : {}),
    };

    // Spawn with timeout
    const result = await spawnWithTimeout(
      join(PROJECT_ROOT, scriptPath),
      env,
      CRON_TIMEOUT_MS,
    );

    exitCode = result.code;
    message = result.code === 0
      ? `${platform} cron completed`
      : result.stderr.slice(0, 300) || `Cron exited with code ${result.code}`;

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
    await logActivity(userId, platform, 'error', 'cron_error', `Cron failed: ${message}`).catch(() => {});
    return { success: false, message };
  } finally {
    // ALWAYS call cronFinish — this was the missing piece
    await cronFinish(cronId, platform, exitCode, message, userId).catch(() => {});
    await releaseCronLock(platform, userId).catch(() => {});
  }
}

function spawnWithTimeout(
  scriptPath: string,
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
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
        resolve({ code: 1, stderr: `Cron timed out after ${timeoutMs / 1000}s` });
      }
    }, timeoutMs);

    child.on('close', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve({ code: code ?? 1, stderr });
      }
    });

    child.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve({ code: 1, stderr: err.message });
      }
    });
  });
}
