import { NextResponse } from 'next/server';
import { getOrderByReference, attachStripeSession } from '@/lib/orders';
import { createCheckoutSession } from '@/lib/stripe';
import { isValidReference } from '@/lib/validation';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/checkout — public: start Stripe Checkout for a confirmed order. */
export async function POST(request: Request) {
  if (!env.stripe.configured()) {
    return NextResponse.json(
      { error: 'Payments are not configured yet. Please contact us to complete your order.' },
      { status: 503 }
    );
  }

  let reference = '';
  try {
    reference = String(((await request.json()) as { reference?: string }).reference || '');
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (!isValidReference(reference)) {
    return NextResponse.json({ error: 'Invalid reference number.' }, { status: 400 });
  }

  const order = await getOrderByReference(reference);
  if (!order) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  }
  // Only a confirmed-available order can be paid for, and only once.
  if (order.status !== 'confirmed') {
    return NextResponse.json(
      {
        error:
          order.status === 'paid' || order.status === 'shipped'
            ? 'This order has already been paid.'
            : 'This order is not ready for payment yet.',
      },
      { status: 409 }
    );
  }

  try {
    const session = await createCheckoutSession(order);
    await attachStripeSession(order.id, session.id);
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('[api/checkout] stripe session failed', error);
    return NextResponse.json({ error: 'Could not start the payment.' }, { status: 502 });
  }
}
