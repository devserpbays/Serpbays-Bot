import { NextRequest, NextResponse } from 'next/server';
import { getExtensionUserId } from '@/lib/extensionAuth';
import { connectDB } from '@/lib/mongodb';
import Settings from '@/models/Settings';
import Post from '@/models/Post';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const userId = await getExtensionUserId(req);
  if (userId instanceof NextResponse) return userId;

  await connectDB();
  const settings = await Settings.findOne({ userId }).lean() as Record<string, unknown> | null;

  if (!settings) {
    return NextResponse.json({ ok: true, companyName: '', platforms: [], accounts: [], extensionPlatforms: [], pendingByPlatform: {} });
  }

  const extensionPlatforms = (settings.extensionPlatforms as string[]) || [];
  const socialAccounts = (settings.socialAccounts as Array<Record<string, unknown>>) || [];

  // Get pending task counts per platform
  const pendingByPlatform: Record<string, number> = {};
  if (extensionPlatforms.length > 0) {
    const freshCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    for (const platform of extensionPlatforms) {
      const thresholdKey = `${platform}AutoPostThreshold`;
      const threshold = (settings[thresholdKey] as number) ?? 70;
      const count = await Post.countDocuments({
        userId,
        platform,
        status: 'evaluated',
        aiRelevanceScore: { $gte: threshold },
        aiReply: { $exists: true, $ne: '' },
        postAttempts: { $not: { $gte: 3 } },
        scrapedAt: { $gte: freshCutoff },
      });
      pendingByPlatform[platform] = count;
    }
  }

  // Get today's posted counts (use user timezone)
  const tz = (settings.cronTimezone as string) || 'UTC';
  let todayStart: Date;
  try {
    const now = new Date();
    const userTime = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    todayStart = new Date(userTime);
    todayStart.setHours(0, 0, 0, 0);
    const offset = now.getTime() - userTime.getTime();
    todayStart = new Date(todayStart.getTime() + offset);
  } catch {
    todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
  }
  const postedByPlatform: Record<string, number> = {};
  for (const platform of extensionPlatforms) {
    postedByPlatform[platform] = await Post.countDocuments({
      userId, platform, status: 'posted',
      postedAt: { $gte: todayStart },
    });
  }

  return NextResponse.json({
    ok: true,
    companyName: settings.companyName || '',
    platforms: settings.platforms || [],
    extensionPlatforms,
    extensionMode: settings.extensionMode || false,
    accounts: socialAccounts.map(a => ({
      id: a.id,
      platform: a.platform,
      username: a.username || '',
      displayName: a.displayName || '',
      active: a.active !== false,
    })),
    pendingByPlatform,
    postedByPlatform,
  });
}
