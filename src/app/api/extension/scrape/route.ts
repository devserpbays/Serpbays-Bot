import { NextRequest, NextResponse } from 'next/server';
import { getExtensionUserId } from '@/lib/extensionAuth';
import { connectDB } from '@/lib/mongodb';
import Post from '@/models/Post';
import Settings from '@/models/Settings';
import { evaluatePost } from '@/lib/openclaw';
import { logActivity } from '@/lib/activityLog';

export const dynamic = 'force-dynamic';

/**
 * Basic language detection using Unicode script ranges.
 * Returns true if the text appears to be in one of the accepted languages.
 */
function isAcceptableLanguage(text: string, acceptedLanguages: string[]): boolean {
  if (acceptedLanguages.includes('all')) return true;

  const sample = text.slice(0, 300);

  // Count characters by script
  const latin = (sample.match(/[a-zA-Z]/g) || []).length;
  const devanagari = (sample.match(/[\u0900-\u097F]/g) || []).length; // Hindi
  const arabic = (sample.match(/[\u0600-\u06FF]/g) || []).length;
  const cjk = (sample.match(/[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]/g) || []).length; // Chinese/Japanese/Korean
  const cyrillic = (sample.match(/[\u0400-\u04FF]/g) || []).length; // Russian
  const total = sample.replace(/[\s\d\p{P}]/gu, '').length || 1;

  const latinRatio = latin / total;
  const devanagariRatio = devanagari / total;

  // Determine detected language
  if (latinRatio > 0.6) {
    // Latin script — English, Spanish, French, German, etc.
    return acceptedLanguages.some(l => ['english', 'spanish', 'french', 'german', 'portuguese', 'italian', 'dutch'].includes(l));
  }
  if (devanagariRatio > 0.3) {
    return acceptedLanguages.includes('hindi');
  }
  if (arabic / total > 0.3) {
    return acceptedLanguages.includes('arabic');
  }
  if (cjk / total > 0.3) {
    return acceptedLanguages.some(l => ['chinese', 'japanese', 'korean'].includes(l));
  }
  if (cyrillic / total > 0.3) {
    return acceptedLanguages.includes('russian');
  }

  // Default: accept if mostly latin characters (likely English)
  return latinRatio > 0.4;
}

interface ScrapedPost {
  url: string;
  content: string;
  author?: string;
  platform: string;
}

/**
 * Receives scraped posts from the extension, deduplicates, evaluates with AI,
 * and stores them in the DB ready for the extension to pick up as tasks.
 */
export async function POST(req: NextRequest) {
  const userId = await getExtensionUserId(req);
  if (userId instanceof NextResponse) return userId;

  let body: { posts?: ScrapedPost[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const posts = body.posts;
  if (!posts || !Array.isArray(posts) || posts.length === 0) {
    return NextResponse.json({ error: 'No posts provided' }, { status: 400 });
  }

  // Cap at 20 posts per request
  const batch = posts.slice(0, 20);

  await connectDB();

  const settings = await Settings.findOne({ userId }).lean() as Record<string, unknown> | null;
  if (!settings || !settings.companyName) {
    return NextResponse.json({ error: 'Settings not configured — set company name in dashboard' }, { status: 400 });
  }

  const companyName = settings.companyName as string;
  const companyDescription = (settings.companyDescription as string) || '';
  const promptTemplate = (settings.promptTemplate as string) || '';
  const replyLanguages = (settings.replyLanguages as string[]) || ['english'];

  // ── Brand mention rate: GLOBAL cap of 2 mentions/day ────────────────────
  //
  // Strategy: most comments should be natural engagement WITHOUT mentioning
  // the company. Only 1–2 comments per day (across ALL platforms combined)
  // should include a brand mention — and ONLY on high-relevance posts where
  // someone has clear buying intent. This keeps the account looking authentic
  // and avoids spam flags.
  //
  // How it works:
  //   1. Count how many brand mentions have already been posted today
  //   2. If >= MAX_DAILY_BRAND_MENTIONS → brandRate = 0 (no more mentions)
  //   3. If < MAX → brandRate = 40 (moderate chance, only on buying-intent posts)
  //   4. The AI prompt independently checks for buying intent — so even at 40%,
  //      only posts with actual buying signals get a mention.

  const MAX_DAILY_BRAND_MENTIONS = (settings.maxDailyBrandMentions as number) ?? 2;
  const companyLower = companyName.toLowerCase();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Count brand mentions already posted today across ALL platforms
  const todayPosted = await Post.find({
    userId, status: 'posted', postedAt: { $gte: todayStart },
  }).select('aiReply editedReply').lean() as Record<string, unknown>[];

  const brandMentionsToday = todayPosted.filter(post => {
    const reply = ((post.editedReply || post.aiReply || '') as string).toLowerCase();
    return reply.includes(companyLower);
  }).length;

  // Also check evaluated-but-not-yet-posted replies — they'll be posted soon,
  // so count them toward the cap to avoid overshooting.
  const pendingWithBrand = await Post.countDocuments({
    userId,
    status: { $in: ['evaluated', 'approved'] },
    $or: [
      { aiReply: { $regex: companyName, $options: 'i' } },
      { editedReply: { $regex: companyName, $options: 'i' } },
    ],
    scrapedAt: { $gte: todayStart },
  });

  const totalBrandCount = brandMentionsToday + pendingWithBrand;
  const brandBudgetRemaining = Math.max(MAX_DAILY_BRAND_MENTIONS - totalBrandCount, 0);

  // If budget exhausted → 0% for all platforms. If budget remains → moderate
  // rate (40%) so only genuinely relevant posts get a mention.
  const effectiveBrandRate = brandBudgetRemaining > 0 ? 40 : 0;

  let created = 0;
  let duplicates = 0;
  let evaluated = 0;

  for (const post of batch) {
    if (!post.url || !post.content || !post.platform) continue;

    // Language filter: skip posts not in user's preferred languages
    if (!isAcceptableLanguage(post.content, replyLanguages)) {
      continue;
    }

    // Check for duplicate
    const existing = await Post.findOne({ userId, url: post.url }).lean();
    if (existing) {
      duplicates++;
      continue;
    }

    // Create the post
    const doc = await Post.create({
      userId,
      url: post.url,
      content: post.content.slice(0, 5000),
      author: post.author || 'Unknown',
      platform: post.platform,
      status: 'new',
      scrapedAt: new Date(),
    });
    created++;

    // Evaluate with AI — brand mention rate is capped globally (max 2/day)
    const brandRate = effectiveBrandRate;
    // Build language instruction for AI
    const langInstruction = replyLanguages.length === 1 && replyLanguages[0] !== 'english'
      ? `\nIMPORTANT: Reply in ${replyLanguages[0]} language.`
      : '';
    const effectiveTemplate = promptTemplate
      ? promptTemplate + langInstruction
      : undefined;
    try {
      const result = await evaluatePost(post.content, companyName, companyDescription, effectiveTemplate, brandRate);

      await Post.findByIdAndUpdate(doc._id, {
        status: 'evaluated',
        aiRelevanceScore: result.score,
        aiReply: result.suggestedReply,
        aiTone: result.tone,
        aiReasoning: result.reasoning,
        evaluatedAt: new Date(),
      });
      evaluated++;
    } catch (err) {
      console.error(`[Extension scrape] AI eval failed for ${post.url}:`, (err as Error).message);
      await Post.findByIdAndUpdate(doc._id, { status: 'evaluated', aiRelevanceScore: 0 });
    }
  }

  if (created > 0 && userId) {
    const platform = batch[0].platform;

    // Check how many of the newly evaluated posts pass the auto-post threshold.
    // If none do, log a specific message so the user knows WHY no comments will
    // be posted — "posts were found, but none were relevant enough."
    const thresholdKey = `${platform}AutoPostThreshold`;
    const threshold = (settings[thresholdKey] as number) ?? 70;

    // Count how many of the posts we just created have score >= threshold
    const justCreatedIds = []; // track doc IDs during creation
    // We need to re-query since we don't track scores inline above
    const recentHighScore = await Post.countDocuments({
      userId, platform, status: 'evaluated',
      aiRelevanceScore: { $gte: threshold },
      aiReply: { $exists: true, $ne: '' },
      scrapedAt: { $gte: new Date(Date.now() - 60_000) }, // last 60s = this batch
    });

    const recentLowScore = evaluated - recentHighScore;

    await logActivity(userId, platform, 'info', 'extension_scrape',
      `Extension scraped ${created} new posts (${duplicates} dupes, ${evaluated} evaluated)`,
      { created, duplicates, evaluated },
    );

    // If posts were evaluated but NONE passed the threshold, log a clear warning
    if (evaluated > 0 && recentHighScore === 0) {
      await logActivity(userId, platform, 'warn', 'no_relevant_posts',
        `${evaluated} posts evaluated for ${platform} but none scored above auto-post threshold (${threshold}). ` +
        `All ${recentLowScore} posts had lower relevance — no comments will be queued. ` +
        `Tip: lower the threshold in Settings → Auto-Post Limits, or refine your keywords.`,
        { evaluated, threshold, highScore: recentHighScore, lowScore: recentLowScore },
      );
    } else if (evaluated > 0 && recentHighScore > 0) {
      await logActivity(userId, platform, 'info', 'posts_qualified',
        `${recentHighScore} of ${evaluated} posts passed threshold (${threshold}) for ${platform} — ready for auto-posting`,
        { qualified: recentHighScore, total: evaluated, threshold },
      );
    }
  }

  return NextResponse.json({ ok: true, created, duplicates, evaluated });
}
