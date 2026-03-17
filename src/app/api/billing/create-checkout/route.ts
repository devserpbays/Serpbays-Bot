import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/apiAuth';
import { paypalRequest } from '@/lib/paypal';
import { connectDB } from '@/lib/mongodb';
import Subscription from '@/models/Subscription';
import { PLANS } from '@/lib/plans';
import { checkRateLimit } from '@/lib/rateLimit';

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  const rl = await checkRateLimit(userId, 'billing');
  if (rl) return NextResponse.json({ error: rl.error }, { status: 429 });

  const { planId, yearly } = await req.json();
  if (!planId) {
    return NextResponse.json({ error: 'Missing planId' }, { status: 400 });
  }

  const plan = PLANS[planId];
  if (!plan) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
  }

  const paypalPlanId = yearly ? plan.paypalPlanIdYearly : plan.paypalPlanId;
  if (!paypalPlanId) {
    return NextResponse.json({ error: 'PayPal plan not configured' }, { status: 500 });
  }

  await connectDB();

  // Ensure subscription record exists
  let sub = await Subscription.findOne({ userId });
  if (!sub) {
    sub = await Subscription.create({ userId, plan: 'free', status: 'active' });
  }

  const origin = req.nextUrl.origin;

  // Create a PayPal subscription
  const ppSub = await paypalRequest<{
    id: string;
    links: { rel: string; href: string }[];
  }>('/v1/billing/subscriptions', {
    method: 'POST',
    body: {
      plan_id: paypalPlanId,
      custom_id: userId,
      application_context: {
        brand_name: 'GetMention',
        locale: 'en-US',
        shipping_preference: 'NO_SHIPPING',
        user_action: 'SUBSCRIBE_NOW',
        return_url: `${origin}/dashboard/billing?success=true`,
        cancel_url: `${origin}/dashboard/billing?canceled=true`,
      },
    },
  });

  const approveLink = ppSub.links?.find((l) => l.rel === 'approve')?.href;
  if (!approveLink) {
    return NextResponse.json({ error: 'Failed to create PayPal subscription' }, { status: 500 });
  }

  return NextResponse.json({ url: approveLink, subscriptionId: ppSub.id });
}
