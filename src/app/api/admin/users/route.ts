import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import { getAdminUserId } from '@/lib/adminAuth';
import { clerkClient } from '@clerk/nextjs/server';
import Post from '@/models/Post';
import Settings from '@/models/Settings';
import Subscription from '@/models/Subscription';

export async function GET() {
  const adminId = await getAdminUserId();
  if (adminId instanceof NextResponse) return adminId;

  await connectDB();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Get all subscriptions
  const subscriptions = await Subscription.find({}).lean();
  const subMap = new Map<string, { plan: string; status: string; createdAt: Date }>();
  for (const sub of subscriptions) {
    const s = sub as unknown as { userId: string; plan: string; status: string; createdAt: Date };
    subMap.set(s.userId, { plan: s.plan, status: s.status, createdAt: s.createdAt });
  }

  // Get all settings
  const allSettings = await Settings.find({}, {
    userId: 1,
    companyName: 1,
    platforms: 1,
    socialAccounts: 1,
    isAdmin: 1,
    createdAt: 1,
  }).lean();

  // Get posted comment counts per user
  const postCountsAgg = await Post.aggregate([
    { $match: { status: 'posted' } },
    { $group: { _id: '$userId', total: { $sum: 1 } } },
  ]);
  const postCountMap = new Map<string, number>();
  for (const p of postCountsAgg) {
    postCountMap.set(p._id, p.total);
  }

  // Get posts today per user
  const postsTodayAgg = await Post.aggregate([
    { $match: { postedAt: { $gte: todayStart }, status: 'posted' } },
    { $group: { _id: '$userId', count: { $sum: 1 } } },
  ]);
  const postsTodayMap = new Map<string, number>();
  for (const p of postsTodayAgg) {
    postsTodayMap.set(p._id, p.count);
  }

  // Fetch emails from Clerk for all user IDs
  const allUserIds = allSettings.map(s => (s as unknown as { userId: string }).userId).filter(Boolean);
  const emailMap = new Map<string, string>();
  const nameMap = new Map<string, string>();
  try {
    const client = await clerkClient();
    const batchSize = 100;
    for (let i = 0; i < allUserIds.length; i += batchSize) {
      const batch = allUserIds.slice(i, i + batchSize);
      const { data: clerkUsers } = await client.users.getUserList({ userId: batch, limit: batchSize });
      for (const cu of clerkUsers) {
        const email = cu.emailAddresses?.[0]?.emailAddress || '';
        const fullName = [cu.firstName, cu.lastName].filter(Boolean).join(' ');
        emailMap.set(cu.id, email);
        nameMap.set(cu.id, fullName);
      }
    }
  } catch { /* Clerk fetch failure — emails will be empty */ }

  const users = allSettings.map((s) => {
    const settings = s as unknown as {
      userId: string;
      companyName: string;
      platforms: string[];
      socialAccounts: { id: string }[];
      isAdmin?: boolean;
      createdAt: Date;
    };
    const uid = settings.userId || '';
    const sub = subMap.get(uid);
    return {
      userId: uid,
      email: emailMap.get(uid) || '',
      fullName: nameMap.get(uid) || '',
      plan: sub?.plan || 'free',
      status: sub?.status || 'active',
      companyName: settings.companyName || '',
      platformCount: settings.platforms?.length || 0,
      platforms: settings.platforms || [],
      accountCount: settings.socialAccounts?.length || 0,
      totalPosts: postCountMap.get(uid) || 0,
      postsToday: postsTodayMap.get(uid) || 0,
      isAdmin: settings.isAdmin === true,
      createdAt: settings.createdAt || sub?.createdAt || null,
    };
  });

  // Sort by most recent first
  users.sort((a, b) => {
    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return dateB - dateA;
  });

  return NextResponse.json({ users });
}
