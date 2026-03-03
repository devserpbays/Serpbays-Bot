import { NextRequest, NextResponse } from 'next/server';
import { readCronLog } from '@/lib/cronState';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const platform = searchParams.get('platform') || null;
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);

  let log = readCronLog();
  if (platform) log = log.filter(e => e.platform === platform);

  return NextResponse.json({ log: log.slice(0, limit), total: log.length });
}
