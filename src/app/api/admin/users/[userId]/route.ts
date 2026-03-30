import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import { getAdminUserId } from '@/lib/adminAuth';
import { clerkClient } from '@clerk/nextjs/server';
import Post from '@/models/Post';
import Settings from '@/models/Settings';
import Subscription from '@/models/Subscription';
import ActivityLog from '@/models/ActivityLog';
import Notification from '@/models/Notification';

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
    Post.find({ userId, status: 'posted' }).sort({ postedAt: -1 }).limit(20).lean(),
    ActivityLog.find({ userId }).sort({ createdAt: -1 }).limit(30).lean(),
  ]);

  if (!settings) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // Post stats
  const totalPosts = await Post.countDocuments({ userId });
  const postedCount = await Post.countDocuments({ userId, status: 'posted' });

  // Fetch email and name from Clerk
  let email = '';
  let fullName = '';
  try {
    const client = await clerkClient();
    const clerkUser = await client.users.getUser(userId);
    email = clerkUser.emailAddresses?.[0]?.emailAddress || '';
    fullName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ');
  } catch { /* Clerk fetch failure */ }

  const s = settings as unknown as { isAdmin?: boolean; blockedUntil?: Date | null };
  const blockedUntil = s.blockedUntil ? new Date(s.blockedUntil) : null;
  const isBlocked = !!(blockedUntil && blockedUntil > new Date());

  return NextResponse.json({
    settings,
    subscription: subscription || { plan: 'free', status: 'active' },
    recentPosts,
    recentLogs,
    totalPosts,
    postedCount,
    isAdmin: s.isAdmin === true,
    isBlocked,
    blockedUntil: blockedUntil?.toISOString() || null,
    email,
    fullName,
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

  const { plan, status, isAdmin, block, unblock } = body;

  // Block user for N days (default 30)
  if (block === true) {
    const days = typeof body.days === 'number' ? body.days : 30;
    const blockedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    await Settings.updateOne({ userId }, { $set: { blockedUntil, autoPostingPaused: true } });
    return NextResponse.json({ success: true, blockedUntil: blockedUntil.toISOString() });
  }

  // Unblock user
  if (unblock === true) {
    await Settings.updateOne({ userId }, { $set: { blockedUntil: null, autoPostingPaused: false } });
    return NextResponse.json({ success: true });
  }

  // Toggle admin flag on Settings
  if (typeof isAdmin === 'boolean') {
    await Settings.updateOne({ userId }, { $set: { isAdmin } }, { upsert: false });
  }

  // Update subscription plan/status if provided
  if (plan || status) {
    let subscription = await Subscription.findOne({ userId });
    if (!subscription) {
      subscription = new Subscription({ userId, plan: plan || 'free', status: status || 'active' });
    } else {
      if (plan) subscription.plan = plan;
      if (status) subscription.status = status;
    }
    await subscription.save();
    return NextResponse.json({ success: true, subscription });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const adminId = await getAdminUserId();
  if (adminId instanceof NextResponse) return adminId;

  const { userId } = await params;
  await connectDB();

  // Delete all user data from every collection
  await Promise.all([
    Settings.deleteOne({ userId }),
    Subscription.deleteOne({ userId }),
    Post.deleteMany({ userId }),
    ActivityLog.deleteMany({ userId }),
    Notification.deleteMany({ userId }),
  ]);

  // Delete user from Clerk (removes login access entirely)
  try {
    const client = await clerkClient();
    await client.users.deleteUser(userId);
  } catch (e) {
    console.warn('Could not delete Clerk user:', (e as Error).message);
    // Non-fatal — DB data is already removed
  }

  return NextResponse.json({ success: true, deleted: userId });
}
