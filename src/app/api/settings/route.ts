import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/apiAuth';
import { checkPlanLimit } from '@/lib/featureGate';
import { getSettings, upsertSettings } from '@/services/settingsService';
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
const VALID_PLATFORMS = ['twitter', 'reddit', 'facebook', 'quora', 'youtube', 'pinterest'];

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

  // String arrays
  const arrayFields = [
    'keywords', 'subreddits', 'facebookGroups', 'facebookKeywords',
    'twitterKeywords', 'redditKeywords', 'quoraKeywords',
    'youtubeKeywords', 'pinterestKeywords',
  ] as const;
  for (const key of arrayFields) {
    if (body[key] !== undefined) {
      const arr = validateStringArray(body[key]);
      if (arr) data[key] = arr;
    }
  }

  // Numeric fields with sane ranges
  const numericFields: { key: string; min: number; max: number }[] = [
    { key: 'facebookDailyLimit', min: 1, max: 200 },
    { key: 'facebookAutoPostThreshold', min: 0, max: 100 },
    { key: 'twitterDailyLimit', min: 1, max: 200 },
    { key: 'twitterAutoPostThreshold', min: 0, max: 100 },
    { key: 'redditDailyLimit', min: 1, max: 200 },
    { key: 'redditAutoPostThreshold', min: 0, max: 100 },
    { key: 'quoraDailyLimit', min: 1, max: 200 },
    { key: 'quoraAutoPostThreshold', min: 0, max: 100 },
    { key: 'youtubeDailyLimit', min: 1, max: 200 },
    { key: 'youtubeAutoPostThreshold', min: 0, max: 100 },
    { key: 'pinterestDailyLimit', min: 1, max: 200 },
    { key: 'pinterestAutoPostThreshold', min: 0, max: 100 },
    { key: 'cronStartHour', min: 0, max: 23 },
    { key: 'cronEndHour', min: 0, max: 23 },
    { key: 'cronIntervalMinutes', min: 15, max: 360 },
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

  // Boolean
  if (body.notifyViaEmail !== undefined) data.notifyViaEmail = !!body.notifyViaEmail;

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

  const settings = await upsertSettings(userId, data);

  return NextResponse.json({ settings });
}
