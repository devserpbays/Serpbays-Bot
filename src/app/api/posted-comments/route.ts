import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Post from '@/models/Post';
import { getAuthUserId } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

const ALL_PLATFORMS = ['twitter', 'facebook', 'reddit', 'quora', 'pinterest', 'youtube'];

export async function GET(req: NextRequest) {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  await connectDB();

  const { searchParams } = req.nextUrl;
  const platform = searchParams.get('platform') || null;
  const filter = searchParams.get('filter') || 'all'; // 'today' | 'all'
  const limit = Math.min(parseInt(searchParams.get('limit') || '200'), 500);

  const query: Record<string, unknown> = { status: 'posted', userId };
  if (platform) {
    query.platform = platform;
  } else {
    query.platform = { $in: ALL_PLATFORMS };
  }

  if (filter === 'today') {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    query.postedAt = { $gte: todayStart };
  }

  const posts = await Post.find(query)
    .sort({ postedAt: -1 })
    .limit(limit)
    .lean();

  return NextResponse.json({ posts, total: posts.length });
}
