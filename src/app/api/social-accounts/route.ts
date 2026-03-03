import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Settings from '@/models/Settings';
import type { SocialAccount } from '@/lib/types';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-dynamic';

const PLATFORM_PROFILE_DIRS: { platform: string; prefix: string }[] = [
  { platform: 'twitter',   prefix: '.twitter-profile' },
  { platform: 'reddit',    prefix: '.reddit-profile' },
  { platform: 'facebook',  prefix: '.fb-profile' },
  { platform: 'quora',     prefix: '.quora-profile' },
  { platform: 'youtube',   prefix: '.youtube-profile' },
  { platform: 'pinterest', prefix: '.pinterest-profile' },
];

function readVerifiedAccounts(): SocialAccount[] {
  const accounts: SocialAccount[] = [];
  const cwd = process.cwd();

  for (const { platform, prefix } of PLATFORM_PROFILE_DIRS) {
    // Check index 0 (no suffix) and up to 5 additional slots
    for (let idx = 0; idx <= 5; idx++) {
      const profileDir = join(cwd, idx === 0 ? prefix : `${prefix}-${idx}`);
      const verifiedFile = join(profileDir, '.verified');
      if (!existsSync(verifiedFile)) continue;

      try {
        const data = JSON.parse(readFileSync(verifiedFile, 'utf-8'));
        if (!data.loggedIn) continue;

        accounts.push({
          id: data.accountId || `${platform}_${idx}`,
          platform,
          username: data.username || '',
          displayName: data.displayName || data.username || '',
          profileDir,
          accountIndex: idx,
          addedAt: data.ts || new Date().toISOString(),
          active: true,
        });
      } catch { /* skip corrupt file */ }
    }
  }

  return accounts;
}

// GET — return all social accounts from .verified files
export async function GET() {
  const accounts = readVerifiedAccounts();
  return NextResponse.json({ accounts });
}

// POST — add a new social account
export async function POST(req: NextRequest) {
  await connectDB();
  const account: SocialAccount = await req.json();

  if (!account.id || !account.platform) {
    return NextResponse.json({ error: 'id and platform are required' }, { status: 400 });
  }

  let settings = await Settings.findOne();
  if (!settings) {
    return NextResponse.json({ error: 'Settings not found — save settings first' }, { status: 404 });
  }

  // Remove any existing account with same id (upsert)
  settings.socialAccounts = (settings.socialAccounts || []).filter(
    (a: SocialAccount) => a.id !== account.id
  );
  settings.socialAccounts.push(account);
  await settings.save();

  return NextResponse.json({ success: true, accounts: settings.socialAccounts });
}

// DELETE — remove a social account by id
export async function DELETE(req: NextRequest) {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'id query param required' }, { status: 400 });
  }

  const settings = await Settings.findOne();
  if (!settings) {
    return NextResponse.json({ error: 'Settings not found' }, { status: 404 });
  }

  settings.socialAccounts = (settings.socialAccounts || []).filter(
    (a: SocialAccount) => a.id !== id
  );
  await settings.save();

  return NextResponse.json({ success: true, accounts: settings.socialAccounts });
}
