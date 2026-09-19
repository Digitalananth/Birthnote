import { NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/auth';
import { getOrderByReference, getOrderByGatewayOrder, addPaymentAttempt } from '@/lib/orders';
import { isValidReference } from '@/lib/validation';
import { settleAnyAttempt } from '@/server/settle';
import { recordError } from '@/server/errors';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Context {
  params: Promise<{ reference: string }>;
}

/**
 * POST /api/admin/orders/:reference/payment-check — reconcile one order now.
 *
 * The admin's half of reconciliation: for the order a customer says they paid
 * for and the site says they did not. It asks PayU about every txnid the order
 * was given and settles through the same gate as the webhook, so a payment
 * found here raises the invoice and sends the receipt like any other.
 *
 * It is still not a "mark paid" button. Nothing is settled on the admin's
 * word — only on PayU's, for the order's full amount.
 *
 * `txnId` is optional, for a payment made under an id this site no longer
 * holds: the admin copies it from the PayU dashboard. It must carry this
 * order's reference as its prefix, which is how every txnid is minted, so a
 * payment for one order cannot be attached to another.
 */
export async function POST(request: Request, { params }: Context) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }
  if (!env.payu.configured()) {
    return NextResponse.json({ error: 'PayU is not configured.' }, { status: 503 });
  }

  const { reference } = await params;
  if (!isValidReference(reference)) {
    return NextResponse.json({ error: 'Invalid reference.' }, { status: 400 });
  }
  const order = await getOrderByReference(reference);
  if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  if (order.status !== 'confirmed') {
    return NextResponse.json(
      { error: 'Only a confirmed, unpaid order can be checked with PayU.' },
      { status: 409 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as { txnId?: unknown };
  const txnId = String(body.txnId ?? '').trim();
  if (txnId) {
    const prefix = reference.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (!/^[A-Za-z0-9]{1,25}$/.test(txnId) || !txnId.toUpperCase().startsWith(prefix)) {
      return NextResponse.json(
        { error: `That is not a transaction ID for this order — it should start with ${prefix}.` },
        { status: 422 }
      );
    }
    const owner = await getOrderByGatewayOrder(txnId);
    if (owner && owner.id !== order.id) {
      return NextResponse.json(
        { error: `That transaction ID belongs to order ${owner.reference}.` },
        { status: 409 }
      );
    }
    await addPaymentAttempt(order.id, txnId);
  }

  try {
    const results = await settleAnyAttempt(order, 'admin-check');
    return NextResponse.json({
      settled: results.some((result) => result.outcome === 'settled'),
      results,
    });
  } catch (error) {
    recordError('admin-check', error, reference);
    return NextResponse.json({ error: 'PayU could not be reached. Try again.' }, { status: 502 });
  }
}
