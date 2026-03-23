import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/apiAuth';
import { connectDB } from '@/lib/mongodb';
import BrowserCookie from '@/models/BrowserCookie';
import { RESUME_THRESHOLD } from '@/lib/accountHealth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  const { platform } = await req.json().catch(() => ({}));
  if (!platform) return NextResponse.json({ error: 'platform required' }, { status: 400 });

  await connectDB();

  const result = await BrowserCookie.updateOne(
    { userId, platform },
    {
      $set: {
        autoPaused:  false,
        errorCount:  0,
        backoffUntil: null,
        healthScore: RESUME_THRESHOLD, // start at 50 — must earn its way back up
      },
    }
  );

  if (result.matchedCount === 0) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, platform });
}
