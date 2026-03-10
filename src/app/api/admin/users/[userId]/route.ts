import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import { getAdminUserId } from '@/lib/adminAuth';
import Post from '@/models/Post';
import Settings from '@/models/Settings';
import Subscription from '@/models/Subscription';
import ActivityLog from '@/models/ActivityLog';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const adminId = await getAdminUserId();
  if (adminId instanceof NextResponse) return adminId;

  const { userId } = await params;
  await connectDB();

  const [settings, subscription, recentPosts, recentLogs] = await Promise.all([
    Settings.findOne({ userId }).lean(),
    Subscription.findOne({ userId }).lean(),
    Post.find({ userId }).sort({ createdAt: -1 }).limit(20).lean(),
    ActivityLog.find({ userId }).sort({ createdAt: -1 }).limit(30).lean(),
  ]);

  if (!settings) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // Post stats
  const totalPosts = await Post.countDocuments({ userId });
  const postedCount = await Post.countDocuments({ userId, status: 'posted' });

  return NextResponse.json({
    settings,
    subscription: subscription || { plan: 'free', status: 'active' },
    recentPosts,
    recentLogs,
    totalPosts,
    postedCount,
    isAdmin: settings.isAdmin === true,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const adminId = await getAdminUserId();
  if (adminId instanceof NextResponse) return adminId;

  const { userId } = await params;
  const body = await req.json();
  await connectDB();

  const { plan, status, isAdmin } = body;

  // Toggle admin flag on Settings
  if (typeof isAdmin === 'boolean') {
    await Settings.updateOne({ userId }, { $set: { isAdmin } }, { upsert: false });
  }

  // Update subscription plan/status if provided
  if (plan || status) {
    let subscription = await Subscription.findOne({ userId });
    if (!subscription) {
      subscription = new Subscription({
        userId,
        plan: plan || 'free',
        status: status || 'active',
      });
    } else {
      if (plan) subscription.plan = plan;
      if (status) subscription.status = status;
    }
    await subscription.save();
    return NextResponse.json({ success: true, subscription });
  }

  return NextResponse.json({ success: true });
}
