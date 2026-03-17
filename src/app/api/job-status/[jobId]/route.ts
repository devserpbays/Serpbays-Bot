import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/apiAuth';
import { getJobStatus } from '@/lib/queue';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  const { jobId } = await params;
  const status = await getJobStatus(jobId);

  if (!status) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  // Only allow users to see their own jobs
  const jobData = status.data as { userId?: string };
  if (jobData?.userId && jobData.userId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json(status);
}
