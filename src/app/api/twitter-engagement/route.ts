import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { connectDB } from '@/lib/mongodb';
import Post from '@/models/Post';

const LIST_LIMIT = 15;

function buildDateCond(filter: string | null): Record<string, Date> | undefined {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (filter) {
    case 'today':     return { $gte: today } as any;
    case 'yesterday': { const y = new Date(today); y.setDate(y.getDate() - 1); return { $gte: y, $lt: today } as any; }
    case '7days':     { const d = new Date(today); d.setDate(d.getDate() - 6); return { $gte: d } as any; }
    case '15days':    { const d = new Date(today); d.setDate(d.getDate() - 14); return { $gte: d } as any; }
    case '30days':    { const d = new Date(today); d.setDate(d.getDate() - 29); return { $gte: d } as any; }
    default:          return undefined;
  }
}

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await connectDB();

  const { searchParams } = new URL(req.url);
  const list = searchParams.get('list'); // 'liked' | 'retweeted' | 'bookmarked' | 'followed'
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const timeFilter = searchParams.get('filter'); // 'today' | 'yesterday' | '7days' | '15days' | '30days' | 'all'
  const skip = (page - 1) * LIST_LIMIT;
  const dateCond = buildDateCond(timeFilter);

  // ── List mode: return paginated rows ─────────────────────────────────────
  if (list === 'liked' || list === 'retweeted' || list === 'bookmarked') {
    const field = list === 'liked' ? 'likedByBot' : list === 'retweeted' ? 'retweetedByBot' : 'bookmarkedByBot';
    const filter: Record<string, any> = { userId, platform: 'twitter', [field]: true };
    if (dateCond) filter.updatedAt = dateCond;
    const [total, posts] = await Promise.all([
      Post.countDocuments(filter),
      Post.find(filter)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(LIST_LIMIT)
        .select('url content author aiRelevanceScore updatedAt likedByBot retweetedByBot bookmarkedByBot')
        .lean(),
    ]);
    return NextResponse.json({
      total,
      page,
      pages: Math.ceil(total / LIST_LIMIT),
      posts: posts.map((p: any) => ({
        id: p._id,
        url: p.url,
        content: (p.content || '').slice(0, 200),
        author: p.author || '',
        score: p.aiRelevanceScore ?? null,
        updatedAt: p.updatedAt,
        liked: p.likedByBot,
        retweeted: p.retweetedByBot,
        bookmarked: p.bookmarkedByBot,
      })),
    });
  }

  // ── Summary mode (default): counts ────────────────────────────────────────
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [
    totalLiked, todayLiked,
    totalRetweeted, todayRetweeted,
    totalBookmarked,
  ] = await Promise.all([
    Post.countDocuments({ userId, platform: 'twitter', likedByBot: true }),
    Post.countDocuments({ userId, platform: 'twitter', likedByBot: true, updatedAt: { $gte: todayStart } }),
    Post.countDocuments({ userId, platform: 'twitter', retweetedByBot: true }),
    Post.countDocuments({ userId, platform: 'twitter', retweetedByBot: true, updatedAt: { $gte: todayStart } }),
    Post.countDocuments({ userId, platform: 'twitter', bookmarkedByBot: true }),
  ]);

  return NextResponse.json({
    totalLiked, todayLiked,
    totalRetweeted, todayRetweeted,
    totalBookmarked,
  });
}
