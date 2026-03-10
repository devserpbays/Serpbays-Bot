import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { connectDB } from '@/lib/mongodb';
import Subscription from '@/models/Subscription';
import Stripe from 'stripe';

// In Stripe v20+, current_period_start/end are on items, not subscription root
function getPeriodDates(sub: Stripe.Subscription): { start: Date; end: Date } {
  const item = sub.items?.data?.[0];
  const start = item?.current_period_start ?? Math.floor(Date.now() / 1000);
  const end = item?.current_period_end ?? Math.floor(Date.now() / 1000) + 30 * 86400;
  return { start: new Date(start * 1000), end: new Date(end * 1000) };
}

// Stripe sends raw body — do not parse JSON
export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', (err as Error).message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  await connectDB();

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      const planId = session.metadata?.planId;
      if (!userId || !planId) break;

      const subscriptionId = session.subscription as string;
      const stripeSub = await stripe.subscriptions.retrieve(subscriptionId);
      const period = getPeriodDates(stripeSub);

      await Subscription.findOneAndUpdate(
        { userId },
        {
          userId,
          stripeCustomerId: session.customer as string,
          stripeSubscriptionId: subscriptionId,
          plan: planId,
          status: 'active',
          currentPeriodStart: period.start,
          currentPeriodEnd: period.end,
          cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
        },
        { upsert: true, new: true }
      );
      console.log(`[Stripe] Checkout completed: ${userId} → ${planId}`);
      break;
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.userId;
      if (!userId) break;

      const planId = sub.metadata?.planId || 'free';
      const statusMap: Record<string, string> = {
        active: 'active',
        past_due: 'past_due',
        canceled: 'canceled',
        trialing: 'trialing',
        incomplete: 'incomplete',
        incomplete_expired: 'canceled',
        unpaid: 'past_due',
        paused: 'canceled',
      };

      const period = getPeriodDates(sub);

      await Subscription.findOneAndUpdate(
        { userId },
        {
          plan: planId,
          status: statusMap[sub.status] || 'active',
          currentPeriodStart: period.start,
          currentPeriodEnd: period.end,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
        }
      );
      console.log(`[Stripe] Subscription updated: ${userId} → ${sub.status}`);
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.userId;
      if (!userId) break;

      await Subscription.findOneAndUpdate(
        { userId },
        { plan: 'free', status: 'canceled', cancelAtPeriodEnd: false }
      );
      console.log(`[Stripe] Subscription canceled: ${userId}`);
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice & { subscription?: string };
      const subId = invoice.subscription;
      if (!subId) break;

      await Subscription.findOneAndUpdate(
        { stripeSubscriptionId: subId },
        { status: 'past_due' }
      );
      console.log(`[Stripe] Payment failed for subscription: ${subId}`);
      break;
    }
  }

  return NextResponse.json({ received: true });
}
