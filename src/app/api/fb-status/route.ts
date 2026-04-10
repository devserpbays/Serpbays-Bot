import { NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/apiAuth';
import { connectDB } from '@/lib/mongodb';
import Settings from '@/models/Settings';
import AccountState from '@/models/AccountState';

export const dynamic = 'force-dynamic';

/**
 * Lightweight Facebook connection status — backed by AccountState (written by
 * the extension) and Settings.socialAccounts. The legacy Playwright cookie
 * checks (cookies.json on disk, .verified file, c_user expiry) are gone.
 */
export async function GET() {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  await connectDB();

  const settings = await Settings.findOne({ userId }).lean();
  const account = ((settings?.socialAccounts || []) as Array<{ platform: string; username?: string }>)
    .find(a => a.platform === 'facebook');

  if (!account) {
    return NextResponse.json({
      loggedIn: false,
      message: 'Facebook is not connected. Install the extension and log into Facebook in your browser.',
    });
  }

  const state = await AccountState.findOne({ userId, platform: 'facebook' }).lean() as Record<string, unknown> | null;
  const autoPaused = !!(state?.autoPaused);

  return NextResponse.json({
    loggedIn: !autoPaused,
    username: account.username || '',
    healthScore: (state?.healthScore as number) ?? 100,
    autoPaused,
    message: autoPaused
      ? ((state?.autoPausedReason as string) || 'Account is paused — resume from the Accounts page.')
      : 'Facebook is connected via the extension.',
  });
}
