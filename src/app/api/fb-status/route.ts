import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { getAuthUserId } from '@/lib/apiAuth';
import { connectDB } from '@/lib/mongodb';
import Settings from '@/models/Settings';

export const dynamic = 'force-dynamic';

export async function GET() {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  await connectDB();
  const settings = await Settings.findOne({ userId }).lean();
  const account = ((settings?.socialAccounts || []) as Array<{ platform: string; profileDir: string }>)
    .find(a => a.platform === 'facebook');

  if (!account?.profileDir) {
    return NextResponse.json({
      loggedIn: false,
      message: 'Not connected. Add your Facebook account to get started.',
    });
  }

  const verifiedFile = join(process.cwd(), account.profileDir, '.verified');

  try {
    if (!existsSync(verifiedFile)) {
      return NextResponse.json({
        loggedIn: false,
        profileDir: account.profileDir,
        message: 'Not logged in. Use cookie login to authenticate.',
      });
    }

    const data = JSON.parse(readFileSync(verifiedFile, 'utf-8'));
    return NextResponse.json({
      loggedIn: data.loggedIn ?? false,
      profileDir: account.profileDir,
      verifiedAt: data.ts,
      message: data.loggedIn
        ? 'Facebook session is active'
        : data.message || 'Not logged in. Use cookie login to authenticate.',
    });
  } catch {
    return NextResponse.json({
      loggedIn: false,
      profileDir: account.profileDir,
      message: 'Not logged in. Use cookie login to authenticate.',
    });
  }
}
