import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getAuthUserId } from '@/lib/apiAuth';
import { connectDB } from '@/lib/mongodb';
import Settings from '@/models/Settings';

export const dynamic = 'force-dynamic';

interface AccountInfo {
  accountId: string;
  displayName: string;
  username: string;
  ts: string;
}

function readVerified(profileDir: string): AccountInfo | null {
  try {
    const raw = readFileSync(join(process.cwd(), profileDir, '.verified'), 'utf-8');
    const data = JSON.parse(raw);
    if (!data.loggedIn) return null;
    return {
      accountId: data.accountId || '',
      displayName: data.displayName || '',
      username: data.username || '',
      ts: data.ts || '',
    };
  } catch {
    return null;
  }
}

export async function GET() {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  await connectDB();
  const settings = await Settings.findOne({ userId }).lean();
  const socialAccounts = (settings?.socialAccounts || []) as Array<{ platform: string; profileDir: string; active?: boolean }>;

  const accounts: Record<string, AccountInfo> = {};

  for (const acc of socialAccounts) {
    if (acc.active === false || !acc.profileDir) continue;
    const info = readVerified(acc.profileDir);
    if (info) accounts[acc.platform] = info;
  }

  return NextResponse.json({ accounts });
}
