import { NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/apiAuth';
import { connectDB } from '@/lib/mongodb';
import Settings from '@/models/Settings';
import crypto from 'crypto';

export async function POST() {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  await connectDB();

  const apiKey = `gm_${crypto.randomBytes(24).toString('hex')}`;

  await Settings.findOneAndUpdate(
    { userId },
    { $set: { extensionApiKey: apiKey } },
    { upsert: true },
  );

  return NextResponse.json({ apiKey });
}

export async function DELETE() {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  await connectDB();

  await Settings.findOneAndUpdate(
    { userId },
    { $set: { extensionApiKey: '' } },
  );

  return NextResponse.json({ ok: true });
}
