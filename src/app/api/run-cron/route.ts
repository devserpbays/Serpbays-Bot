import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { join } from 'path';

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
  const body = await req.json().catch(() => ({}));
  const platform = body.platform as string;

  if (!platform || !PLATFORM_SCRIPTS[platform]) {
    return NextResponse.json(
      { error: `Unknown platform. Valid: ${Object.keys(PLATFORM_SCRIPTS).join(', ')}` },
      { status: 400 },
    );
  }

  const scriptPath = join(process.cwd(), PLATFORM_SCRIPTS[platform]);

  // Fire and forget — cron script manages its own cronStart/cronFinish
  const child = spawn('npx', ['tsx', scriptPath], {
    cwd: process.cwd(),
    env: { ...process.env },
    stdio: 'inherit',
    detached: true,
  });
  child.unref();

  console.log(`[run-cron] Manually triggered ${platform} cron (pid: ${child.pid})`);

  return NextResponse.json({ started: true, platform, pid: child.pid });
}
