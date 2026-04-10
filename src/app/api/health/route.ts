import { NextRequest, NextResponse } from 'next/server';
import { getRedis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Check if requester is admin (via header or query param with secret)
  const isDetailed = req.headers.get('x-admin-key') === process.env.ADMIN_HEALTH_KEY;

  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  // Redis
  try {
    const redis = getRedis();
    const pong = await redis.ping();
    checks.redis = { ok: pong === 'PONG' };
  } catch (err) {
    checks.redis = { ok: false, ...(isDetailed && { detail: (err as Error).message }) };
  }

  // MongoDB
  try {
    const { connectDB } = await import('@/lib/mongodb');
    await connectDB();
    const mongoose = await import('mongoose');
    const state = mongoose.default.connection.readyState;
    checks.mongo = { ok: state === 1 };
  } catch (err) {
    checks.mongo = { ok: false, ...(isDetailed && { detail: (err as Error).message }) };
  }

  const allOk = Object.values(checks).every(c => c.ok);

  const response: Record<string, unknown> = {
    status: allOk ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
  };

  // Only expose detailed info to admin requests
  if (isDetailed) {
    response.uptime = process.uptime();
    response.checks = checks;
  }

  return NextResponse.json(response, { status: allOk ? 200 : 503 });
}
