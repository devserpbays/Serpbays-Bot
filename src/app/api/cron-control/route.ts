import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Settings from '@/models/Settings';

// GET — return current pause state
export async function GET() {
  await connectDB();
  const settings = await Settings.findOne().select('autoPostingPaused');
  return NextResponse.json({ paused: settings?.autoPostingPaused ?? false });
}

// POST — toggle or set pause state
export async function POST(req: NextRequest) {
  await connectDB();
  const body = await req.json().catch(() => ({}));

  // Accept explicit { paused: true/false } or just toggle
  const settings = await Settings.findOne();
  if (!settings) {
    return NextResponse.json({ error: 'Settings not configured' }, { status: 400 });
  }

  const newPaused = typeof body.paused === 'boolean'
    ? body.paused
    : !settings.autoPostingPaused;

  await Settings.findByIdAndUpdate(settings._id, { autoPostingPaused: newPaused });

  console.log(`[cron-control] Auto-posting ${newPaused ? 'PAUSED' : 'RESUMED'}`);
  return NextResponse.json({ paused: newPaused });
}
