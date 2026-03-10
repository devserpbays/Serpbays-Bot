import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { join } from 'path';
import { getAuthUserId } from '@/lib/apiAuth';
import { connectDB } from '@/lib/mongodb';
import Settings from '@/models/Settings';
import { checkPlanLimit } from '@/lib/featureGate';
import { checkRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

const PLATFORM_SCRIPTS: Record<string, string> = {
  twitter:   'scripts/twitter-cron.ts',
  facebook:  'scripts/fb-comment-cron.ts',
  reddit:    'scripts/reddit-cron.ts',
  quora:     'scripts/quora-cron.ts',
  pinterest: 'scripts/pinterest-cron.ts',
  youtube:   'scripts/youtube-cron.ts',
};

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  const rl = checkRateLimit(userId, 'scrape');
  if (rl) return NextResponse.json({ error: rl.error }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const platform = body.platform as string;

  if (!platform || !PLATFORM_SCRIPTS[platform]) {
    return NextResponse.json(
      { error: `Unknown platform. Valid: ${Object.keys(PLATFORM_SCRIPTS).join(', ')}` },
      { status: 400 },
    );
  }

  // Enforce cron scheduling plan limit
  const blocked = await checkPlanLimit(userId, 'cronScheduling');
  if (blocked) return blocked;

  const scriptPath = join(process.cwd(), PLATFORM_SCRIPTS[platform]);

  // Load user's social accounts to pass per-user profile dir env vars
  const profileDirEnv: Record<string, string> = {};
  try {
    await connectDB();
    const settings = await Settings.findOne({ userId });
    const accounts = settings?.socialAccounts ?? [];
    const PLATFORM_ENV_KEYS: Record<string, string> = {
      twitter:   'TWITTER_PROFILE_DIR',
      reddit:    'REDDIT_PROFILE_DIR',
      facebook:  'FACEBOOK_PROFILE_DIR',
      quora:     'QUORA_PROFILE_DIR',
      youtube:   'YOUTUBE_PROFILE_DIR',
      pinterest: 'PINTEREST_PROFILE_DIR',
    };
    for (const acc of accounts) {
      const envKey = PLATFORM_ENV_KEYS[acc.platform];
      if (envKey && acc.profileDir) profileDirEnv[envKey] = acc.profileDir;
    }
  } catch { /* non-fatal */ }

  const child = spawn('npx', ['tsx', scriptPath], {
    cwd: process.cwd(),
    env: { ...process.env, CRON_USER_ID: userId, CRON_MANUAL: '1', ...profileDirEnv },
    stdio: 'inherit',
    detached: true,
  });
  child.unref();

  console.log(`[run-cron] Manually triggered ${platform} cron for user ${userId} (pid: ${child.pid})`);

  return NextResponse.json({ started: true, platform, pid: child.pid });
}
