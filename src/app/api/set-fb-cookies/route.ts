import { NextRequest, NextResponse } from 'next/server';
import { chromium } from 'playwright';
import { join } from 'path';
import { writeFileSync, unlinkSync } from 'fs';
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

// Fallback expiry: 90 days from now, so cookies are always persisted to disk
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

// Cookie Editor extension exports sameSite as "no_restriction" — map to Playwright's "None"
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

  let cookieList: ParsedCookie[];
  // Handle JSON string pasted as-is (e.g. from Cookie Editor extension)
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
      // Cookie Editor uses "expirationDate" (Unix float); fall back to 90 days if absent/0
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

  const PROFILE_DIR = join(process.cwd(), accountIndex === 0 ? '.fb-profile' : `.fb-profile-${accountIndex}`);
  let context;

  // Kill orphaned Chromium processes using this profile, then clear lock files
  try { execSync(`pkill -f "${PROFILE_DIR}" 2>/dev/null || true`, { stdio: 'ignore' }); } catch {}
  await new Promise(r => setTimeout(r, 600));
  try { unlinkSync(join(PROFILE_DIR, 'SingletonLock')); } catch {}
  try { unlinkSync('/root/snap/chromium/common/chromium/SingletonLock'); } catch {}

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

    // Inject cookies before navigation
    await context.addCookies(cookieList);

    const page = context.pages()[0] || (await context.newPage());
    await page.goto('https://www.facebook.com', {
      waitUntil: 'commit',
      timeout: 30000,
    });
    // Wait for Facebook SPA to render enough content
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(1000);
      const bodyLen = await page.evaluate(() => document.body?.textContent?.length || 0).catch(() => 0);
      if (bodyLen > 500) break;
    }

    // Scrape display name and username from the loaded page
    let displayName = '';
    let username = '';
    try {
      const profileInfo = await page.evaluate(() => {
        let name = '';
        let uname = '';
        // Try profile shortcut link in the left nav
        const profileLinks = document.querySelectorAll('a[href*="/profile.php"], a[href*="facebook.com/"]');
        for (const link of profileLinks) {
          const href = link.getAttribute('href') || '';
          const text = (link.textContent || '').trim();
          // Skip generic links, look for nav/shortcut profile links with user's name
          if (text && text.length > 1 && text.length < 60 && !href.includes('/groups/') && !href.includes('/pages/')) {
            if (href.includes('/profile.php')) {
              if (!name) name = text;
            } else {
              // Vanity URL: extract slug
              const m = href.match(/facebook\.com\/([a-zA-Z0-9.]+)\/?$/);
              if (m && m[1] !== 'home' && m[1] !== 'watch' && m[1] !== 'marketplace' && m[1] !== 'groups' && m[1] !== 'gaming') {
                if (!uname) uname = m[1];
                if (!name) name = text;
              }
            }
          }
        }
        // Fallback: try aria-label on profile navigation
        if (!name) {
          const navLinks = document.querySelectorAll('[aria-label]');
          for (const el of navLinks) {
            const label = el.getAttribute('aria-label') || '';
            if (label.includes('profile') || label.includes('Profile')) {
              const text = (el.textContent || '').trim();
              if (text && text.length > 1 && text.length < 60) {
                name = text;
                break;
              }
            }
          }
        }
        return { displayName: name, username: uname };
      });
      displayName = profileInfo.displayName || '';
      username = profileInfo.username || '';
    } catch {}

    const url = page.url();
    const title = await page.title().catch(() => '');

    await context.close();
    context = undefined;

    const isCheckpoint = url.includes('/checkpoint') || url.includes('checkpoint/');
    const isCaptcha =
      url.includes('captcha') || title.toLowerCase().includes('security check');
    const isLogin =
      url.includes('/login') ||
      url.includes('login_attempt') ||
      url.includes('/reg');

    if (isCheckpoint || isCaptcha) {
      return NextResponse.json({
        success: false,
        captcha: true,
        humanRequired: true,
        url,
        message: 'Checkpoint / CAPTCHA detected — human verification required',
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
        message: 'Cookies invalid or expired — Facebook redirected to login page',
      });
    }

    // Extract account identity from c_user cookie
    const cUserCookie = cookieList.find((c) => c.name === 'c_user');
    const accountId = cUserCookie ? `fb_${cUserCookie.value}` : '';

    // Write success verification marker with account ID
    try {
      writeFileSync(join(PROFILE_DIR, '.verified'), JSON.stringify({ loggedIn: true, ts: new Date().toISOString(), message: 'Facebook cookies injected and session verified', accountId, displayName, username }));
    } catch {}

    return NextResponse.json({
      success: true,
      loggedIn: true,
      url,
      accountId,
      displayName,
      username,
      profileDir: PROFILE_DIR,
      accountIndex,
      message: 'Facebook cookies injected and session verified',
    });
  } catch (err) {
    await context?.close().catch(() => {});
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
