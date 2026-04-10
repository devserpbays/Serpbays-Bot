import { NextRequest, NextResponse } from 'next/server';
import { getExtensionUserId } from '@/lib/extensionAuth';
import { connectDB } from '@/lib/mongodb';
import Settings from '@/models/Settings';
import Post from '@/models/Post';

export const dynamic = 'force-dynamic';

const MAX_PER_PLATFORM = 10; // Hard cap per platform per day

export async function GET(req: NextRequest) {
  const userId = await getExtensionUserId(req);
  if (userId instanceof NextResponse) return userId;

  await connectDB();
  const settings = await Settings.findOne({ userId }).lean() as Record<string, unknown> | null;

  if (!settings) {
    return NextResponse.json({ error: 'Settings not found' }, { status: 404 });
  }

  // Use user's timezone for "today" calculation
  const tz = (settings.cronTimezone as string) || 'UTC';
  let todayStart: Date;
  try {
    const now = new Date();
    const userTime = new Date(now.toLocaleString('en-US', { timeZone: tz }));
    todayStart = new Date(userTime);
    todayStart.setHours(0, 0, 0, 0);
    // Convert back to UTC for DB query
    const offset = now.getTime() - userTime.getTime();
    todayStart = new Date(todayStart.getTime() + offset);
  } catch {
    todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
  }

  // Per-platform settings + today's counts
  const platformLimits: Record<string, number> = {};
  const platformBrandRates: Record<string, number> = {};
  const platformThresholds: Record<string, number> = {};
  const platformCooldowns: Record<string, number> = {};
  const platformPostedToday: Record<string, number> = {};
  const platformLikedToday: Record<string, number> = {};

  for (const p of ['twitter', 'facebook', 'quora', 'reddit', 'youtube', 'pinterest', 'skool']) {
    const limit = (settings[`${p}DailyLimit`] as number) ?? 5;
    platformLimits[p] = Math.min(limit, MAX_PER_PLATFORM);
    platformBrandRates[p] = (settings[`${p}BrandMentionRate`] as number) ?? 25;
    platformThresholds[p] = (settings[`${p}AutoPostThreshold`] as number) ?? 70;
    platformCooldowns[p] = (settings[`${p}CooldownMinutes`] as number) ?? 60;

    platformPostedToday[p] = await Post.countDocuments({
      userId, platform: p, status: 'posted',
      postedAt: { $gte: todayStart },
    });
    platformLikedToday[p] = await Post.countDocuments({
      userId, platform: p, likedByBot: true,
      updatedAt: { $gte: todayStart },
    });
  }

  // Brand mention cap tracking
  const maxDailyBrandMentions = (settings.maxDailyBrandMentions as number) ?? 2;
  const companyLower = ((settings.companyName as string) || '').toLowerCase();
  const todayPosted = await Post.find({
    userId, status: 'posted', postedAt: { $gte: todayStart },
  }).select('aiReply editedReply').lean() as Record<string, unknown>[];
  const brandMentionsToday = companyLower
    ? todayPosted.filter(p => {
        const reply = ((p.editedReply || p.aiReply || '') as string).toLowerCase();
        return reply.includes(companyLower);
      }).length
    : 0;

  return NextResponse.json({
    companyName: settings.companyName || '',
    companyDescription: settings.companyDescription || '',
    platforms: settings.platforms || [],
    extensionPlatforms: settings.extensionPlatforms || [],
    extensionMode: settings.extensionMode || false,
    // Keywords
    keywords: settings.keywords || [],
    twitterKeywords: settings.twitterKeywords || [],
    facebookKeywords: settings.facebookKeywords || [],
    quoraKeywords: settings.quoraKeywords || [],
    redditKeywords: settings.redditKeywords || [],
    subreddits: settings.subreddits || [],
    facebookGroups: settings.facebookGroups || [],
    youtubeKeywords: settings.youtubeKeywords || [],
    pinterestKeywords: settings.pinterestKeywords || [],
    skoolKeywords: settings.skoolKeywords || [],
    skoolCommunities: settings.skoolCommunities || [],
    // Limits & rates
    platformLimits,
    platformBrandRates,
    platformThresholds,
    platformCooldowns,
    maxPerPlatform: MAX_PER_PLATFORM,
    // Schedule
    cronStartHour: (settings.cronStartHour as number) ?? 9,
    cronEndHour: (settings.cronEndHour as number) ?? 17,
    cronTimezone: settings.cronTimezone || '',
    // Today's counts per platform (server truth)
    platformPostedToday,
    platformLikedToday,
    // Brand mention cap
    brandMentionsToday,
    maxDailyBrandMentions,
  });
}
