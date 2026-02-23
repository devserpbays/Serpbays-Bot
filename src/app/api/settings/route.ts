import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Settings from '@/models/Settings';

export async function GET() {
  await connectDB();
  const settings = await Settings.findOne().lean();
  return NextResponse.json({ settings });
}

export async function PUT(req: NextRequest) {
  await connectDB();
  const body = await req.json();

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
    linkedinKeywords,
    linkedinDailyLimit,
    linkedinAutoPostThreshold,
    quoraKeywords,
    quoraDailyLimit,
    quoraAutoPostThreshold,
  } = body;

  let settings = await Settings.findOne();

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
    if (linkedinKeywords !== undefined) settings.linkedinKeywords = linkedinKeywords;
    if (linkedinDailyLimit !== undefined) settings.linkedinDailyLimit = linkedinDailyLimit;
    if (linkedinAutoPostThreshold !== undefined) settings.linkedinAutoPostThreshold = linkedinAutoPostThreshold;
    if (quoraKeywords !== undefined) settings.quoraKeywords = quoraKeywords;
    if (quoraDailyLimit !== undefined) settings.quoraDailyLimit = quoraDailyLimit;
    if (quoraAutoPostThreshold !== undefined) settings.quoraAutoPostThreshold = quoraAutoPostThreshold;
    await settings.save();
  } else {
    settings = await Settings.create({
      companyName: companyName || 'My Company',
      companyDescription: companyDescription || '',
      keywords: keywords || [],
      platforms: platforms || ['twitter', 'reddit'],
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
      linkedinKeywords: linkedinKeywords || [],
      linkedinDailyLimit: linkedinDailyLimit ?? 5,
      linkedinAutoPostThreshold: linkedinAutoPostThreshold ?? 70,
      quoraKeywords: quoraKeywords || [],
      quoraDailyLimit: quoraDailyLimit ?? 3,
      quoraAutoPostThreshold: quoraAutoPostThreshold ?? 70,
    });
  }

  return NextResponse.json({ settings });
}
