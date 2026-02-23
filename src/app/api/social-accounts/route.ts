import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Settings from '@/models/Settings';
import type { SocialAccount } from '@/lib/types';

export const dynamic = 'force-dynamic';

// GET — return all social accounts
export async function GET() {
  await connectDB();
  const settings = await Settings.findOne().lean() as { socialAccounts?: SocialAccount[] } | null;
  return NextResponse.json({ accounts: settings?.socialAccounts ?? [] });
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
