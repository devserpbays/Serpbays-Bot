import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import { getAdminUserId } from '@/lib/adminAuth';
import Post from '@/models/Post';
import Settings from '@/models/Settings';
import Subscription from '@/models/Subscription';

export async function GET() {
  const adminId = await getAdminUserId();
  if (adminId instanceof NextResponse) return adminId;

  await connectDB();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);
  weekStart.setHours(0, 0, 0, 0);

  // Get distinct user IDs from Settings
  const distinctUsers: string[] = await Settings.distinct('userId');
  const totalUsers = distinctUsers.filter(Boolean).length;

  // Post counts — only posted comments, never scraped/evaluated
  const [totalPosts, postsToday, postsThisWeek] = await Promise.all([
    Post.countDocuments({ status: 'posted' }),
    Post.countDocuments({ postedAt: { $gte: todayStart }, status: 'posted' }),
    Post.countDocuments({ postedAt: { $gte: weekStart }, status: 'posted' }),
  ]);

  // Posts by platform — only posted
  const platformAgg = await Post.aggregate([
    { $match: { status: 'posted' } },
    { $group: { _id: '$platform', count: { $sum: 1 } } },
  ]);
  const postsByPlatform: Record<string, number> = {};
  for (const p of platformAgg) {
    postsByPlatform[p._id || 'unknown'] = p.count;
  }

  // Subscription breakdown
  const subAgg = await Subscription.aggregate([
    { $group: { _id: '$plan', count: { $sum: 1 } } },
  ]);
  const subscriptionBreakdown: Record<string, number> = { free: 0, pro: 0, business: 0 };
  for (const s of subAgg) {
    subscriptionBreakdown[s._id] = s.count;
  }
  // Users without a subscription record are on free
  const usersWithSub = subAgg.reduce((sum: number, s: { count: number }) => sum + s.count, 0);
  subscriptionBreakdown.free += Math.max(0, totalUsers - usersWithSub);

  // Active users today (users who have posted today)
  const activeToday = await Post.distinct('userId', {
    postedAt: { $gte: todayStart },
    status: 'posted',
  });

  // New users this week
  const newUsersThisWeek = await Settings.countDocuments({
    createdAt: { $gte: weekStart },
  });

  return NextResponse.json({
    totalUsers,
    totalPosts,
    postsToday,
    postsThisWeek,
    postsByPlatform,
    subscriptionBreakdown,
    activeUsersToday: activeToday.length,
    newUsersThisWeek,
  });
}
