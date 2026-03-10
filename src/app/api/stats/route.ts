import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Post from '@/models/Post';
import { getAuthUserId } from '@/lib/apiAuth';

export async function GET() {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  await connectDB();

  const statuses = ['new', 'evaluating', 'evaluated', 'approved', 'rejected', 'posted'] as const;

  const [total, ...counts] = await Promise.all([
    Post.countDocuments({ userId }),
    ...statuses.map(s => Post.countDocuments({ userId, status: s })),
  ]);

  const byStatus: Record<string, number> = {};
  statuses.forEach((s, i) => { byStatus[s] = counts[i]; });

  const platforms = ['facebook', 'twitter', 'reddit', 'quora', 'youtube', 'pinterest'] as const;
  const platformCounts = await Promise.all([
    ...platforms.map(p => Post.countDocuments({ userId, platform: p })),
    ...platforms.map(p => Post.countDocuments({ userId, platform: p, status: 'posted' })),
  ]);

  const byPlatform: Record<string, number> = {};
  const postedByPlatform: Record<string, number> = {};
  platforms.forEach((p, i) => {
    byPlatform[p] = platformCounts[i];
    postedByPlatform[p] = platformCounts[platforms.length + i];
  });

  return NextResponse.json({
    total,
    byStatus,
    byPlatform,
    postedByPlatform,
  });
}
