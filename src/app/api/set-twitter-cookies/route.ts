import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { verifyCredentials, closeBrowser } from '@/lib/twitter';

export const dynamic = 'force-dynamic';

function parseCookieString(str: string): Record<string, string> {
  const result: Record<string, string> = {};
  str.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (name) result[name] = value;
  });
  return result;
}

export async function POST(req: NextRequest) {
  let body: { cookies: unknown; accountIndex?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { cookies, accountIndex = 0 } = body;
  if (!cookies) {
    return NextResponse.json({ error: 'cookies field required' }, { status: 400 });
  }

  let parsed: Record<string, string>;
  if (typeof cookies === 'string') {
    // Handle JSON string from Cookie Editor extension
    const trimmed = (cookies as string).trim();
    if (trimmed.startsWith('[')) {
      // JSON array → extract name/value pairs into a flat object
      try {
        const arr = JSON.parse(trimmed) as Array<{ name: string; value: string }>;
        parsed = {};
        for (const c of arr) {
          if (c.name) parsed[c.name] = c.value ?? '';
        }
      } catch {
        return NextResponse.json({ error: 'Invalid JSON cookie array' }, { status: 400 });
      }
    } else {
      parsed = parseCookieString(cookies as string);
    }
  } else if (Array.isArray(cookies)) {
    // Array of { name, value } objects
    parsed = {};
    for (const c of cookies as Array<{ name: string; value: string }>) {
      if (c.name) parsed[c.name] = c.value ?? '';
    }
  } else if (typeof cookies === 'object' && !Array.isArray(cookies)) {
    parsed = cookies as Record<string, string>;
  } else {
    return NextResponse.json(
      { error: 'cookies must be a cookie string or key-value object' },
      { status: 400 }
    );
  }

  // Map common cookie names → env var names
  const authToken =
    parsed['auth_token'] || parsed['TWITTER_AUTH_TOKEN'] || '';
  const ct0 =
    parsed['ct0'] || parsed['TWITTER_CT0'] || '';
  const twid =
    parsed['twid'] || parsed['TWITTER_TWID'] || '';
  const guestId =
    parsed['guest_id'] || parsed['guest_id_marketing'] || parsed['TWITTER_GUEST_ID'] || '';
  const kdt =
    parsed['kdt'] || parsed['TWITTER_KDT'] || '';
  const personalizationId =
    parsed['personalization_id'] || parsed['TWITTER_PERSONALIZATION_ID'] || '';

  if (!authToken || !ct0) {
    return NextResponse.json(
      {
        error: 'auth_token and ct0 are required',
        foundKeys: Object.keys(parsed),
      },
      { status: 400 }
    );
  }

  // Apply to process.env immediately so verifyCredentials() picks them up
  process.env.TWITTER_AUTH_TOKEN = authToken;
  process.env.TWITTER_CT0 = ct0;
  if (twid) process.env.TWITTER_TWID = twid;
  if (guestId) process.env.TWITTER_GUEST_ID = guestId;
  if (kdt) process.env.TWITTER_KDT = kdt;
  if (personalizationId) process.env.TWITTER_PERSONALIZATION_ID = personalizationId;

  // Persist to .env.local
  try {
    const envPath = join(process.cwd(), '.env.local');
    let envContent = readFileSync(envPath, 'utf8');

    const updates: Record<string, string> = {
      TWITTER_AUTH_TOKEN: authToken,
      TWITTER_CT0: ct0,
      ...(twid && { TWITTER_TWID: twid }),
      ...(guestId && { TWITTER_GUEST_ID: guestId }),
      ...(kdt && { TWITTER_KDT: kdt }),
      ...(personalizationId && { TWITTER_PERSONALIZATION_ID: personalizationId }),
    };

    for (const [key, val] of Object.entries(updates)) {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(envContent)) {
        // Use a replacer function to prevent $ in cookie values being interpreted as regex back-references
        envContent = envContent.replace(regex, () => `${key}=${val}`);
      } else {
        envContent += `\n${key}=${val}`;
      }
    }

    writeFileSync(envPath, envContent, 'utf8');
  } catch (err) {
    console.error('Failed to persist to .env.local:', (err as Error).message);
  }

  // Close any existing browser context so verifyCredentials() opens a fresh one
  // that actually uses the new cookies — not the old cached session.
  await closeBrowser();

  // Verify the credentials work, then always close the browser so the
  // profile dir is free when the cron process opens it moments later.
  try {
    const user = await verifyCredentials();
    const accountId = `tw_${user.username}`;

    // Persist account identity for cron scripts to read
    try {
      writeFileSync(
        join(process.cwd(), '.twitter-account'),
        JSON.stringify({ accountId, username: user.username, name: user.name, ts: new Date().toISOString() }),
        'utf8'
      );
    } catch {}

    // Persist per-account credentials file for multi-account support
    try {
      const credsFile = accountIndex === 0
        ? join(process.cwd(), '.twitter-account')
        : join(process.cwd(), `.twitter-account-${accountIndex}`);
      writeFileSync(
        credsFile,
        JSON.stringify({ accountId, username: user.username, name: user.name, ts: new Date().toISOString(), accountIndex }),
        'utf8'
      );
    } catch {}

    return NextResponse.json({
      success: true,
      user,
      accountId,
      accountIndex,
      profileDir: join(process.cwd(), accountIndex === 0 ? '.twitter-account' : `.twitter-account-${accountIndex}`),
      message: `Twitter credentials verified — logged in as @${user.username} (${user.name})`,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: `Cookies saved but verification failed: ${(err as Error).message}`,
      },
      { status: 422 }
    );
  } finally {
    await closeBrowser();
  }
}
