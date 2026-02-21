import { NextRequest, NextResponse } from 'next/server';
import { runScraper } from '@/lib/scraper';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const platforms = body.platforms as string[] | undefined;
    const result = await runScraper(platforms);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
