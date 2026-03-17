import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Settings from '@/models/Settings';
import { getAuthUserId } from '@/lib/apiAuth';
import { checkPlanLimit } from '@/lib/featureGate';
import { enqueueJob } from '@/lib/queue';

export const dynamic = 'force-dynamic';

interface ParsedCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

const FALLBACK_EXPIRES = () => Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60;

function parseCookieString(str: string): ParsedCookie[] {
  return str
    .split(';')
    .map((part) => {
      const [name, ...rest] = part.trim().split('=');
      return {
        name: name.trim(),
        value: rest.join('=').trim(),
        domain: '.facebook.com',
        path: '/',
        expires: FALLBACK_EXPIRES(),
        secure: true,
      };
    })
    .filter((c) => c.name && c.value);
}

function normalizeSameSite(v: string | undefined): 'Strict' | 'Lax' | 'None' | undefined {
  if (!v) return undefined;
  const map: Record<string, 'Strict' | 'Lax' | 'None'> = {
    strict: 'Strict',
    lax: 'Lax',
    none: 'None',
    no_restriction: 'None',
    unspecified: 'Lax',
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

  let body: { cookies: unknown; accountIndex?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { cookies } = body;
  if (!cookies) {
    return NextResponse.json({ error: 'cookies field required' }, { status: 400 });
  }

  let cookieList: ParsedCookie[];
  let cookiesInput = cookies;
  if (typeof cookiesInput === 'string') {
    const trimmed = cookiesInput.trim();
    if (trimmed.startsWith('[')) {
      try {
        cookiesInput = JSON.parse(trimmed);
      } catch {
        return NextResponse.json({ error: 'Invalid JSON cookie array' }, { status: 400 });
      }
    }
  }
  if (typeof cookiesInput === 'string') {
    cookieList = parseCookieString(cookiesInput);
  } else if (Array.isArray(cookiesInput)) {
    cookieList = (cookiesInput as Record<string, unknown>[]).map((c) => {
      const rawExpiry = Number(c.expirationDate ?? c.expires ?? 0);
      const expires = rawExpiry > 0 ? Math.floor(rawExpiry) : FALLBACK_EXPIRES();
      return {
        name: String(c.name),
        value: String(c.value),
        domain: String(c.domain || '.facebook.com'),
        path: String(c.path || '/'),
        expires,
        secure: Boolean(c.secure ?? true),
        httpOnly: Boolean(c.httpOnly ?? false),
        sameSite: normalizeSameSite(c.sameSite as string | undefined),
      };
    });
  } else {
    return NextResponse.json({ error: 'cookies must be a string or array' }, { status: 400 });
  }

  if (cookieList.length === 0) {
    return NextResponse.json({ error: 'No valid cookies parsed' }, { status: 400 });
  }

  // Enqueue validation to worker — return immediately
  const jobId = await enqueueJob({
    type: 'validate-cookies',
    userId,
    platform: 'facebook',
    cookies: cookieList,
  });

  return NextResponse.json({ jobId, message: 'Cookie validation queued' }, { status: 202 });
}
