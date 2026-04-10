import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Settings from '@/models/Settings';
import { getAuthUserId } from '@/lib/apiAuth';

// GET — return current pause state
export async function GET() {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  await connectDB();
  const settings = await Settings.findOne({ userId }).select('autoPostingPaused');
  return NextResponse.json({ paused: settings?.autoPostingPaused ?? false });
}

// POST — toggle or set pause state
export async function POST(req: NextRequest) {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  await connectDB();
  const body = await req.json().catch(() => ({}));

  const settings = await Settings.findOne({ userId });
  if (!settings) {
    return NextResponse.json({ error: 'Settings not configured' }, { status: 400 });
  }

  const newPaused = typeof body.paused === 'boolean'
    ? body.paused
    : !settings.autoPostingPaused;

  try {
    await Settings.findByIdAndUpdate(settings._id, { autoPostingPaused: newPaused });
  } catch (err) {
    console.error(`[cron-control] Failed to update pause state for user ${userId}:`, (err as Error).message);
    return NextResponse.json({ error: 'Failed to update pause state' }, { status: 500 });
  }

  console.log(`[cron-control] Auto-posting ${newPaused ? 'PAUSED' : 'RESUMED'} for user ${userId}`);
  return NextResponse.json({ paused: newPaused });
}
