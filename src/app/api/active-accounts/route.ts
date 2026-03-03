import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

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
  const accounts: Record<string, AccountInfo> = {};

  const platforms: Array<{ key: string; dir: string }> = [
    { key: 'facebook',  dir: '.fb-profile' },
    { key: 'twitter',   dir: '.twitter-profile' },
    { key: 'reddit',    dir: '.reddit-profile' },
    { key: 'quora',     dir: '.quora-profile' },
    { key: 'pinterest', dir: '.pinterest-profile' },
    { key: 'youtube',   dir: '.youtube-profile' },
  ];

  for (const { key, dir } of platforms) {
    const info = readVerified(dir);
    if (info) accounts[key] = info;
  }

  return NextResponse.json({ accounts });
}
