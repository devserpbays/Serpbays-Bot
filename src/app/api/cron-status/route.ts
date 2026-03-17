import { NextResponse } from 'next/server';
import { readCronStatus } from '@/lib/cronState';
import { getAuthUserId } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;
  const allCrons = await readCronStatus();
  // Filter to only show this user's statuses
  const crons: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(allCrons)) {
    // Keys are "userId:platform" or legacy "platform"
    if (key.startsWith(`${userId}:`)) {
      crons[key.replace(`${userId}:`, '')] = value;
    }
  }

  // Calculate next */15 cron slot
  const now = new Date();
  const min = now.getMinutes();
  const nextSlot = Math.ceil((min + 1) / 15) * 15;
  const nextRun = new Date(now);
  nextRun.setMinutes(nextSlot % 60, 0, 0);
  if (nextSlot >= 60) nextRun.setHours(nextRun.getHours() + 1);

  return NextResponse.json({
    crons,
    nextRunAt: nextRun.toISOString(),
    serverTime: now.toISOString(),
  });
}
