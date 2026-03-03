import { NextRequest, NextResponse } from 'next/server';
import { chromium } from 'playwright';
import { join } from 'path';
import { writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

function normalizeSameSite(v: string | undefined): 'Strict' | 'Lax' | 'None' | undefined {
  if (!v) return undefined;
  const map: Record<string, 'Strict' | 'Lax' | 'None'> = {
    strict: 'Strict', lax: 'Lax', none: 'None',
    no_restriction: 'None', unspecified: 'Lax',
  };
  return map[v.toLowerCase()] ?? 'Lax';
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

  let cookiesInput = cookies;
  if (typeof cookiesInput === 'string') {
    const trimmed = cookiesInput.trim();
    if (trimmed.startsWith('[')) {
      try { cookiesInput = JSON.parse(trimmed); } catch {
        return NextResponse.json({ error: 'Invalid JSON cookie array' }, { status: 400 });
      }
    }
  }

  let cookieList: ParsedCookie[];
  if (typeof cookiesInput === 'string') {
    cookieList = cookiesInput.split(';').map((part) => {
      const [name, ...rest] = part.trim().split('=');
      return { name: name.trim(), value: rest.join('=').trim(), domain: '.youtube.com', path: '/', expires: FALLBACK_EXPIRES(), secure: true };
    }).filter((c) => c.name && c.value);
  } else if (Array.isArray(cookiesInput)) {
    cookieList = (cookiesInput as Record<string, unknown>[]).map((c) => {
      const rawExpiry = Number(c.expirationDate ?? c.expires ?? 0);
      return {
        name: String(c.name),
        value: String(c.value),
        domain: String(c.domain || '.youtube.com'),
        path: String(c.path || '/'),
        expires: rawExpiry > 0 ? Math.floor(rawExpiry) : FALLBACK_EXPIRES(),
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

  const PROFILE_DIR = join(process.cwd(), accountIndex === 0 ? '.youtube-profile' : `.youtube-profile-${accountIndex}`);
  mkdirSync(PROFILE_DIR, { recursive: true });

  // Kill orphaned Chromium processes using this profile, then clear lock files
  try { execSync(`pkill -f "${PROFILE_DIR}" 2>/dev/null || true`, { stdio: 'ignore' }); } catch {}
  await new Promise(r => setTimeout(r, 600));
  try { unlinkSync(join(PROFILE_DIR, 'SingletonLock')); } catch {}
  try { unlinkSync('/root/snap/chromium/common/chromium/SingletonLock'); } catch {}

  // Persist raw cookies to cookies.json for the cron script to use
  try {
    writeFileSync(join(PROFILE_DIR, 'cookies.json'), JSON.stringify(cookieList, null, 2));
  } catch {}

  let context;
  try {
    context = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
    });

    await context.addCookies(cookieList);

    const page = context.pages()[0] || (await context.newPage());
    await page.goto('https://www.youtube.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);

    const url = page.url();

    // Check if logged in — look for avatar button
    const isLoggedIn = await page.evaluate(() => {
      const avatar = document.querySelector('#avatar-btn, ytd-masthead #avatar-btn, button#avatar-btn');
      if (avatar) return true;
      const signIn = document.querySelector('a[href*="accounts.google.com"], yt-button-renderer a[href*="signin"]');
      if (signIn) return false;
      // Check if sign-in button text is visible
      const buttons = document.querySelectorAll('yt-button-renderer, a');
      for (const b of buttons) {
        if ((b.textContent || '').trim().toLowerCase() === 'sign in') return false;
      }
      return true;
    }).catch(() => false);

    // Extract account info
    let displayName = '';
    let username = '';
    try {
      const info = await page.evaluate(() => {
        const nameEl = document.querySelector('#account-name, yt-formatted-string#account-name');
        const name = (nameEl?.textContent || '').trim();
        const channelLinks = document.querySelectorAll('a[href*="/@"]');
        let handle = '';
        for (const link of channelLinks) {
          const m = link.getAttribute('href')?.match(/\/@([^/?]+)/);
          if (m) { handle = m[1]; break; }
        }
        return { name, handle };
      });
      displayName = info.name || '';
      username = info.handle || '';
    } catch {}

    await context.close();
    context = undefined;

    if (url.includes('/signin') || url.includes('accounts.google.com')) {
      writeFileSync(join(PROFILE_DIR, '.verified'), JSON.stringify({ loggedIn: false, ts: new Date().toISOString(), message: 'Cookies invalid — redirected to sign-in' }));
      return NextResponse.json({ success: false, loggedIn: false, message: 'Cookies invalid — redirected to sign-in' });
    }

    if (!isLoggedIn) {
      writeFileSync(join(PROFILE_DIR, '.verified'), JSON.stringify({ loggedIn: false, ts: new Date().toISOString(), message: 'Cookies invalid — not logged in' }));
      return NextResponse.json({ success: false, loggedIn: false, message: 'Cookies invalid — not logged in to YouTube' });
    }

    const accountId = username ? `yt_${username}` : `yt_${Date.now()}`;
    writeFileSync(join(PROFILE_DIR, '.verified'), JSON.stringify({
      loggedIn: true, ts: new Date().toISOString(),
      accountId, username, displayName,
      message: 'YouTube cookies injected and session verified',
    }));

    return NextResponse.json({
      success: true, loggedIn: true, url,
      accountId, username, displayName,
      profileDir: PROFILE_DIR, accountIndex,
      message: 'YouTube cookies injected and session verified',
    });
  } catch (err) {
    await context?.close().catch(() => {});
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 });
  }
}
