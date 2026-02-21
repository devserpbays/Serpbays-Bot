import { NextResponse } from 'next/server';
import { isTwitterConfigured, verifyCredentials, closeBrowser } from '@/lib/twitter';

export async function GET() {
  if (!isTwitterConfigured()) {
    return NextResponse.json({ configured: false, error: 'Twitter API credentials not set' });
  }

  try {
    const user = await verifyCredentials();
    return NextResponse.json({ configured: true, user });
  } catch (err) {
    return NextResponse.json({
      configured: true,
      error: `Credentials invalid: ${(err as Error).message}`,
    });
  } finally {
    await closeBrowser();
  }
}
