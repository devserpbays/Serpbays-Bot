import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/apiAuth';
import { checkPlanLimit } from '@/lib/featureGate';
import { checkRateLimit } from '@/lib/rateLimit';
import { enqueueJob } from '@/lib/queue';

export const dynamic = 'force-dynamic';

const VALID_PLATFORMS = ['twitter', 'facebook', 'reddit', 'quora', 'pinterest', 'youtube'];

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  const rl = await checkRateLimit(userId, 'scrape');
  if (rl) return NextResponse.json({ error: rl.error }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const platform = body.platform as string;

  if (!platform || !VALID_PLATFORMS.includes(platform)) {
    return NextResponse.json(
      { error: `Unknown platform. Valid: ${VALID_PLATFORMS.join(', ')}` },
      { status: 400 },
    );
  }

  // Enforce cron scheduling plan limit
  const blocked = await checkPlanLimit(userId, 'cronScheduling');
  if (blocked) return blocked;

  // Enqueue to BullMQ instead of spawning a child process
  const jobId = await enqueueJob(
    { type: 'cron-run', userId, platform, mode: 'manual' },
    { priority: 2 }, // Higher priority than scheduled cron (which defaults to plan-based)
  );

  console.log(`[run-cron] Enqueued ${platform} cron for user ${userId} (jobId: ${jobId})`);

  return NextResponse.json({ started: true, platform, jobId });
}
