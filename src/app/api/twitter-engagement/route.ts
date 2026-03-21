import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { connectDB } from '@/lib/mongodb';
import Post from '@/models/Post';
import TwitterFollowed from '@/models/TwitterFollowed';

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await connectDB();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [
    totalLiked,
    todayLiked,
    totalRetweeted,
    todayRetweeted,
    totalBookmarked,
    currentlyFollowing,
    totalUnfollowed,
    recentFollows,
  ] = await Promise.all([
    Post.countDocuments({ userId, platform: 'twitter', likedByBot: true }),
    Post.countDocuments({ userId, platform: 'twitter', likedByBot: true, updatedAt: { $gte: todayStart } }),
    Post.countDocuments({ userId, platform: 'twitter', retweetedByBot: true }),
    Post.countDocuments({ userId, platform: 'twitter', retweetedByBot: true, updatedAt: { $gte: todayStart } }),
    Post.countDocuments({ userId, platform: 'twitter', bookmarkedByBot: true }),
    TwitterFollowed.countDocuments({ userId, isFollowing: true }),
    TwitterFollowed.countDocuments({ userId, isFollowing: false }),
    TwitterFollowed.find({ userId, isFollowing: true })
      .sort({ followedAt: -1 })
      .limit(5)
      .lean(),
  ]);

  return NextResponse.json({
    totalLiked,
    todayLiked,
    totalRetweeted,
    todayRetweeted,
    totalBookmarked,
    currentlyFollowing,
    totalUnfollowed,
    recentFollows: recentFollows.map((f: any) => ({
      handle: f.targetHandle,
      followedAt: f.followedAt,
    })),
  });
}
