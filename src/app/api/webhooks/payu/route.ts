import { NextResponse } from 'next/server';
import { verifyResponseHash, refundSucceeded } from '@/lib/payu';
import { getOrderByGatewayOrder, markOrderRefunded } from '@/lib/orders';
import { sendMail, paymentFailedEmail, refundedEmail } from '@/lib/mail';
import { settleIfPaid } from '@/server/settle';
import { recordPayuCallback } from '@/server/payu-callbacks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/webhooks/payu
 *
 * The signal that money moved, for the customer who never makes it back to the
 * site. Register it in the PayU dashboard → Developers → Webhooks, pointing at
 * https://your-domain/api/webhooks/payu, once for each of the Payments events
 * "Successful", "Failed" and "Refund". Without "Failed", a customer whose
 * payment is declined is never told anything.
 *
 * Two shapes arrive here:
 *
 * - Payment events are form-encoded, with the same fields and reverse hash as
 *   the return leg. The hash is checked, and then PayU is asked anyway through
 *   `settleIfPaid`, because a signed form can be replayed.
 * - Refund events are JSON and carry no hash at all. So the payload is only a
 *   pointer: the refund's request id is looked up with Check Action Status and
 *   nothing is recorded unless PayU says it succeeded.
 *
 * Every delivery is logged to `payu_callbacks`, whatever became of it — a bad
 * hash and a txnid that matches no order included — so "is PayU calling us?"
 * is answered from the order page and /api/health.
 *
 * A missed delivery is covered separately: the admin's payment check on the
 * order (/api/admin/orders/:reference/payment-check) asks PayU directly.
 */

interface RefundBody {
  action?: string;
  status?: string;
  merchantTxnId?: string;
  request_id?: string;
  key?: string;
}

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') ?? '';
  let txnId: string | null = null;
  let payuStatus: string | null = null;
  let orderId: number | undefined;

  try {
    if (contentType.includes('application/json')) {
      const body = (await request.json().catch(() => null)) as RefundBody | null;
      if (!body) {
        await recordPayuCallback({
          source: 'webhook',
          outcome: 'invalid',
          detail: 'Unreadable JSON.',
        });
        return NextResponse.json({ error: 'Invalid body.' }, { status: 400 });
      }
      txnId = body.merchantTxnId ?? null;
      payuStatus = `${body.action ?? 'unknown'}:${body.status ?? ''}`;
      const log = (outcome: 'refund' | 'ignored', detail: string, orderId?: number) =>
        recordPayuCallback({ source: 'webhook', outcome, txnId, orderId, payuStatus, detail });

      if (body.action !== 'refund' || String(body.status).toLowerCase() !== 'success') {
        await log('ignored', 'Not a successful refund.');
        return NextResponse.json({ received: true });
      }
      if (!body.merchantTxnId || !body.request_id) {
        await log('ignored', 'Refund without a txnid or request id.');
        return NextResponse.json({ received: true });
      }
      if (!(await refundSucceeded(body.request_id))) {
        console.error(`[payu-webhook] refund ${body.request_id} not confirmed by PayU`);
        await log('refund', 'Not confirmed by PayU; nothing recorded.');
        return NextResponse.json({ received: true });
      }
      // Null when a previous delivery already recorded the refund.
      const order = await markOrderRefunded(body.merchantTxnId);
      if (order) await sendMail(refundedEmail(order));
      await log('refund', order ? 'Order marked refunded.' : 'Already recorded.', order?.id);
      return NextResponse.json({ received: true });
    }

    const form = await request.formData();
    const fields = Object.fromEntries(
      [...form.entries()].map(([name, value]) => [name, typeof value === 'string' ? value : ''])
    );
    txnId = fields.txnid ?? '';
    payuStatus = fields.status ?? null;
    if (!verifyResponseHash(fields)) {
      console.error('[payu-webhook] hash verification failed');
      await recordPayuCallback({ source: 'webhook', outcome: 'bad_hash', txnId, payuStatus });
      return NextResponse.json({ error: 'Invalid hash.' }, { status: 401 });
    }

    const order = await getOrderByGatewayOrder(txnId);
    orderId = order?.id;
    if (fields.status === 'success') {
      const outcome = await settleIfPaid(txnId, 'payu-webhook');
      await recordPayuCallback({
        source: 'webhook',
        outcome,
        txnId,
        orderId: order?.id,
        payuStatus,
      });
    } else {
      // Only news while the order is still payable, and only for the attempt
      // the order is currently on — an older abandoned txnid failing is not.
      if (
        fields.status === 'failure' &&
        order &&
        order.status === 'confirmed' &&
        order.gatewayOrderId === txnId
      ) {
        await sendMail(paymentFailedEmail(order));
      }
      await recordPayuCallback({
        source: 'webhook',
        outcome: order ? 'failure' : 'unmatched',
        txnId,
        orderId: order?.id,
        payuStatus,
      });
    }
  } catch (error) {
    // A 500 makes PayU retry, which is what we want for a transient DB error.
    console.error('[payu-webhook] handling failed', error);
    await recordPayuCallback({
      source: 'webhook',
      outcome: 'failed',
      txnId,
      orderId,
      payuStatus,
      detail: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Handler failed.' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
