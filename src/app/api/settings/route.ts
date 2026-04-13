import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/apiAuth';
import { checkPlanLimit } from '@/lib/featureGate';
import { getSettings, upsertSettings } from '@/services/settingsService';
import { getAllowedPlatforms } from '@/lib/plans';
import { getUserPlan } from '@/lib/subscription';
import path from 'path';

export async function GET() {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  const settings = await getSettings(userId);
  return NextResponse.json({ settings });
}

// ── Input validation helpers ──
const MAX_STRING_LENGTH = 500;
const MAX_PROMPT_LENGTH = 5000;
const MAX_ARRAY_LENGTH = 200;
const VALID_PLATFORMS = ['twitter', 'reddit', 'facebook', 'quora', 'youtube', 'pinterest', 'skool'];

function validateString(val: unknown, maxLen = MAX_STRING_LENGTH): string | null {
  if (typeof val !== 'string') return null;
  return val.slice(0, maxLen);
}

function validateStringArray(val: unknown, maxLen = MAX_ARRAY_LENGTH): string[] | null {
  if (!Array.isArray(val)) return null;
  return val
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .slice(0, maxLen)
    .map(v => v.slice(0, MAX_STRING_LENGTH));
}

function validateNumber(val: unknown, min: number, max: number): number | null {
  const n = Number(val);
  if (isNaN(n)) return null;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function validateProfileDir(dir: string): boolean {
  const resolved = path.resolve(process.cwd(), dir);
  const profilesBase = path.resolve(process.cwd(), 'profiles');
  return resolved.startsWith(profilesBase + '/');
}

export async function PUT(req: NextRequest) {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Platforms are LOCKED to the plan tier — users cannot pick their own.
  // Whatever the client sends for platforms/extensionPlatforms is ignored;
  // we force-assign the plan's fixed platform list on every save.
  const { plan } = await getUserPlan(userId);
  const lockedPlatforms = Array.from(getAllowedPlatforms(plan));
  body.platforms = lockedPlatforms;
  body.extensionPlatforms = lockedPlatforms;

  // Still enforce the keyword limit
  if (body.keywords) {
    const blocked = await checkPlanLimit(userId, 'keywords', body.keywords.length);
    if (blocked) return blocked;
  }

  // Build validated data object
  const data: Record<string, unknown> = {};

  // String fields
  if (body.companyName !== undefined) data.companyName = validateString(body.companyName) ?? '';
  if (body.companyDescription !== undefined) data.companyDescription = validateString(body.companyDescription) ?? '';
  if (body.promptTemplate !== undefined) data.promptTemplate = validateString(body.promptTemplate, MAX_PROMPT_LENGTH) ?? '';
  if (body.notificationEmail !== undefined) data.notificationEmail = validateString(body.notificationEmail, 254) ?? '';
  if (body.cronTimezone !== undefined) data.cronTimezone = validateString(body.cronTimezone) ?? '';

  // Platform selection
  if (body.platforms !== undefined) {
    const arr = validateStringArray(body.platforms);
    if (arr) data.platforms = arr.filter(p => VALID_PLATFORMS.includes(p));
  }

  // String fields (continued)
  if (body.twitterTweetPersona !== undefined) data.twitterTweetPersona = validateString(body.twitterTweetPersona) ?? '';

  // String arrays
  const arrayFields = [
    'keywords', 'subreddits', 'facebookGroups', 'facebookKeywords',
    'twitterKeywords', 'twitterCommunityIds', 'twitterTweetTopics', 'twitterTweetStyles',
    'redditKeywords', 'quoraKeywords', 'youtubeKeywords', 'pinterestKeywords', 'skoolKeywords', 'skoolCommunities',
  ] as const;
  for (const key of arrayFields) {
    if (body[key] !== undefined) {
      const arr = validateStringArray(body[key]);
      if (arr) data[key] = arr;
    }
  }

  // Numeric fields — daily limits are hard-capped at PLATFORM_SAFE_LIMITS, cooldowns at platform minimums
  // These caps are enforced server-side so no client can bypass them.
  const numericFields: { key: string; min: number; max: number }[] = [
    { key: 'facebookDailyLimit',        min: 1,  max: 10  },
    { key: 'facebookAutoPostThreshold', min: 0,  max: 100 },
    { key: 'facebookBrandMentionRate',  min: 0,  max: 100 },
    { key: 'facebookCooldownMinutes',   min: 60, max: 1440 },
    { key: 'twitterDailyLimit',         min: 1,  max: 10  },
    { key: 'twitterAutoPostThreshold',  min: 0,  max: 100 },
    { key: 'twitterBrandMentionRate',   min: 0,  max: 100 },
    { key: 'twitterCooldownMinutes',    min: 45, max: 1440 },
    { key: 'twitterOriginalTweetDailyLimit', min: 0, max: 5 },
    { key: 'twitterLikeRate',           min: 0,  max: 100 },
    { key: 'twitterRetweetRate',        min: 0,  max: 100 },
    { key: 'twitterBookmarkRate',       min: 0,  max: 100 },
    { key: 'twitterReplyRate',          min: 0,  max: 100 },
    { key: 'redditDailyLimit',          min: 1,  max: 10  },
    { key: 'redditAutoPostThreshold',   min: 0,  max: 100 },
    { key: 'redditBrandMentionRate',    min: 0,  max: 100 },
    { key: 'redditCooldownMinutes',     min: 60, max: 1440 },
    { key: 'quoraDailyLimit',           min: 1,  max: 10  },
    { key: 'quoraAutoPostThreshold',    min: 0,  max: 100 },
    { key: 'quoraBrandMentionRate',     min: 0,  max: 100 },
    { key: 'quoraCooldownMinutes',      min: 90, max: 1440 },
    { key: 'youtubeDailyLimit',         min: 1,  max: 10  },
    { key: 'youtubeAutoPostThreshold',  min: 0,  max: 100 },
    { key: 'youtubeBrandMentionRate',   min: 0,  max: 100 },
    { key: 'youtubeCooldownMinutes',    min: 90, max: 1440 },
    { key: 'pinterestDailyLimit',       min: 1,  max: 10  },
    { key: 'pinterestAutoPostThreshold',min: 0,  max: 100 },
    { key: 'pinterestBrandMentionRate', min: 0,  max: 100 },
    { key: 'pinterestCooldownMinutes',  min: 60, max: 1440 },
    { key: 'skoolDailyLimit',           min: 1,  max: 10  },
    { key: 'skoolAutoPostThreshold',    min: 0,  max: 100 },
    { key: 'skoolBrandMentionRate',     min: 0,  max: 100 },
    { key: 'skoolCooldownMinutes',      min: 30, max: 1440 },
    { key: 'cronStartHour', min: 0, max: 23 },
    { key: 'cronEndHour', min: 0, max: 23 },
    { key: 'cronIntervalMinutes', min: 15, max: 360 },
    { key: 'maxDailyBrandMentions', min: 0, max: 10 },
  ];
  for (const { key, min, max } of numericFields) {
    if (body[key] !== undefined) {
      const val = validateNumber(body[key], min, max);
      if (val !== null) data[key] = val;
    }
  }

  // Cron days
  if (body.cronDays !== undefined && Array.isArray(body.cronDays)) {
    data.cronDays = body.cronDays
      .filter((d: unknown) => typeof d === 'number' && d >= 0 && d <= 6)
      .map((d: number) => Math.round(d));
  }

  // Booleans
  if (body.notifyViaEmail !== undefined) data.notifyViaEmail = !!body.notifyViaEmail;
  if (body.twitterOriginalTweetsEnabled !== undefined) data.twitterOriginalTweetsEnabled = !!body.twitterOriginalTweetsEnabled;
  if (body.extensionMode !== undefined) data.extensionMode = !!body.extensionMode;

  // Extension platforms
  if (body.extensionPlatforms !== undefined) {
    const arr = validateStringArray(body.extensionPlatforms);
    if (arr) data.extensionPlatforms = arr.filter(p => VALID_PLATFORMS.includes(p));
  }

  // Reply languages
  if (body.replyLanguages !== undefined) {
    const arr = validateStringArray(body.replyLanguages);
    if (arr) data.replyLanguages = arr.map(l => l.toLowerCase().trim()).filter(Boolean);
  }

  // Social accounts — validate profileDir
  if (body.socialAccounts !== undefined && Array.isArray(body.socialAccounts)) {
    data.socialAccounts = body.socialAccounts
      .filter((a: Record<string, unknown>) =>
        a && typeof a.id === 'string' && typeof a.platform === 'string'
      )
      .map((a: Record<string, unknown>) => ({
        ...a,
        profileDir: typeof a.profileDir === 'string' && validateProfileDir(a.profileDir)
          ? a.profileDir
          : '',
      }));
  }

  // Validate cron hour ordering
  const startHour = data.cronStartHour !== undefined ? (data.cronStartHour as number) : undefined;
  const endHour = data.cronEndHour !== undefined ? (data.cronEndHour as number) : undefined;
  if (startHour !== undefined && endHour !== undefined && startHour >= endHour) {
    return NextResponse.json({ error: 'Cron start hour must be before end hour' }, { status: 400 });
  }

  const settings = await upsertSettings(userId, data);

  return NextResponse.json({ settings });
}
