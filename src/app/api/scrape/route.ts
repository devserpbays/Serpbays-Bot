import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/apiAuth';
import { checkRateLimit } from '@/lib/rateLimit';
import { enqueueJob } from '@/lib/queue';

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  const rl = await checkRateLimit(userId, 'scrape');
  if (rl) return NextResponse.json({ error: rl.error }, { status: 429 });

  try {
    const body = await req.json().catch(() => ({}));
    const platforms = body.platforms as string[] | undefined;

    // Enqueue to BullMQ worker instead of running Playwright in Next.js process
    const jobId = await enqueueJob(
      { type: 'scrape', userId, platforms },
      { priority: 2 },
    );

    return NextResponse.json({ started: true, jobId });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
