import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Settings from '@/models/Settings';
import type { SocialAccount } from '@/lib/types';
import { getAuthUserId } from '@/lib/apiAuth';
import { rm } from 'fs/promises';
import { existsSync } from 'fs';

export const dynamic = 'force-dynamic';

// GET — return social accounts for the authenticated user from Settings
export async function GET() {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  await connectDB();
  const settings = await Settings.findOne({ userId });
  const accounts: SocialAccount[] = settings?.socialAccounts ?? [];
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
      if (existsSync(removedAccount.profileDir)) {
        await rm(removedAccount.profileDir, { recursive: true, force: true });
        console.log(`[social-accounts] Removed profile dir: ${removedAccount.profileDir}`);
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
