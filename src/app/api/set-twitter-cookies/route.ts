import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Settings from '@/models/Settings';
import { getAuthUserId } from '@/lib/apiAuth';
import { checkPlanLimit } from '@/lib/featureGate';
import { enqueueJob } from '@/lib/queue';

export const dynamic = 'force-dynamic';

const FALLBACK_EXPIRES = () => Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60;

function normalizeSameSite(v: string | undefined): 'Strict' | 'Lax' | 'None' | undefined {
  if (!v) return undefined;
  const map: Record<string, 'Strict' | 'Lax' | 'None'> = {
    strict: 'Strict', lax: 'Lax', none: 'None',
    no_restriction: 'None', unspecified: 'Lax',
  };
  return map[v.toLowerCase()] ?? 'Lax';
}

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  // Enforce platform connection limit
  await connectDB();
  const existingSettings = await Settings.findOne({ userId }).lean();
  const connectedPlatforms = (existingSettings?.socialAccounts || []).filter(
    (a: { active?: boolean }) => a.active !== false
  ).length;
  const platformBlocked = await checkPlanLimit(userId, 'platforms', connectedPlatforms + 1);
  if (platformBlocked) return platformBlocked;

  let body: { cookies: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { cookies } = body;
  if (!cookies) {
    return NextResponse.json({ error: 'cookies field required' }, { status: 400 });
  }

  // Parse cookies into Playwright format
  let cookieList: Array<{ name: string; value: string; domain: string; path: string; expires?: number; secure?: boolean; httpOnly?: boolean; sameSite?: 'Strict' | 'Lax' | 'None' }>;
  let cookiesInput = cookies;
  if (typeof cookiesInput === 'string') {
    const trimmed = cookiesInput.trim();
    if (trimmed.startsWith('[')) {
      try { cookiesInput = JSON.parse(trimmed); } catch {
        return NextResponse.json({ error: 'Invalid JSON cookie array' }, { status: 400 });
      }
    }
  }
  if (typeof cookiesInput === 'string') {
    cookieList = cookiesInput.split(';').map(part => {
      const [name, ...rest] = part.trim().split('=');
      return { name: name.trim(), value: rest.join('=').trim(), domain: '.x.com', path: '/', expires: FALLBACK_EXPIRES(), secure: true };
    }).filter(c => c.name && c.value);
  } else if (Array.isArray(cookiesInput)) {
    cookieList = (cookiesInput as Record<string, unknown>[]).map(c => ({
      name: String(c.name),
      value: String(c.value),
      domain: String(c.domain || '.x.com'),
      path: String(c.path || '/'),
      expires: Number(c.expirationDate ?? c.expires ?? 0) > 0 ? Math.floor(Number(c.expirationDate ?? c.expires)) : FALLBACK_EXPIRES(),
      secure: Boolean(c.secure ?? true),
      httpOnly: Boolean(c.httpOnly ?? false),
      sameSite: normalizeSameSite(c.sameSite as string | undefined),
    }));
  } else {
    return NextResponse.json({ error: 'cookies must be a string or array' }, { status: 400 });
  }

  if (cookieList.length === 0) {
    return NextResponse.json({ error: 'No valid cookies parsed' }, { status: 400 });
  }

  const authTokenCookie = cookieList.find(c => c.name === 'auth_token');
  const ct0Cookie = cookieList.find(c => c.name === 'ct0');
  if (!authTokenCookie || !ct0Cookie) {
    return NextResponse.json({ error: 'auth_token and ct0 cookies are required', foundKeys: cookieList.map(c => c.name) }, { status: 400 });
  }

  // Enqueue validation to worker — return immediately
  const jobId = await enqueueJob({
    type: 'validate-cookies',
    userId,
    platform: 'twitter',
    cookies: cookieList,
  });

  return NextResponse.json({ jobId, message: 'Cookie validation queued' }, { status: 202 });
}
