import { NextResponse } from 'next/server';
import { getOrderByReference, attachGatewayOrder } from '@/lib/orders';
import { createPaymentOrder, NotPayableError } from '@/lib/phonepe';
import { isValidReference } from '@/lib/validation';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/checkout — public: open a PhonePe checkout for a confirmed order.
 *
 * Answers with one thing: the URL to send the browser to. PhonePe hosts the
 * payment page on its own origin, so unlike the modal this replaced there is
 * no key, no amount and no prefill for the client to be trusted with — the
 * amount is fixed on PhonePe's order server-side and a browser that alters
 * anything in this response changes nothing about what is charged.
 */
export async function POST(request: Request) {
  if (!env.phonepe.configured()) {
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

  // The delivery address decides the tax split, so it has to exist before the
  // charge. The payment page collects it first; this is the guard for anyone
  // calling the API directly.
  if (!order.shipping) {
    return NextResponse.json(
      { error: 'Please enter a delivery address before paying.' },
      { status: 409 }
    );
  }

  try {
    const payment = await createPaymentOrder(order);
    // Written before the browser is sent anywhere. PhonePe's webhook can
    // arrive while the customer is still on their page, and it looks the
    // order up by exactly this id — a redirect that raced the write would be
    // a paid order nobody could find.
    await attachGatewayOrder(order.id, payment.merchantOrderId);
    return NextResponse.json({ redirectUrl: payment.redirectUrl });
  } catch (error) {
    // A NotPayableError is a fact about the order, not a gateway failure, and
    // the customer can act on it. Everything else is ours to fix and theirs
    // to retry.
    if (error instanceof NotPayableError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('[api/checkout] phonepe order failed', error);
    return NextResponse.json({ error: 'Could not start the payment.' }, { status: 502 });
  }
}
