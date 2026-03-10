import { NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/apiAuth';
import { getUserPlan } from '@/lib/subscription';
import { connectDB } from '@/lib/mongodb';
import Post from '@/models/Post';
import Settings from '@/models/Settings';

export const dynamic = 'force-dynamic';

export async function GET() {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  await connectDB();
  const plan = await getUserPlan(userId);

  // Today's post count per platform
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayPosts = await Post.aggregate([
    { $match: { userId, status: 'posted', postedAt: { $gte: todayStart } } },
    { $group: { _id: '$platform', count: { $sum: 1 } } },
  ]);

  const postsByPlatform: Record<string, number> = {};
  let totalToday = 0;
  for (const p of todayPosts) {
    postsByPlatform[p._id] = p.count;
    totalToday += p.count;
  }

  // Connected platforms count
  const settings = await Settings.findOne({ userId }).lean();
  const connectedPlatforms = (settings?.platforms || []).length;
  const connectedAccounts = (settings?.socialAccounts || []).filter(
    (a: { active?: boolean }) => a.active !== false
  ).length;

  // Total keywords
  const totalKeywords = (settings?.keywords || []).length;

  return NextResponse.json({
    plan: plan.plan,
    status: plan.status,
    limits: plan.limits,
    currentPeriodEnd: plan.currentPeriodEnd,
    cancelAtPeriodEnd: plan.cancelAtPeriodEnd,
    usage: {
      postsByPlatform,
      totalPostsToday: totalToday,
      connectedPlatforms,
      connectedAccounts,
      totalKeywords,
    },
  });
}
