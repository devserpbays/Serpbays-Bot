import { NextRequest, NextResponse } from 'next/server';
import { chromium } from 'playwright';
import { join } from 'path';
import { writeFileSync, unlinkSync } from 'fs';

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

function parseCookieString(str: string): ParsedCookie[] {
  return str
    .split(';')
    .map((part) => {
      const [name, ...rest] = part.trim().split('=');
      return {
        name: name.trim(),
        value: rest.join('=').trim(),
        domain: '.reddit.com',
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
        domain: String(c.domain || '.reddit.com'),
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

  const PROFILE_DIR = join(process.cwd(), '.reddit-profile');
  let context;

  // Remove stale browser lock from previous crash
  try { unlinkSync(join(PROFILE_DIR, 'SingletonLock')); } catch {}

  try {
    context = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
      ],
      userAgent:
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
    });

    await context.addCookies(cookieList);

    const page = context.pages()[0] || (await context.newPage());
    await page.goto('https://www.reddit.com', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(3000);

    const url = page.url();
    const title = await page.title().catch(() => '');

    // Try to extract Reddit username from the page
    let accountId = '';
    try {
      accountId = await page.evaluate(() => {
        // Reddit stores username in various places
        const meta = document.querySelector('meta[name="user"]');
        if (meta) return 'rd_' + meta.getAttribute('content');
        // Try the profile link
        const profileLink = document.querySelector('a[href*="/user/"]');
        if (profileLink) {
          const m = profileLink.getAttribute('href')?.match(/\/user\/([^/?]+)/);
          if (m) return 'rd_' + m[1];
        }
        return '';
      }) || '';
    } catch {}
    // Fallback: extract from reddit_session cookie
    if (!accountId) {
      const sessionCookie = cookieList.find((c) => c.name === 'reddit_session');
      if (sessionCookie?.value) {
        accountId = 'rd_' + sessionCookie.value.slice(0, 16);
      }
    }

    // Extract username from accountId and try to get display name
    let username = accountId.startsWith('rd_') ? accountId.slice(3) : '';
    let displayName = '';
    try {
      displayName = await page.evaluate(() => {
        // Try user dropdown or profile section for display name
        const userMenu = document.querySelector('[id*="USER_DROPDOWN"] span, [data-testid="user-drawer-name"]');
        if (userMenu) return (userMenu.textContent || '').trim();
        // Try header profile name
        const profileName = document.querySelector('.header-user-dropdown span, [data-testid="username-display"]');
        if (profileName) return (profileName.textContent || '').trim();
        return '';
      }) || '';
    } catch {}
    // Fallback: use username as display name
    if (!displayName) displayName = username;

    await context.close();
    context = undefined;

    const isLogin =
      url.includes('/login') ||
      url.includes('/register') ||
      url.includes('/account/login');

    const isCaptcha =
      url.includes('captcha') || title.toLowerCase().includes('verification');

    if (isCaptcha) {
      return NextResponse.json({
        success: false,
        captcha: true,
        humanRequired: true,
        url,
        message: 'CAPTCHA detected — human verification required',
      });
    }

    if (isLogin) {
      try {
        writeFileSync(join(PROFILE_DIR, '.verified'), JSON.stringify({ loggedIn: false, ts: new Date().toISOString(), message: 'Cookies invalid or expired' }));
      } catch {}
      return NextResponse.json({
        success: false,
        loggedIn: false,
        url,
        message: 'Cookies invalid or expired — Reddit redirected to login page',
      });
    }

    // Write success verification marker with account ID
    try {
      writeFileSync(join(PROFILE_DIR, '.verified'), JSON.stringify({ loggedIn: true, ts: new Date().toISOString(), message: 'Reddit cookies injected and session verified', accountId, displayName, username }));
    } catch {}

    return NextResponse.json({
      success: true,
      loggedIn: true,
      url,
      accountId,
      displayName,
      username,
      message: 'Reddit cookies injected and session verified',
    });
  } catch (err) {
    await context?.close().catch(() => {});
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
