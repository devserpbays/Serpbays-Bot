import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Settings from '@/models/Settings';
import type { SocialAccount } from '@/lib/types';
import { getAuthUserId } from '@/lib/apiAuth';
import { deleteCookies } from '@/lib/cookieStore';
import { rm } from 'fs/promises';
import { existsSync } from 'fs';

export const dynamic = 'force-dynamic';

// GET — return social accounts for the authenticated user
// Merges Settings.socialAccounts with verified BrowserCookies to catch any out-of-sync entries
// Also attaches verifiedAt + cookieVerified from BrowserCookie so UI can show cookie status
export async function GET() {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  await connectDB();
  const settings = await Settings.findOne({ userId });
  const accounts: SocialAccount[] = [...(settings?.socialAccounts ?? [])];

  // Load all verified BrowserCookie docs for this user
  const BrowserCookie = (await import('@/models/BrowserCookie')).default;
  const allCookies = await BrowserCookie.find(
    { userId },
    { platform: 1, accountId: 1, username: 1, displayName: 1, verified: 1, verifiedAt: 1 },
  ).lean();

  // Build a map: platform → cookie metadata
  const cookieMap = new Map<string, { verified: boolean; verifiedAt?: string; username?: string; displayName?: string; accountId?: string }>();
  for (const c of allCookies) {
    cookieMap.set(c.platform, {
      verified: !!c.verified,
      verifiedAt: c.verifiedAt ? new Date(c.verifiedAt).toISOString() : undefined,
      username: c.username || '',
      displayName: c.displayName || '',
      accountId: c.accountId || '',
    });
  }

  // Enrich existing accounts with cookie status + fill in missing username from BrowserCookie
  // Also remove stale entries whose BrowserCookie document no longer exists (TTL-deleted or never saved)
  let settingsNeedsSave = false;
  const validAccounts: SocialAccount[] = [];
  for (const acc of accounts) {
    const cookie = cookieMap.get(acc.platform);
    if (cookie) {
      // BrowserCookie exists (verified or not) — keep the account
      acc.cookieVerified = cookie.verified;
      acc.verifiedAt = cookie.verifiedAt;
      if (!acc.username && cookie.username) acc.username = cookie.username;
      if (!acc.displayName && cookie.displayName) acc.displayName = cookie.displayName;
      validAccounts.push(acc);
    } else {
      // No BrowserCookie document at all — entry is stale, remove it
      settingsNeedsSave = true;
    }
  }

  // Persist cleanup if any stale entries were removed
  if (settingsNeedsSave && settings) {
    settings.socialAccounts = validAccounts;
    await settings.save().catch(() => {});
  }

  // Add any verified cookie entries not yet in socialAccounts
  const existingPlatforms = new Set(validAccounts.map((a: SocialAccount) => a.platform));
  for (const [platform, cookie] of cookieMap.entries()) {
    if (!existingPlatforms.has(platform) && cookie.verified) {
      const newAcc: SocialAccount = {
        id: cookie.accountId || `${platform.slice(0, 2)}_${userId}`,
        platform,
        username: cookie.username || '',
        displayName: cookie.displayName || '',
        profileDir: `profiles/${userId}/${platform}`,
        accountIndex: 0,
        addedAt: cookie.verifiedAt || new Date().toISOString(),
        active: true,
        cookieVerified: true,
        verifiedAt: cookie.verifiedAt,
      };
      validAccounts.push(newAcc);

      // Backfill into Settings so it stays in sync
      if (settings) {
        settings.socialAccounts = validAccounts;
        await settings.save().catch(() => {});
      }
    }
  }

  return NextResponse.json({ accounts: validAccounts });
}

// DELETE — remove a social account by id from the user's Settings
// Also cleans up the profile directory and BrowserCookie entry
export async function DELETE(req: NextRequest) {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  await connectDB();
  let body: { accountId?: string };
  try { body = await req.json(); } catch { body = {}; }
  const id = body.accountId;

  if (!id) {
    return NextResponse.json({ error: 'accountId required' }, { status: 400 });
  }

  const settings = await Settings.findOne({ userId });
  if (!settings) {
    return NextResponse.json({ error: 'Settings not found' }, { status: 404 });
  }

  // Find the account before removing to get platform + profileDir
  const removedAccount = (settings.socialAccounts || []).find(
    (a: SocialAccount) => a.id === id
  );

  settings.socialAccounts = (settings.socialAccounts || []).filter(
    (a: SocialAccount) => a.id !== id
  );
  await settings.save();

  if (removedAccount) {
    // Delete BrowserCookie entry so the account doesn't reappear on next GET
    await deleteCookies(userId, removedAccount.platform);

    // Clean up the profile directory (cookies.json, browser data)
    if (removedAccount.profileDir) {
      try {
        const resolved = require('path').resolve(process.cwd(), removedAccount.profileDir);
        const profilesBase = require('path').resolve(process.cwd(), 'profiles');
        if (resolved.startsWith(profilesBase + '/') && existsSync(resolved)) {
          await rm(resolved, { recursive: true, force: true });
          console.log(`[social-accounts] Removed profile dir: ${resolved}`);
        }
      } catch (err) {
        console.error(`[social-accounts] Failed to remove profile dir: ${(err as Error).message}`);
      }
    }
  }

  return NextResponse.json({
    success: true,
    accounts: settings.socialAccounts,
    removed: removedAccount ? { platform: removedAccount.platform, username: removedAccount.username } : null,
  });
}
