import { NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/apiAuth';
import { checkRateLimit } from '@/lib/rateLimit';
import { enqueueJob } from '@/lib/queue';

export async function POST() {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  const rl = await checkRateLimit(userId, 'scrape');
  if (rl) return NextResponse.json({ error: rl.error }, { status: 429 });

  // Enqueue scrape job — worker chains evaluate-posts automatically
  const jobId = await enqueueJob({ type: 'scrape', userId });

  return NextResponse.json({ jobId, message: 'Pipeline queued' }, { status: 202 });
}
