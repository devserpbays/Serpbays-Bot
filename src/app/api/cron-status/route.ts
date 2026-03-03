import { NextResponse } from 'next/server';
import { readCronStatus } from '@/lib/cronState';

export const dynamic = 'force-dynamic';

export async function GET() {
  const crons = readCronStatus();

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
