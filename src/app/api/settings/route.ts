import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Settings from '@/models/Settings';
import { getAuthUserId } from '@/lib/apiAuth';
import { checkPlanLimit } from '@/lib/featureGate';

export async function GET() {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  await connectDB();
  const settings = await Settings.findOne({ userId }).lean();
  return NextResponse.json({ settings });
}

export async function PUT(req: NextRequest) {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  await connectDB();
  const body = await req.json();

  // Enforce plan limits on platforms and keywords
  if (body.platforms) {
    const blocked = await checkPlanLimit(userId, 'platforms', body.platforms.length);
    if (blocked) return blocked;
  }
  if (body.keywords) {
    const blocked = await checkPlanLimit(userId, 'keywords', body.keywords.length);
    if (blocked) return blocked;
  }

  const {
    companyName,
    companyDescription,
    keywords,
    platforms,
    subreddits,
    promptTemplate,
    socialAccounts,
    facebookGroups,
    facebookKeywords,
    facebookDailyLimit,
    facebookAutoPostThreshold,
    twitterKeywords,
    twitterDailyLimit,
    twitterAutoPostThreshold,
    redditKeywords,
    redditDailyLimit,
    redditAutoPostThreshold,
    quoraKeywords,
    quoraDailyLimit,
    quoraAutoPostThreshold,
    youtubeKeywords,
    youtubeDailyLimit,
    youtubeAutoPostThreshold,
    pinterestKeywords,
    pinterestDailyLimit,
    pinterestAutoPostThreshold,
    cronTimezone,
    cronStartHour,
    cronEndHour,
    cronDays,
  } = body;

  let settings = await Settings.findOne({ userId });

  if (settings) {
    settings.companyName = companyName ?? settings.companyName;
    settings.companyDescription = companyDescription ?? settings.companyDescription;
    settings.keywords = keywords ?? settings.keywords;
    settings.platforms = platforms ?? settings.platforms;
    settings.subreddits = subreddits ?? settings.subreddits;
    settings.promptTemplate = promptTemplate ?? settings.promptTemplate;
    if (socialAccounts !== undefined) settings.socialAccounts = socialAccounts;
    if (facebookGroups !== undefined) settings.facebookGroups = facebookGroups;
    if (facebookKeywords !== undefined) settings.facebookKeywords = facebookKeywords;
    if (facebookDailyLimit !== undefined) settings.facebookDailyLimit = facebookDailyLimit;
    if (facebookAutoPostThreshold !== undefined) settings.facebookAutoPostThreshold = facebookAutoPostThreshold;
    if (twitterKeywords !== undefined) settings.twitterKeywords = twitterKeywords;
    if (twitterDailyLimit !== undefined) settings.twitterDailyLimit = twitterDailyLimit;
    if (twitterAutoPostThreshold !== undefined) settings.twitterAutoPostThreshold = twitterAutoPostThreshold;
    if (redditKeywords !== undefined) settings.redditKeywords = redditKeywords;
    if (redditDailyLimit !== undefined) settings.redditDailyLimit = redditDailyLimit;
    if (redditAutoPostThreshold !== undefined) settings.redditAutoPostThreshold = redditAutoPostThreshold;
    if (quoraKeywords !== undefined) settings.quoraKeywords = quoraKeywords;
    if (quoraDailyLimit !== undefined) settings.quoraDailyLimit = quoraDailyLimit;
    if (quoraAutoPostThreshold !== undefined) settings.quoraAutoPostThreshold = quoraAutoPostThreshold;
    if (youtubeKeywords !== undefined) settings.youtubeKeywords = youtubeKeywords;
    if (youtubeDailyLimit !== undefined) settings.youtubeDailyLimit = youtubeDailyLimit;
    if (youtubeAutoPostThreshold !== undefined) settings.youtubeAutoPostThreshold = youtubeAutoPostThreshold;
    if (pinterestKeywords !== undefined) settings.pinterestKeywords = pinterestKeywords;
    if (pinterestDailyLimit !== undefined) settings.pinterestDailyLimit = pinterestDailyLimit;
    if (pinterestAutoPostThreshold !== undefined) settings.pinterestAutoPostThreshold = pinterestAutoPostThreshold;
    if (cronTimezone !== undefined) settings.cronTimezone = cronTimezone;
    if (cronStartHour !== undefined) settings.cronStartHour = cronStartHour;
    if (cronEndHour !== undefined) settings.cronEndHour = cronEndHour;
    if (cronDays !== undefined) settings.cronDays = cronDays;
    await settings.save();
  } else {
    settings = await Settings.create({
      userId,
      companyName: companyName || '',
      companyDescription: companyDescription || '',
      keywords: keywords || [],
      platforms: platforms || [],
      subreddits: subreddits || [],
      promptTemplate: promptTemplate || '',
      socialAccounts: socialAccounts || [],
      facebookGroups: facebookGroups || [],
      facebookKeywords: facebookKeywords || [],
      facebookDailyLimit: facebookDailyLimit ?? 5,
      facebookAutoPostThreshold: facebookAutoPostThreshold ?? 70,
      twitterKeywords: twitterKeywords || [],
      twitterDailyLimit: twitterDailyLimit ?? 10,
      twitterAutoPostThreshold: twitterAutoPostThreshold ?? 70,
      redditKeywords: redditKeywords || [],
      redditDailyLimit: redditDailyLimit ?? 5,
      redditAutoPostThreshold: redditAutoPostThreshold ?? 70,
      quoraKeywords: quoraKeywords || [],
      quoraDailyLimit: quoraDailyLimit ?? 3,
      quoraAutoPostThreshold: quoraAutoPostThreshold ?? 70,
      youtubeKeywords: youtubeKeywords || [],
      youtubeDailyLimit: youtubeDailyLimit ?? 5,
      youtubeAutoPostThreshold: youtubeAutoPostThreshold ?? 70,
      pinterestKeywords: pinterestKeywords || [],
      pinterestDailyLimit: pinterestDailyLimit ?? 5,
      pinterestAutoPostThreshold: pinterestAutoPostThreshold ?? 70,
      cronTimezone: cronTimezone || '',
      cronStartHour: cronStartHour ?? 9,
      cronEndHour: cronEndHour ?? 18,
      cronDays: cronDays ?? [0, 1, 2, 3, 4, 5, 6],
    });
  }

  return NextResponse.json({ settings });
}
