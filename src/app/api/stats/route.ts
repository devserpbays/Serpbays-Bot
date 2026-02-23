import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Post from '@/models/Post';

export async function GET() {
  await connectDB();

  const statuses = ['new', 'evaluating', 'evaluated', 'approved', 'rejected', 'posted'] as const;

  const [total, ...counts] = await Promise.all([
    Post.countDocuments({}),
    ...statuses.map(s => Post.countDocuments({ status: s })),
  ]);

  const byStatus: Record<string, number> = {};
  statuses.forEach((s, i) => { byStatus[s] = counts[i]; });

  // Per-platform totals + posted counts
  const platforms = ['facebook', 'twitter', 'reddit', 'linkedin', 'quora'] as const;
  const platformCounts = await Promise.all([
    ...platforms.map(p => Post.countDocuments({ platform: p })),
    ...platforms.map(p => Post.countDocuments({ platform: p, status: 'posted' })),
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
