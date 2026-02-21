import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  const PROFILE_DIR = join(process.cwd(), '.linkedin-profile');
  const verifiedFile = join(PROFILE_DIR, '.verified');

  try {
    if (!existsSync(verifiedFile)) {
      return NextResponse.json({
        loggedIn: false,
        profileDir: PROFILE_DIR,
        message: 'Not logged in. Use cookie login to authenticate.',
      });
    }

    const data = JSON.parse(readFileSync(verifiedFile, 'utf-8'));
    return NextResponse.json({
      loggedIn: data.loggedIn ?? false,
      profileDir: PROFILE_DIR,
      verifiedAt: data.ts,
      message: data.loggedIn
        ? 'LinkedIn session is active'
        : data.message || 'Not logged in. Use cookie login to authenticate.',
    });
  } catch {
    return NextResponse.json({
      loggedIn: false,
      profileDir: PROFILE_DIR,
      message: 'Not logged in. Use cookie login to authenticate.',
    });
  }
}
