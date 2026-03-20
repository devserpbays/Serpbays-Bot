import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/apiAuth';
import { checkPlanLimit } from '@/lib/featureGate';
import { checkRateLimit } from '@/lib/rateLimit';
import { enqueueJob, stopPipelineJobs } from '@/lib/queue';
import { forceStopCron } from '@/lib/cronState';

export const dynamic = 'force-dynamic';

const VALID_PLATFORMS = ['twitter', 'facebook', 'reddit', 'quora', 'pinterest', 'youtube'];

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  const rl = await checkRateLimit(userId, 'api');
  if (rl) return NextResponse.json({ error: rl.error }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const platform = body.platform as string;

  if (!platform || !VALID_PLATFORMS.includes(platform)) {
    return NextResponse.json(
      { error: `Unknown platform. Valid: ${VALID_PLATFORMS.join(', ')}` },
      { status: 400 },
    );
  }

  const blocked = await checkPlanLimit(userId, 'cronScheduling');
  if (blocked) return blocked;

  // 1. Stop any running/waiting jobs for this platform
  const stopped = await stopPipelineJobs(userId, platform);

  // 2. Force-stop cron state in Redis (releases lock + sets abort signal)
  await forceStopCron(platform, userId);

  // 3. Short pause to let the running process detect the abort signal
  await new Promise(r => setTimeout(r, 2500));

  // 4. Enqueue a fresh cron-run job
  const jobId = await enqueueJob(
    { type: 'cron-run', userId, platform, mode: 'manual' },
    { priority: 1 }, // Highest priority for restart
  );

  console.log(`[restart-cron] Restarted ${platform} for user ${userId} (stopped ${stopped} jobs, new jobId: ${jobId})`);

  return NextResponse.json({ restarted: true, platform, jobId, stopped });
}
