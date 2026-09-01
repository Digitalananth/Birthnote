import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe';
import {
  markOrderPaid,
  getOrderByStripeSession,
  getOrderByReference,
  markOrderRefunded,
} from '@/lib/orders';
import {
  sendMail,
  paymentReceivedEmail,
  paymentFailedEmail,
  checkoutExpiredEmail,
  refundedEmail,
} from '@/lib/mail';
import { sendWhatsApp, orderPaidWhatsApp, whatsAppRecipient } from '@/lib/whatsapp';
import { issueInvoiceForOrder } from '@/lib/invoices';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/webhooks/stripe
 *
 * The only trustworthy signal that money moved. The browser redirect to the
 * success page can be faked or simply never happen, so an order is marked
 * paid here and nowhere else.
 *
 * Register the endpoint at dashboard.stripe.com/webhooks pointing at
 * https://your-domain/api/webhooks/stripe, then put the signing secret in
 * STRIPE_WEBHOOK_SECRET. Subscribe it to all five events handled below —
 * subscribing to only `checkout.session.completed` means a customer whose
 * payment fails is never told anything at all.
 *
 * A delivery that never arrives is covered separately: /api/cron/sweep asks
 * Stripe directly about anything still unpaid an hour later, so a missed
 * webhook delays an order rather than stranding it.
 */
export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature.' }, { status: 400 });
  }

  // The raw body is required — parsing it first would break the signature.
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, env.stripe.webhookSecret());
  } catch (error) {
    console.error('[stripe-webhook] signature verification failed', error);
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.payment_status === 'paid') {
          const paymentIntent =
            typeof session.payment_intent === 'string' ? session.payment_intent : null;
          // Returns null when another delivery of this event already applied it.
          const order = await markOrderPaid(session.id, paymentIntent);
          // markOrderPaid returns the order only on the delivery that actually
          // flipped it, so Stripe's retries cannot send this twice.
          if (order) {
            // The invoice is raised here, on the one delivery that flipped the
            // order to paid, so a redelivered webhook cannot raise a second.
            // A failure to issue must not lose the receipt: the sale happened
            // either way, and the admin can see the order is missing its
            // invoice on the invoices page.
            let invoiceNumber: string | null = null;
            try {
              invoiceNumber = (await issueInvoiceForOrder(order)).number;
            } catch (error) {
              console.error('[stripe-webhook] could not issue invoice', error);
            }
            await sendMail(paymentReceivedEmail(order, invoiceNumber));
            if (whatsAppRecipient(order)) await sendWhatsApp(orderPaidWhatsApp(order));
          }
        }
        break;
      }

      // The customer opened a checkout and left it. Nothing was attempted, so
      // this reassures rather than explaining a decline.
      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session;
        const order = await getOrderByStripeSession(session.id);
        // Only worth saying while the order is still payable.
        if (order && order.status === 'confirmed') {
          await sendMail(checkoutExpiredEmail(order));
        }
        break;
      }

      // A decline. The customer does not know whether they have been charged,
      // and silence is what turns that into an abandoned order.
      case 'checkout.session.async_payment_failed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const order = await getOrderByStripeSession(session.id);
        if (order && order.status === 'confirmed') {
          await sendMail(paymentFailedEmail(order));
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        const intent = event.data.object as Stripe.PaymentIntent;
        // A PaymentIntent carries no session, so createCheckoutSession stamps
        // the reference onto it — see payment_intent_data in src/lib/stripe.ts.
        const reference =
          typeof intent.metadata?.reference === 'string' ? intent.metadata.reference : null;
        if (reference) {
          const order = await getOrderByReference(reference);
          if (order && order.status === 'confirmed') {
            await sendMail(paymentFailedEmail(order));
          }
        }
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        const paymentIntent =
          typeof charge.payment_intent === 'string' ? charge.payment_intent : null;
        if (paymentIntent) {
          // Null when a previous delivery already recorded the refund.
          const order = await markOrderRefunded(paymentIntent);
          if (order) await sendMail(refundedEmail(order));
        }
        break;
      }

      default:
        // Everything else is subscribed by accident or newly added by Stripe;
        // acknowledging it stops Stripe retrying an event we will never act on.
        break;
    }
  } catch (error) {
    // A 500 makes Stripe retry, which is what we want for a transient DB error.
    console.error(`[stripe-webhook] handling ${event.type} failed`, error);
    return NextResponse.json({ error: 'Handler failed.' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
