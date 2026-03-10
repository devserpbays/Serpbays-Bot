import { NextRequest, NextResponse } from 'next/server';
import { runScraper } from '@/lib/scraper';
import { getAuthUserId } from '@/lib/apiAuth';
import { checkRateLimit } from '@/lib/rateLimit';

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  const rl = checkRateLimit(userId, 'scrape');
  if (rl) return NextResponse.json({ error: rl.error }, { status: 429 });

  try {
    const body = await req.json().catch(() => ({}));
    const platforms = body.platforms as string[] | undefined;
    const result = await runScraper(platforms, userId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
