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
  const [fbTotal, twTotal, rdTotal, fbPosted, twPosted, rdPosted] = await Promise.all([
    Post.countDocuments({ platform: 'facebook' }),
    Post.countDocuments({ platform: 'twitter' }),
    Post.countDocuments({ platform: 'reddit' }),
    Post.countDocuments({ platform: 'facebook', status: 'posted' }),
    Post.countDocuments({ platform: 'twitter', status: 'posted' }),
    Post.countDocuments({ platform: 'reddit', status: 'posted' }),
  ]);

  return NextResponse.json({
    total,
    byStatus,
    byPlatform: { facebook: fbTotal, twitter: twTotal, reddit: rdTotal },
    postedByPlatform: { facebook: fbPosted, twitter: twPosted, reddit: rdPosted },
  });
}
