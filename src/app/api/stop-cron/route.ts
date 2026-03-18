import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/apiAuth';
import { stopPipelineJobs } from '@/lib/queue';
import { forceStopCron, forceStopAllCrons } from '@/lib/cronState';

export const dynamic = 'force-dynamic';

const VALID_PLATFORMS = ['twitter', 'facebook', 'reddit', 'quora', 'pinterest', 'youtube'];

export async function POST(req: NextRequest) {
    const userId = await getAuthUserId();
    if (userId instanceof NextResponse) return userId;

    const body = await req.json().catch(() => ({}));
    const platform = body.platform as string;

    if (platform === 'all') {
        // 1. Cancel/remove ALL pipeline jobs (scrape, evaluate, cron-run) for this user
        const stopped = await stopPipelineJobs(userId);

        // 2. Force-stop cron state for ALL platforms
        await forceStopAllCrons(userId);

        console.log(`[stop-cron] Stopped ALL jobs for user ${userId} (${stopped} queue jobs cancelled)`);
        return NextResponse.json({ stopped: true, platform: 'all', jobsCancelled: stopped });
    }

    if (!platform || !VALID_PLATFORMS.includes(platform)) {
        return NextResponse.json(
            { error: `Unknown platform. Valid: ${VALID_PLATFORMS.join(', ')}` },
            { status: 400 },
        );
    }

    // 1. Cancel/remove BullMQ jobs for this user+platform
    const stopped = await stopPipelineJobs(userId, platform);

    // 2. Force-stop cron state in Redis (status, log, lock, abort signal)
    await forceStopCron(platform, userId);

    console.log(`[stop-cron] Stopped ${platform} cron for user ${userId} (${stopped} queue jobs cancelled)`);

    return NextResponse.json({ stopped: true, platform, jobsCancelled: stopped });
}
