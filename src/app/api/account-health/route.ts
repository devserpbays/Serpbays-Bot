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

  // Aggregate real stats from Post collection — this is the source of truth
  // since BrowserCookie counters may be zeroed (new feature, no backfill).
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [postedAgg, failedAgg, recentAgg, lastPostedAgg] = await Promise.all([
    // Total successful posts per platform
    Post.aggregate([
      { $match: { userId, status: 'posted' } },
      { $group: { _id: '$platform', count: { $sum: 1 } } },
    ]),
    // Total "failed" attempts — only permanently failed posts (status:'failed', 3 attempts)
    // Excludes posts still queued for retry (evaluated/new with postAttempts > 0)
    Post.aggregate([
      { $match: { userId, status: 'failed' } },
      { $group: { _id: '$platform', count: { $sum: { $max: ['$postAttempts', 1] } } } },
    ]),
    // Posts in last 7 days
    Post.aggregate([
      { $match: { userId, status: 'posted', postedAt: { $gte: sevenDaysAgo } } },
      { $group: { _id: '$platform', count: { $sum: 1 } } },
    ]),
    // Most recent successful post date per platform
    Post.aggregate([
      { $match: { userId, status: 'posted', postedAt: { $exists: true } } },
      { $sort: { postedAt: -1 } },
      { $group: { _id: '$platform', lastPostedAt: { $first: '$postedAt' } } },
    ]),
  ]);

  const postedMap:     Record<string, number> = {};
  const failedMap:     Record<string, number> = {};
  const recentMap:     Record<string, number> = {};
  const lastPostedMap: Record<string, Date>   = {};

  for (const r of postedAgg)     postedMap[r._id]     = r.count;
  for (const r of failedAgg)     failedMap[r._id]     = r.count;
  for (const r of recentAgg)     recentMap[r._id]     = r.count;
  for (const r of lastPostedAgg) lastPostedMap[r._id] = r.lastPostedAt;

  const result = accounts.map((acc) => {
    const totalPosts  = postedMap[acc.platform]  ?? acc.totalPosts  ?? 0;
    const totalErrors = failedMap[acc.platform]  ?? acc.totalErrors ?? 0;
    // lastPostedAt: prefer live Post data; fall back to BrowserCookie
    const lastPostedAt = lastPostedMap[acc.platform] ?? acc.lastPostedAt ?? null;

    // Re-compute health with real Post-derived counters
    const health = computeHealthScore({
      totalPosts,
      totalErrors,
      errorCount:   acc.errorCount   ?? 0,
      backoffUntil: acc.backoffUntil ?? null,
      createdAt:    acc.createdAt,
      lastPostedAt,
      autoPaused:   acc.autoPaused   ?? false,
    });

    const computedScore = health.score;

    return {
      platform:     acc.platform,
      username:     acc.username    || '',
      displayName:  acc.displayName || '',
      accountId:    acc.accountId   || '',
      healthScore:  computedScore,
      status:       health.status,
      reasons:      health.reasons,
      autoPaused:   acc.autoPaused  ?? false,
      totalPosts,
      totalErrors,
      errorRate:    totalPosts > 0 ? Math.round((totalErrors / totalPosts) * 100) : 0,
      errorCount:   acc.errorCount  ?? 0,
      backoffUntil: acc.backoffUntil ?? null,
      lastPostedAt,
      lastErrorAt:  acc.lastErrorAt ?? null,
      connectedAt:  acc.createdAt   ?? null,
      recentPosts:  recentMap[acc.platform] ?? 0,
    };
  });

  // Sync computed scores back to BrowserCookie so platform page chips stay consistent
  await Promise.all(
    result.map((r) =>
      BrowserCookie.updateOne(
        { userId, platform: r.platform },
        {
          $set: {
            healthScore:  r.healthScore,
            totalPosts:   r.totalPosts,
            totalErrors:  r.totalErrors,
            lastPostedAt: r.lastPostedAt ?? undefined,
          },
        }
      )
    )
  );

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
