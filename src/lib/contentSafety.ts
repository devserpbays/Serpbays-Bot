/**
 * contentSafety.ts — AI reply quality and spam safety checks.
 *
 * Runs before any comment is posted to prevent low-quality, spammy,
 * or duplicate content that could trigger platform moderation.
 */

import Post from '@/models/Post';

// ─── Spam phrase detection ────────────────────────────────────────────────────

const SPAM_PHRASES = [
  // Hard self-promotion
  'check out my', 'visit my', 'follow me', 'subscribe to', 'buy now',
  'click here', 'limited offer', 'act now', 'don\'t miss', 'free trial',
  'sign up now', 'join now', 'get started today', 'learn more at',
  // Excessive hype
  'this is amazing', 'you won\'t believe', 'mind-blowing', 'life-changing',
  'game changer', 'revolutionary product',
  // Link spam patterns
  'http://', 'https://', 'www.', '.com/', '.io/', '.co/',
  // Generic filler that looks bot-generated
  'as an ai', 'as a language model', 'i cannot', 'i am unable',
  'great post!', 'nice post!', 'awesome post!', 'thanks for sharing!',
  'very informative', 'well written', 'great article',
];

/**
 * Check text for known spam phrases.
 * Returns list of matched phrases (empty = clean).
 */
export function detectSpamPhrases(text: string): string[] {
  const lower = text.toLowerCase();
  return SPAM_PHRASES.filter((phrase) => lower.includes(phrase));
}

// ─── Quality scoring ──────────────────────────────────────────────────────────

export interface QualityResult {
  score: number;          // 0–100
  passed: boolean;        // true if score >= MIN_QUALITY_SCORE
  flags: string[];        // human-readable reasons for failure
}

const MIN_QUALITY_SCORE = 55;

/**
 * Score a reply on multiple quality dimensions.
 * Returns a score 0–100 and a list of issues found.
 */
export function scoreReplyQuality(text: string): QualityResult {
  const flags: string[] = [];
  let score = 100;
  const trimmed = text.trim();

  // Length checks
  if (trimmed.length < 30) {
    flags.push('Too short — replies under 30 chars look like spam');
    score -= 40;
  } else if (trimmed.length < 60) {
    score -= 15;
  }

  if (trimmed.length > 1200) {
    flags.push('Too long — wall-of-text replies get ignored/flagged');
    score -= 20;
  }

  // Sentence structure — should have at least one proper sentence
  const sentenceCount = (trimmed.match(/[.!?]+/g) || []).length;
  if (sentenceCount === 0) {
    flags.push('No punctuation — does not read as a natural sentence');
    score -= 15;
  }

  // Spam phrases — cap penalty to match the 3 shown in the flag
  const spamHits = detectSpamPhrases(trimmed);
  if (spamHits.length > 0) {
    flags.push(`Spam phrases detected: "${spamHits.slice(0, 3).join('", "')}"`);
    score -= Math.min(spamHits.length, 3) * 15;
  }

  // ALL CAPS (shouting)
  const capsRatio = (trimmed.match(/[A-Z]/g) || []).length / Math.max(trimmed.length, 1);
  if (capsRatio > 0.5 && trimmed.length > 15) {
    flags.push('Excessive capitalization');
    score -= 20;
  }

  // Excessive punctuation (!!!, ???)
  if (/[!?]{3,}/.test(trimmed)) {
    flags.push('Excessive punctuation');
    score -= 10;
  }

  // Emoji spam (more than 4 consecutive or 8 total)
  const emojiCount = (trimmed.match(/\p{Emoji}/gu) || []).length;
  if (emojiCount > 8) {
    flags.push('Too many emojis');
    score -= 15;
  }

  // Keyword stuffing — same word appears more than 4 times
  const words = trimmed.toLowerCase().split(/\s+/);
  const wordFreq: Record<string, number> = {};
  for (const w of words) {
    if (w.length > 4) wordFreq[w] = (wordFreq[w] || 0) + 1;
  }
  const stuffed = Object.entries(wordFreq).filter(([, count]) => count > 4).map(([w]) => w);
  if (stuffed.length > 0) {
    flags.push(`Keyword stuffing: "${stuffed[0]}" repeated ${wordFreq[stuffed[0]]} times`);
    score -= 20;
  }

  // Contains URLs
  if (/https?:\/\/|www\./i.test(trimmed)) {
    flags.push('Contains URL — platforms penalize comments with external links');
    score -= 25;
  }

  score = Math.max(0, Math.min(100, score));
  return { score, passed: score >= MIN_QUALITY_SCORE, flags };
}

// ─── Duplicate detection ──────────────────────────────────────────────────────

/**
 * Check if the user has posted an identical or near-identical reply recently.
 * "Near-identical" = first 60 chars match a previous post within 7 days.
 */
export async function isDuplicateReply(
  userId: string,
  platform: string,
  text: string,
): Promise<{ duplicate: boolean; reason?: string }> {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const snippet = text.trim().slice(0, 60).toLowerCase();

    // Fetch recent posts for this user+platform — check first 60 chars against snippet
    const recentPosts = await Post.find(
      { userId, platform, status: 'posted', postedAt: { $gte: sevenDaysAgo } },
      { aiReply: 1, editedReply: 1 }
    ).limit(50).lean();

    for (const post of recentPosts) {
      const posted = ((post.editedReply || post.aiReply) as string | undefined)?.trim().slice(0, 60).toLowerCase() ?? '';
      if (posted && posted === snippet) {
        return { duplicate: true, reason: 'Identical reply posted within the last 7 days' };
      }
      // Near-duplicate: >80% character overlap on first 60 chars
      if (posted && snippet && similarity(posted, snippet) > 0.8) {
        return { duplicate: true, reason: 'Very similar reply posted within the last 7 days' };
      }
    }

    return { duplicate: false };
  } catch {
    return { duplicate: false }; // fail open — don't block on DB error
  }
}

/** Simple character-level similarity ratio (Dice coefficient on bigrams). */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = (s: string) => new Set(Array.from({ length: s.length - 1 }, (_, i) => s.slice(i, i + 2)));
  const setA = bigrams(a);
  const setB = bigrams(b);
  let shared = 0;
  for (const bg of setA) if (setB.has(bg)) shared++;
  return (2 * shared) / (setA.size + setB.size);
}

// ─── Combined gate ────────────────────────────────────────────────────────────

export interface SafetyCheckResult {
  allowed: boolean;
  score: number;
  reason?: string;
  flags: string[];
}

/**
 * Full content safety check. Run this before posting any AI reply.
 * Returns { allowed: true } if the reply can be posted, or { allowed: false, reason } to block it.
 */
export async function checkContentSafety(
  userId: string,
  platform: string,
  text: string,
): Promise<SafetyCheckResult> {
  // 1. Quality scoring
  const quality = scoreReplyQuality(text);
  if (!quality.passed) {
    return {
      allowed: false,
      score: quality.score,
      reason: `Reply quality too low (score ${quality.score}/100): ${quality.flags[0]}`,
      flags: quality.flags,
    };
  }

  // 2. Duplicate detection
  const dup = await isDuplicateReply(userId, platform, text);
  if (dup.duplicate) {
    return {
      allowed: false,
      score: quality.score,
      reason: dup.reason,
      flags: [...quality.flags, dup.reason ?? ''],
    };
  }

  return { allowed: true, score: quality.score, flags: quality.flags };
}
