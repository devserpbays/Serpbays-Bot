import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import Settings from '@/models/Settings';

/**
 * Authenticate extension requests via X-Extension-Key header.
 * Returns the userId if valid, or a 401 NextResponse.
 */
export async function getExtensionUserId(req: NextRequest): Promise<string | NextResponse> {
  const apiKey = req.headers.get('X-Extension-Key');
  if (!apiKey) {
    return NextResponse.json({ error: 'Missing API key' }, { status: 401 });
  }

  await connectDB();
  const settings = await Settings.findOne({ extensionApiKey: apiKey }).lean() as { userId?: string } | null;
  if (!settings || !settings.userId) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
  }

  return settings.userId;
}
