import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/apiAuth';
import { connectDB } from '@/lib/mongodb';
import Subscription from '@/models/Subscription';
import { checkRateLimit } from '@/lib/rateLimit';
import { paypalRequest } from '@/lib/paypal';

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId();
  if (userId instanceof NextResponse) return userId;

  const rl = await checkRateLimit(userId, 'billing');
  if (rl) return NextResponse.json({ error: rl.error }, { status: 429 });

  await connectDB();
  const sub = await Subscription.findOne({ userId });

  if (!sub?.paypalSubscriptionId) {
    return NextResponse.json({ error: 'No active subscription found' }, { status: 400 });
  }

  // PayPal doesn't have a "billing portal" like Stripe.
  // We can either link to PayPal's subscription management page or handle cancellation ourselves.
  // Option: Cancel the subscription via API
  const { action } = await req.json().catch(() => ({ action: 'manage' }));

  if (action === 'cancel') {
    try {
      await paypalRequest(`/v1/billing/subscriptions/${sub.paypalSubscriptionId}/cancel`, {
        method: 'POST',
        body: { reason: 'Customer requested cancellation' },
      });

      await Subscription.findOneAndUpdate(
        { userId },
        { cancelAtPeriodEnd: true }
      );

      return NextResponse.json({ success: true, message: 'Subscription will be canceled at period end' });
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
  }

  // For "manage" — return PayPal's subscription details page
  // Users can manage their subscription directly on PayPal
  const manageUrl = process.env.PAYPAL_MODE === 'live'
    ? 'https://www.paypal.com/myaccount/autopay'
    : 'https://sandbox.paypal.com/myaccount/autopay';

  return NextResponse.json({ url: manageUrl });
}
