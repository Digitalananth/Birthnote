import { NextResponse } from 'next/server';
import { verifyResponseHash, refundSucceeded } from '@/lib/payu';
import { getOrderByGatewayOrder, markOrderRefunded } from '@/lib/orders';
import { sendMail, paymentFailedEmail, refundedEmail } from '@/lib/mail';
import { settleIfPaid } from '@/server/settle';

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
 * A missed delivery is covered separately: /api/cron/sweep asks PayU directly
 * about anything still unpaid an hour later.
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

  try {
    if (contentType.includes('application/json')) {
      const body = (await request.json().catch(() => null)) as RefundBody | null;
      if (!body) return NextResponse.json({ error: 'Invalid body.' }, { status: 400 });
      if (body.action !== 'refund' || String(body.status).toLowerCase() !== 'success') {
        return NextResponse.json({ received: true });
      }
      if (!body.merchantTxnId || !body.request_id) {
        return NextResponse.json({ received: true });
      }
      if (!(await refundSucceeded(body.request_id))) {
        console.error(`[payu-webhook] refund ${body.request_id} not confirmed by PayU`);
        return NextResponse.json({ received: true });
      }
      // Null when a previous delivery already recorded the refund.
      const order = await markOrderRefunded(body.merchantTxnId);
      if (order) await sendMail(refundedEmail(order));
      return NextResponse.json({ received: true });
    }

    const form = await request.formData();
    const fields = Object.fromEntries(
      [...form.entries()].map(([name, value]) => [name, typeof value === 'string' ? value : ''])
    );
    if (!verifyResponseHash(fields)) {
      console.error('[payu-webhook] hash verification failed');
      return NextResponse.json({ error: 'Invalid hash.' }, { status: 401 });
    }

    const txnId = fields.txnid ?? '';
    if (fields.status === 'success') {
      await settleIfPaid(txnId, 'payu-webhook');
    } else if (fields.status === 'failure') {
      const order = await getOrderByGatewayOrder(txnId);
      // Only news while the order is still payable, and only for the attempt
      // the order is currently on — an older abandoned txnid failing is not.
      if (order && order.status === 'confirmed' && order.gatewayOrderId === txnId) {
        await sendMail(paymentFailedEmail(order));
      }
    }
  } catch (error) {
    // A 500 makes PayU retry, which is what we want for a transient DB error.
    console.error('[payu-webhook] handling failed', error);
    return NextResponse.json({ error: 'Handler failed.' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
