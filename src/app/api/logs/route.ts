import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import ActivityLog from '@/models/ActivityLog';
import { getAuthUserId } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  await connectDB();

  const { searchParams } = new URL(req.url);
  const level = searchParams.get('level');
  const platform = searchParams.get('platform');
  const limit = Math.min(parseInt(searchParams.get('limit') || '200', 10), 500);

  const since = searchParams.get('since');

  const query: Record<string, unknown> = { userId };
  if (level && level !== 'all') query.level = level;
  if (platform && platform !== 'all') query.platform = platform;
  if (since) query.createdAt = { $gt: new Date(since) };

  const logs = await ActivityLog.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return NextResponse.json({
    logs: logs.map((l: any) => ({
      _id: l._id,
      platform: l.platform,
      level: l.level,
      action: l.action,
      message: l.message,
      meta: l.meta,
      timestamp: l.createdAt,
    })),
  });
}
