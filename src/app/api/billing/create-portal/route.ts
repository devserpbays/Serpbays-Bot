import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/apiAuth';
import { stripe } from '@/lib/stripe';
import { connectDB } from '@/lib/mongodb';
import Subscription from '@/models/Subscription';
import { checkRateLimit } from '@/lib/rateLimit';

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  const rl = checkRateLimit(userId, 'billing');
  if (rl) return NextResponse.json({ error: rl.error }, { status: 429 });

  await connectDB();
  const sub = await Subscription.findOne({ userId });

  if (!sub?.stripeCustomerId) {
    return NextResponse.json({ error: 'No billing account found' }, { status: 400 });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: `${req.nextUrl.origin}/dashboard/billing`,
  });

  return NextResponse.json({ url: session.url });
}
