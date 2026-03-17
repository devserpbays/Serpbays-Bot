import { NextRequest, NextResponse } from 'next/server';
import { readCronLog } from '@/lib/cronState';
import { getAuthUserId } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;
  const { searchParams } = req.nextUrl;
  const platform = searchParams.get('platform') || null;
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);

  let log = await readCronLog();
  // Filter to show only this user's logs
  log = log.filter(e => e.userId === userId);
  if (platform) log = log.filter(e => e.platform === platform);

  return NextResponse.json({ log: log.slice(0, limit), total: log.length });
}
