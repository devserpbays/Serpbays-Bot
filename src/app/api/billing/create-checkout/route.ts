import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/apiAuth';
import { stripe } from '@/lib/stripe';
import { connectDB } from '@/lib/mongodb';
import Subscription from '@/models/Subscription';
import { PLANS } from '@/lib/plans';
import { checkRateLimit } from '@/lib/rateLimit';

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  const rl = checkRateLimit(userId, 'billing');
  if (rl) return NextResponse.json({ error: rl.error }, { status: 429 });

  const { priceId, planId } = await req.json();
  if (!priceId || !planId) {
    return NextResponse.json({ error: 'Missing priceId or planId' }, { status: 400 });
  }

  // Validate plan exists
  if (!PLANS[planId]) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
  }

  await connectDB();

  // Get or create Stripe customer
  let sub = await Subscription.findOne({ userId });
  let customerId = sub?.stripeCustomerId;

  if (!customerId) {
    const customer = await stripe.customers.create({
      metadata: { userId },
    });
    customerId = customer.id;

    if (sub) {
      sub.stripeCustomerId = customerId;
      await sub.save();
    } else {
      await Subscription.create({
        userId,
        stripeCustomerId: customerId,
        plan: 'free',
        status: 'active',
      });
    }
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${req.nextUrl.origin}/dashboard/billing?success=true`,
    cancel_url: `${req.nextUrl.origin}/dashboard/billing?canceled=true`,
    metadata: { userId, planId },
    subscription_data: {
      metadata: { userId, planId },
    },
  });

  return NextResponse.json({ url: session.url });
}
