import { NextRequest, NextResponse } from 'next/server';
import { getExtensionUserId } from '@/lib/extensionAuth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const userId = await getExtensionUserId(req);
  if (userId instanceof NextResponse) return userId;

  let body: { platform?: string; loggedIn?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { platform, loggedIn } = body;
  if (!platform) return NextResponse.json({ error: 'platform required' }, { status: 400 });

  console.log(`[Extension] User ${userId} — ${platform} logged in: ${loggedIn}`);

  return NextResponse.json({ ok: true });
}
