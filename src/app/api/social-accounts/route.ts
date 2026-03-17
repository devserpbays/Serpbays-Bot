import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Settings from '@/models/Settings';
import type { SocialAccount } from '@/lib/types';
import { getAuthUserId } from '@/lib/apiAuth';
import { rm } from 'fs/promises';
import { existsSync } from 'fs';

export const dynamic = 'force-dynamic';

// GET — return social accounts for the authenticated user
// Merges Settings.socialAccounts with verified BrowserCookies to catch any out-of-sync entries
export async function GET() {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  await connectDB();
  const settings = await Settings.findOne({ userId });
  const accounts: SocialAccount[] = [...(settings?.socialAccounts ?? [])];

  // Also check BrowserCookie for verified platforms not in socialAccounts
  const BrowserCookie = (await import('@/models/BrowserCookie')).default;
  const verifiedCookies = await BrowserCookie.find(
    { userId, verified: true },
    { platform: 1, accountId: 1, username: 1, displayName: 1 },
  ).lean();

  const existingPlatforms = new Set(accounts.map((a: SocialAccount) => a.platform));
  for (const cookie of verifiedCookies) {
    if (!existingPlatforms.has(cookie.platform)) {
      // Verified cookie exists but no socialAccount entry — add it
      const newAcc = {
        id: cookie.accountId || `${cookie.platform.slice(0, 2)}_${userId}`,
        platform: cookie.platform,
        username: cookie.username || '',
        displayName: cookie.displayName || '',
        profileDir: `profiles/${userId}/${cookie.platform}`,
        accountIndex: 0,
        addedAt: new Date().toISOString(),
        active: true,
      };
      accounts.push(newAcc as SocialAccount);

      // Also backfill into Settings so it stays in sync
      if (settings) {
        settings.socialAccounts = accounts;
        await settings.save().catch(() => {});
      }
    }
  }

  return NextResponse.json({ accounts });
}

// DELETE — remove a social account by id from the user's Settings
// Also cleans up the profile directory (cookies, browser data)
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

  // Find the account before removing to get profileDir
  const removedAccount = (settings.socialAccounts || []).find(
    (a: SocialAccount) => a.id === id
  );

  settings.socialAccounts = (settings.socialAccounts || []).filter(
    (a: SocialAccount) => a.id !== id
  );
  await settings.save();

  // Clean up the profile directory (cookies, browser data)
  if (removedAccount?.profileDir) {
    try {
      const resolved = require('path').resolve(process.cwd(), removedAccount.profileDir);
      const profilesBase = require('path').resolve(process.cwd(), 'profiles');
      // Only allow deletion within the profiles/ directory to prevent path traversal
      if (resolved.startsWith(profilesBase + '/') && existsSync(resolved)) {
        await rm(resolved, { recursive: true, force: true });
        console.log(`[social-accounts] Removed profile dir: ${resolved}`);
      }
    } catch (err) {
      console.error(`[social-accounts] Failed to remove profile dir: ${(err as Error).message}`);
    }
  }

  return NextResponse.json({
    success: true,
    accounts: settings.socialAccounts,
    removed: removedAccount ? { platform: removedAccount.platform, username: removedAccount.username } : null,
  });
}
