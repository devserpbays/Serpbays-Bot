import { NextRequest, NextResponse } from 'next/server';
import { paypalRequest } from '@/lib/paypal';
import { connectDB } from '@/lib/mongodb';
import Subscription from '@/models/Subscription';

/**
 * Verify the webhook signature with PayPal.
 * Returns true if verified, false otherwise.
 */
async function verifyWebhook(req: NextRequest, body: string): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    console.error('[PayPal] PAYPAL_WEBHOOK_ID not configured');
    return false;
  }

  try {
    const result = await paypalRequest<{ verification_status: string }>(
      '/v1/notifications/verify-webhook-signature',
      {
        method: 'POST',
        body: {
          auth_algo: req.headers.get('paypal-auth-algo'),
          cert_url: req.headers.get('paypal-cert-url'),
          transmission_id: req.headers.get('paypal-transmission-id'),
          transmission_sig: req.headers.get('paypal-transmission-sig'),
          transmission_time: req.headers.get('paypal-transmission-time'),
          webhook_id: webhookId,
          webhook_event: JSON.parse(body),
        },
      }
    );
    return result.verification_status === 'SUCCESS';
  } catch (err) {
    console.error('[PayPal] Webhook verification failed:', (err as Error).message);
    return false;
  }
}

/**
 * Map a PayPal subscription status to our internal status.
 */
function mapStatus(ppStatus: string): string {
  const map: Record<string, string> = {
    ACTIVE: 'active',
    APPROVED: 'active',
    SUSPENDED: 'past_due',
    CANCELLED: 'canceled',
    EXPIRED: 'canceled',
  };
  return map[ppStatus] || 'active';
}

/**
 * Look up which plan a PayPal plan ID corresponds to.
 */
function planIdFromPayPalPlan(paypalPlanId: string): string {
  const { PLANS } = require('@/lib/plans');
  for (const [key, def] of Object.entries(PLANS) as [string, { paypalPlanId: string; paypalPlanIdYearly: string }][]) {
    if (def.paypalPlanId === paypalPlanId || def.paypalPlanIdYearly === paypalPlanId) {
      return key;
    }
  }
  return 'free';
}

export async function POST(req: NextRequest) {
  const body = await req.text();

  // Verify webhook signature
  const verified = await verifyWebhook(req, body);
  if (!verified) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const event = JSON.parse(body);
  const eventType: string = event.event_type;
  const resource = event.resource;

  await connectDB();

  switch (eventType) {
    // Subscription activated (first payment succeeded)
    case 'BILLING.SUBSCRIPTION.ACTIVATED': {
      const userId = resource.custom_id;
      if (!userId) break;

      const planId = planIdFromPayPalPlan(resource.plan_id);
      const periodStart = resource.billing_info?.last_payment?.time
        ? new Date(resource.billing_info.last_payment.time)
        : new Date();
      const periodEnd = resource.billing_info?.next_billing_time
        ? new Date(resource.billing_info.next_billing_time)
        : undefined;

      await Subscription.findOneAndUpdate(
        { userId },
        {
          userId,
          paypalSubscriptionId: resource.id,
          paypalPayerId: resource.subscriber?.payer_id || '',
          plan: planId,
          status: 'active',
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
        },
        { upsert: true, new: true }
      );
      console.log(`[PayPal] Subscription activated: ${userId} → ${planId}`);
      break;
    }

    // Subscription updated (plan change, status change)
    case 'BILLING.SUBSCRIPTION.UPDATED': {
      const userId = resource.custom_id;
      if (!userId) break;

      const planId = planIdFromPayPalPlan(resource.plan_id);
      const status = mapStatus(resource.status);
      const periodEnd = resource.billing_info?.next_billing_time
        ? new Date(resource.billing_info.next_billing_time)
        : undefined;

      await Subscription.findOneAndUpdate(
        { userId },
        {
          plan: planId,
          status,
          ...(periodEnd && { currentPeriodEnd: periodEnd }),
        }
      );
      console.log(`[PayPal] Subscription updated: ${userId} → ${resource.status}`);
      break;
    }

    // Subscription cancelled
    case 'BILLING.SUBSCRIPTION.CANCELLED':
    case 'BILLING.SUBSCRIPTION.EXPIRED': {
      const userId = resource.custom_id;
      if (!userId) break;

      await Subscription.findOneAndUpdate(
        { userId },
        { plan: 'free', status: 'canceled', cancelAtPeriodEnd: false }
      );
      console.log(`[PayPal] Subscription canceled: ${userId}`);
      break;
    }

    // Subscription suspended (payment failed)
    case 'BILLING.SUBSCRIPTION.SUSPENDED': {
      const userId = resource.custom_id;
      if (!userId) break;

      await Subscription.findOneAndUpdate(
        { userId },
        { status: 'past_due' }
      );
      console.log(`[PayPal] Subscription suspended (payment failed): ${userId}`);
      break;
    }

    // Payment completed (renewal)
    case 'PAYMENT.SALE.COMPLETED': {
      const subId = resource.billing_agreement_id;
      if (!subId) break;

      // Fetch the subscription to get the next billing time
      try {
        const ppSub = await paypalRequest<{
          custom_id: string;
          billing_info: { next_billing_time?: string };
        }>(`/v1/billing/subscriptions/${subId}`);

        if (ppSub.custom_id) {
          await Subscription.findOneAndUpdate(
            { userId: ppSub.custom_id },
            {
              status: 'active',
              currentPeriodStart: new Date(),
              ...(ppSub.billing_info?.next_billing_time && {
                currentPeriodEnd: new Date(ppSub.billing_info.next_billing_time),
              }),
            }
          );
          console.log(`[PayPal] Payment completed for: ${ppSub.custom_id}`);
        }
      } catch (err) {
        console.error(`[PayPal] Error fetching subscription ${subId}:`, (err as Error).message);
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
