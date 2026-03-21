import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { connectDB } from '@/lib/mongodb';
import Post from '@/models/Post';
import TwitterFollowed from '@/models/TwitterFollowed';

const LIST_LIMIT = 15;

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await connectDB();

  const { searchParams } = new URL(req.url);
  const list = searchParams.get('list'); // 'liked' | 'retweeted' | 'bookmarked' | 'followed'
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const skip = (page - 1) * LIST_LIMIT;

  // ── List mode: return paginated rows ─────────────────────────────────────
  if (list === 'liked' || list === 'retweeted' || list === 'bookmarked') {
    const field = list === 'liked' ? 'likedByBot' : list === 'retweeted' ? 'retweetedByBot' : 'bookmarkedByBot';
    const filter = { userId, platform: 'twitter', [field]: true };
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

  if (list === 'followed') {
    const filter = { userId };
    const [total, follows] = await Promise.all([
      TwitterFollowed.countDocuments(filter),
      TwitterFollowed.find(filter)
        .sort({ followedAt: -1 })
        .skip(skip)
        .limit(LIST_LIMIT)
        .lean(),
    ]);
    return NextResponse.json({
      total,
      page,
      pages: Math.ceil(total / LIST_LIMIT),
      follows: follows.map((f: any) => ({
        id: f._id,
        handle: f.targetHandle,
        followedAt: f.followedAt,
        unfollowedAt: f.unfollowedAt,
        isFollowing: f.isFollowing,
      })),
    });
  }

  // ── Summary mode (default): counts + recent follows ───────────────────────
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [
    totalLiked, todayLiked,
    totalRetweeted, todayRetweeted,
    totalBookmarked,
    currentlyFollowing, totalUnfollowed,
    recentFollows,
  ] = await Promise.all([
    Post.countDocuments({ userId, platform: 'twitter', likedByBot: true }),
    Post.countDocuments({ userId, platform: 'twitter', likedByBot: true, updatedAt: { $gte: todayStart } }),
    Post.countDocuments({ userId, platform: 'twitter', retweetedByBot: true }),
    Post.countDocuments({ userId, platform: 'twitter', retweetedByBot: true, updatedAt: { $gte: todayStart } }),
    Post.countDocuments({ userId, platform: 'twitter', bookmarkedByBot: true }),
    TwitterFollowed.countDocuments({ userId, isFollowing: true }),
    TwitterFollowed.countDocuments({ userId, isFollowing: false }),
    TwitterFollowed.find({ userId, isFollowing: true }).sort({ followedAt: -1 }).limit(5).lean(),
  ]);

  return NextResponse.json({
    totalLiked, todayLiked,
    totalRetweeted, todayRetweeted,
    totalBookmarked,
    currentlyFollowing, totalUnfollowed,
    recentFollows: recentFollows.map((f: any) => ({
      handle: f.targetHandle,
      followedAt: f.followedAt,
    })),
  });
}
