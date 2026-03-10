import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { getAuthUserId } from '@/lib/apiAuth';
import { connectDB } from '@/lib/mongodb';
import Settings from '@/models/Settings';
import { verifyCredentialsHttp, isTwitterConfiguredHttp } from '@/lib/twitterHttp';

export const dynamic = 'force-dynamic';

export async function GET() {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  await connectDB();
  const settings = await Settings.findOne({ userId }).lean();
  const account = ((settings?.socialAccounts || []) as Array<{ platform: string; profileDir: string }>)
    .find(a => a.platform === 'twitter');

  if (!account?.profileDir) {
    return NextResponse.json({
      configured: false,
      loggedIn: false,
      message: 'Not connected. Add your Twitter account to get started.',
    });
  }

  const profileDir = join(process.cwd(), account.profileDir);

  if (!isTwitterConfiguredHttp(profileDir)) {
    return NextResponse.json({
      configured: false,
      loggedIn: false,
      profileDir: account.profileDir,
      message: 'Twitter cookies not found. Use cookie login to authenticate.',
    });
  }

  try {
    const user = await verifyCredentialsHttp(profileDir);
    return NextResponse.json({
      configured: true,
      loggedIn: true,
      profileDir: account.profileDir,
      user,
    });
  } catch (err) {
    // Fall back to reading .verified file
    const verifiedFile = join(profileDir, '.verified');
    if (existsSync(verifiedFile)) {
      try {
        const data = JSON.parse(readFileSync(verifiedFile, 'utf-8'));
        return NextResponse.json({
          configured: true,
          loggedIn: data.loggedIn ?? false,
          profileDir: account.profileDir,
          verifiedAt: data.ts,
          message: data.loggedIn
            ? 'Twitter session is active'
            : `Credentials invalid: ${(err as Error).message}`,
        });
      } catch {
        // fall through
      }
    }

    return NextResponse.json({
      configured: true,
      loggedIn: false,
      profileDir: account.profileDir,
      error: `Credentials invalid: ${(err as Error).message}`,
    });
  }
}
