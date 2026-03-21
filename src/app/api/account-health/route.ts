import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import { getAuthUserId } from '@/lib/apiAuth';
import BrowserCookie from '@/models/BrowserCookie';
import Post from '@/models/Post';
import { computeHealthScore } from '@/lib/accountHealth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  await connectDB();

  const accounts = await BrowserCookie.find({ userId }).lean();

  // Last 7 days post counts per platform
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentPosts = await Post.aggregate([
    { $match: { userId, status: 'posted', postedAt: { $gte: sevenDaysAgo } } },
    { $group: { _id: '$platform', count: { $sum: 1 } } },
  ]);
  const recentMap: Record<string, number> = {};
  for (const r of recentPosts) recentMap[r._id] = r.count;

  const result = accounts.map((acc) => {
    const health = computeHealthScore(acc as Parameters<typeof computeHealthScore>[0]);
    return {
      platform:     acc.platform,
      username:     acc.username || '',
      displayName:  acc.displayName || '',
      accountId:    acc.accountId || '',
      healthScore:  acc.healthScore ?? 100,
      status:       health.status,
      reasons:      health.reasons,
      autoPaused:   acc.autoPaused ?? false,
      totalPosts:   acc.totalPosts ?? 0,
      totalErrors:  acc.totalErrors ?? 0,
      errorRate:    (acc.totalPosts ?? 0) > 0
        ? Math.round(((acc.totalErrors ?? 0) / (acc.totalPosts ?? 1)) * 100)
        : 0,
      errorCount:   acc.errorCount ?? 0,
      backoffUntil: acc.backoffUntil ?? null,
      lastPostedAt: acc.lastPostedAt ?? null,
      lastErrorAt:  acc.lastErrorAt ?? null,
      connectedAt:  acc.createdAt ?? null,
      recentPosts:  recentMap[acc.platform] ?? 0,
    };
  });

  // Summary counts
  const summary = {
    healthy:  result.filter((a) => a.status === 'healthy').length,
    warning:  result.filter((a) => a.status === 'warning').length,
    critical: result.filter((a) => a.status === 'critical').length,
    paused:   result.filter((a) => a.autoPaused).length,
    total:    result.length,
  };

  return NextResponse.json({ accounts: result, summary });
}

// POST — manually resume an auto-paused account
export async function POST(req: NextRequest) {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  await connectDB();

  const body = await req.json().catch(() => ({}));
  const { platform } = body as { platform?: string };

  if (!platform) {
    return NextResponse.json({ error: 'platform required' }, { status: 400 });
  }

  const acc = await BrowserCookie.findOne({ userId, platform });
  if (!acc) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  // Re-compute health after manual resume — give it a 50-point floor
  const newScore = Math.max(50, acc.healthScore ?? 50);
  await BrowserCookie.updateOne(
    { _id: acc._id },
    { $set: { autoPaused: false, healthScore: newScore, errorCount: 0, backoffUntil: null } }
  );

  return NextResponse.json({ success: true, platform, healthScore: newScore });
}
