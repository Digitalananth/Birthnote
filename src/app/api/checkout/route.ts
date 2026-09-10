import { NextResponse } from 'next/server';
import { getOrderByReference, attachGatewayOrder } from '@/lib/orders';
import { createPaymentForm, NotPayableError } from '@/lib/payu';
import { isValidReference } from '@/lib/validation';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/checkout — public: open a PayU checkout for a confirmed order.
 *
 * Answers with a signed form for the browser to POST to PayU. The amount, the
 * txnid and the return URLs are all inside the hash, and the salt that keys it
 * never leaves this server, so a browser that alters anything in this response
 * is refused by PayU rather than charged a different sum.
 */
export async function POST(request: Request) {
  if (!env.payu.configured()) {
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
    const payment = createPaymentForm(order);
    // Written before the browser is sent anywhere. PayU's return and webhook
    // look the order up by exactly this txnid — a form submitted before the
    // write would be a paid order nobody could find.
    await attachGatewayOrder(order.id, payment.txnId);
    return NextResponse.json({ action: payment.action, fields: payment.fields });
  } catch (error) {
    // A NotPayableError is a fact about the order, not a gateway failure, and
    // the customer can act on it. Everything else is ours to fix and theirs
    // to retry.
    if (error instanceof NotPayableError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('[api/checkout] payu checkout failed', error);
    return NextResponse.json({ error: 'Could not start the payment.' }, { status: 502 });
  }
}
