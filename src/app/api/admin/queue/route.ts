import { NextResponse } from 'next/server';
import { getAdminUserId } from '@/lib/adminAuth';
import { getBrowserQueue } from '@/lib/queue';

export async function GET() {
  const adminId = await getAdminUserId();
  if (adminId instanceof NextResponse) return adminId;

  const queue = getBrowserQueue();

  const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
    queue.isPaused(),
  ]);

  // Get recent jobs for visibility
  const [recentCompleted, recentFailed, activeJobs, waitingJobs] = await Promise.all([
    queue.getCompleted(0, 10),
    queue.getFailed(0, 10),
    queue.getActive(0, 10),
    queue.getWaiting(0, 10),
  ]);

  const formatJob = (j: { id?: string | null; name: string; data: Record<string, unknown>; timestamp: number; finishedOn?: number | null; failedReason?: string; processedOn?: number | null }) => ({
    id: j.id,
    type: j.name,
    userId: (j.data?.userId as string)?.slice(-8) || '?',
    platform: j.data?.platform || j.data?.type,
    createdAt: j.timestamp ? new Date(j.timestamp).toISOString() : null,
    finishedAt: j.finishedOn ? new Date(j.finishedOn).toISOString() : null,
    processedAt: j.processedOn ? new Date(j.processedOn).toISOString() : null,
    failedReason: j.failedReason || undefined,
  });

  // Worker health: check if jobs are being processed
  const oldestActive = activeJobs.length > 0
    ? Math.min(...activeJobs.map(j => j.timestamp || Date.now()))
    : null;
  const stalledWarning = oldestActive && (Date.now() - oldestActive) > 300000; // > 5min

  return NextResponse.json({
    counts: { waiting, active, completed, failed, delayed },
    paused,
    health: {
      stalledWarning: !!stalledWarning,
      oldestActiveAge: oldestActive ? Math.round((Date.now() - oldestActive) / 1000) : null,
    },
    recentCompleted: recentCompleted.map(formatJob),
    recentFailed: recentFailed.map(formatJob),
    activeJobs: activeJobs.map(formatJob),
    waitingJobs: waitingJobs.map(formatJob),
  });
}

/** POST /api/admin/queue — queue management actions */
export async function POST(req: Request) {
  const adminId = await getAdminUserId();
  if (adminId instanceof NextResponse) return adminId;

  const { action } = await req.json();
  const queue = getBrowserQueue();

  switch (action) {
    case 'pause':
      await queue.pause();
      return NextResponse.json({ ok: true, message: 'Queue paused' });
    case 'resume':
      await queue.resume();
      return NextResponse.json({ ok: true, message: 'Queue resumed' });
    case 'clean-completed':
      await queue.clean(0, 1000, 'completed');
      return NextResponse.json({ ok: true, message: 'Completed jobs cleaned' });
    case 'clean-failed':
      await queue.clean(0, 1000, 'failed');
      return NextResponse.json({ ok: true, message: 'Failed jobs cleaned' });
    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }
}
