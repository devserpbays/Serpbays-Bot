import { NextRequest, NextResponse } from 'next/server';
import { getExtensionUserId } from '@/lib/extensionAuth';
import { logActivity } from '@/lib/activityLog';

export const dynamic = 'force-dynamic';

/**
 * Extension sends logs to the server so they appear in the dashboard logs page.
 */
export async function POST(req: NextRequest) {
  const userId = await getExtensionUserId(req);
  if (userId instanceof NextResponse) return userId;

  let body: { platform?: string; level?: string; action?: string; message?: string; meta?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { platform, level, action, message, meta } = body;
  if (!platform || !message) {
    return NextResponse.json({ error: 'platform and message required' }, { status: 400 });
  }

  await logActivity(
    userId,
    platform,
    (level as 'info' | 'warn' | 'error' | 'success') || 'info',
    action || 'extension',
    `[Extension] ${message}`,
    meta,
  );

  return NextResponse.json({ ok: true });
}
