import { NextRequest, NextResponse } from 'next/server';
import { getExtensionUserId } from '@/lib/extensionAuth';
import { connectDB } from '@/lib/mongodb';
import Post from '@/models/Post';
import Settings from '@/models/Settings';

export const dynamic = 'force-dynamic';

const MAX_PER_PLATFORM = 10; // Hard cap per platform per day

// Probability of comment vs upvote-only per platform
const COMMENT_RATE: Record<string, number> = {
  twitter: 0.5,
  facebook: 0.5,
  quora: 0.4,
  reddit: 0.8,    // Reddit upvote fails in minimized windows — prefer comments
  youtube: 0.4,
  pinterest: 0.3,
  skool: 0.5,
};

export async function GET(req: NextRequest) {
  const userId = await getExtensionUserId(req);
  if (userId instanceof NextResponse) return userId;

  await connectDB();

  const settings = await Settings.findOne({ userId }).lean() as Record<string, unknown> | null;
  if (!settings) return NextResponse.json({ tasks: [], dailyStatus: {} });

  const extensionPlatforms = (settings.extensionPlatforms as string[]) || settings.platforms || [];
  if (extensionPlatforms.length === 0) return NextResponse.json({ tasks: [], dailyStatus: {} });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const freshCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentPosted = await Post.find({
    userId, status: 'posted',
    postedAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
  }).select('url author').lean();

  const recentUrls = new Set(recentPosted.map((p: Record<string, unknown>) => p.url));
  const recentAuthors = new Set(recentPosted.map((p: Record<string, unknown>) => p.author).filter(Boolean));

  interface TaskOut {
    id: string;
    platform: string;
    action: string;
    url: string;
    text: string;
    score: number;
  }
  const tasks: TaskOut[] = [];
  const dailyStatus: Record<string, { posted: number; limit: number; limitHit: boolean }> = {};

  for (const platform of extensionPlatforms) {
    const thresholdKey = `${platform}AutoPostThreshold`;
    const threshold = (settings[thresholdKey] as number) ?? 70;

    // Per-platform daily limit (user setting, capped at MAX_PER_PLATFORM)
    const userLimit = (settings[`${platform}DailyLimit`] as number) ?? 5;
    const platformLimit = Math.min(userLimit, MAX_PER_PLATFORM);

    // Count ALL posts today for this platform (cron + extension combined)
    const platformPostedToday = await Post.countDocuments({
      userId, platform, status: 'posted',
      postedAt: { $gte: todayStart },
    });

    const platformLimitHit = platformPostedToday >= platformLimit;
    dailyStatus[platform] = { posted: platformPostedToday, limit: platformLimit, limitHit: platformLimitHit };

    // Candidate pool for both comment and like tasks. We DO NOT exclude
    // posts where likedByBot=true here — a post that's been liked is still
    // a valid comment target. The like-vs-relike check is enforced inline
    // below when emitting a like action.
    const candidates = await Post.find({
      userId,
      platform,
      status: { $in: ['evaluated', 'approved'] },
      aiRelevanceScore: { $gte: threshold },
      aiReply: { $exists: true, $ne: '' },
      postAttempts: { $not: { $gte: 3 } },
      scrapedAt: { $gte: freshCutoff },
      url: { $nin: Array.from(recentUrls) },
    }).sort({ aiRelevanceScore: -1 }).limit(12).lean() as Record<string, unknown>[];

    const likeAction = (platform === 'reddit' || platform === 'quora') ? 'upvote' : 'like';
    let hasComment = false;
    let count = 0;

    for (const c of candidates) {
      // Skip if same author was recently posted to — but don't block generic/placeholder authors
      const author = c.author as string;
      const genericAuthors = new Set(['Unknown', 'unknown', 'youtube_creator', 'pinterest_user', 'quora_user', 'reddit_user', 'skool_user', '']);
      const authorBlocked = author && !genericAuthors.has(author) && recentAuthors.has(author);
      if (authorBlocked) continue;
      if (count >= 2) break;

      // First task: always a comment (if limit not hit). Second: random like/upvote.
      const isFirstTask = count === 0;
      const canComment = !platformLimitHit && (isFirstTask || Math.random() < (COMMENT_RATE[platform] ?? 0.5));
      const alreadyLiked = c.likedByBot === true;

      if (canComment && !hasComment) {
        tasks.push({
          id: String(c._id), platform: platform as string, action: 'comment',
          url: c.url as string, text: ((c.editedReply || c.aiReply || '') as string),
          score: c.aiRelevanceScore as number,
        });
        hasComment = true;
        count++;
      } else if (!alreadyLiked) {
        // Only emit a like task if the post hasn't been liked yet
        tasks.push({
          id: String(c._id), platform: platform as string, action: likeAction,
          url: c.url as string, text: '', score: c.aiRelevanceScore as number,
        });
        count++;
      }
      // If !canComment && alreadyLiked: skip this post entirely, try next candidate
    }
  }

  return NextResponse.json({ tasks, dailyStatus });
}
