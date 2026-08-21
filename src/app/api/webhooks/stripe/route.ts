import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe } from '@/lib/stripe';
import { markOrderPaid } from '@/lib/orders';
import { sendMail, paymentReceivedEmail } from '@/lib/mail';
import { sendWhatsApp, orderPaidWhatsApp, whatsAppRecipient } from '@/lib/whatsapp';
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
 * https://your-domain/api/webhooks/stripe for checkout.session.completed,
 * then put the signing secret in STRIPE_WEBHOOK_SECRET.
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
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status === 'paid') {
        const paymentIntent =
          typeof session.payment_intent === 'string' ? session.payment_intent : null;
        // Returns null when another delivery of this event already applied it.
        const order = await markOrderPaid(session.id, paymentIntent);
        // markOrderPaid returns the order only on the delivery that actually
        // flipped it, so Stripe's retries cannot send this twice.
        if (order) {
          await sendMail(paymentReceivedEmail(order));
          if (whatsAppRecipient(order)) await sendWhatsApp(orderPaidWhatsApp(order));
        }
      }
    }
  } catch (error) {
    // A 500 makes Stripe retry, which is what we want for a transient DB error.
    console.error(`[stripe-webhook] handling ${event.type} failed`, error);
    return NextResponse.json({ error: 'Handler failed.' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
