import { NextResponse } from 'next/server';
import { verifyWebhookAuth, fetchOrderStatus } from '@/lib/phonepe';
import { getOrderByGatewayOrder, markOrderRefunded } from '@/lib/orders';
import { sendMail, paymentFailedEmail, refundedEmail } from '@/lib/mail';
import { settleOrder } from '@/server/settle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/webhooks/phonepe
 *
 * The signal that money moved. The success page asks PhonePe the same question
 * on the return leg, and can be reached without paying at all, so an order is
 * marked paid through `settleOrder` and nowhere else — whichever of them gets
 * there first.
 *
 * Register the endpoint at business.phonepe.com → Developer Settings →
 * Webhooks pointing at https://your-domain/api/webhooks/phonepe, put the
 * username and password typed there into PHONEPE_WEBHOOK_USERNAME and
 * PHONEPE_WEBHOOK_PASSWORD — they are *not* the client credentials — and
 * subscribe it to the four events handled below. Subscribing only to
 * `checkout.order.completed` means a customer whose payment fails is never
 * told anything.
 *
 * A delivery that never arrives is covered separately: /api/cron/sweep asks
 * PhonePe directly about anything still unpaid an hour later, so a missed
 * webhook delays an order rather than stranding it.
 */

/** The shape of the events we act on. PhonePe sends much more than this. */
interface PhonePeWebhookBody {
  event?: string;
  payload?: {
    merchantOrderId?: string;
    orderId?: string;
    state?: string;
    /** Present on refund events; the order the refunded payment belonged to. */
    originalMerchantOrderId?: string;
    paymentDetails?: { state?: string; transactionId?: string }[];
  };
}

export async function POST(request: Request) {
  /*
   * PhonePe does not sign the body — the header is a constant hash of the
   * credentials — so this proves the caller knows the password and nothing
   * about the bytes that followed. It is a gate, not a signature, which is
   * why `checkout.order.completed` below re-asks PhonePe rather than believing
   * what it was handed.
   */
  if (!verifyWebhookAuth(request.headers.get('authorization'))) {
    console.error('[phonepe-webhook] authorization verification failed');
    return NextResponse.json({ error: 'Invalid authorization.' }, { status: 401 });
  }

  let body: PhonePeWebhookBody;
  try {
    body = (await request.json()) as PhonePeWebhookBody;
  } catch {
    // Authorised and still unparseable: acknowledge it, because retrying will
    // produce the same bytes for ever.
    console.error('[phonepe-webhook] authorised body was not JSON');
    return NextResponse.json({ error: 'Invalid body.' }, { status: 400 });
  }

  const event = body.event ?? '';
  const merchantOrderId = body.payload?.merchantOrderId;

  try {
    switch (event) {
      case 'checkout.order.completed': {
        if (!merchantOrderId) break;
        /*
         * Confirmed against PhonePe before a rupee is believed.
         *
         * The header on this request is the same on every delivery, so a body
         * captured once could be replayed for ever against any order id the
         * sender cared to write in it. One status call closes that: the state
         * and the transaction id both come from PhonePe rather than from the
         * request, and a replayed body simply re-reads a true fact.
         */
        const status = await fetchOrderStatus(merchantOrderId);
        if (status.state !== 'COMPLETED') {
          console.error(
            `[phonepe-webhook] completed event for ${merchantOrderId} but PhonePe says ${status.state}`
          );
          break;
        }
        await settleOrder(merchantOrderId, status.transactionId, 'phonepe-webhook');
        break;
      }

      // A decline. The customer does not know whether they have been charged,
      // and silence is what turns that into an abandoned order.
      case 'checkout.order.failed': {
        if (!merchantOrderId) break;
        const order = await getOrderByGatewayOrder(merchantOrderId);
        // Only worth saying while the order is still payable — a failed
        // attempt after a successful one is not news.
        if (order && order.status === 'confirmed') {
          await sendMail(paymentFailedEmail(order));
        }
        break;
      }

      case 'pg.refund.completed': {
        /*
         * Keyed on the order, not the payment.
         *
         * Razorpay's refund event named the payment it reversed, so the order
         * was found through `gateway_payment_id`. PhonePe names the original
         * *order* instead — which is the id we always hold, whereas the
         * transaction id is only there if a status call ever returned one.
         */
        const originalOrderId = body.payload?.originalMerchantOrderId;
        if (originalOrderId) {
          // Null when a previous delivery already recorded the refund.
          const order = await markOrderRefunded(originalOrderId);
          if (order) await sendMail(refundedEmail(order));
        }
        break;
      }

      default:
        // Everything else — `pg.refund.failed` included, which is for the
        // admin to see in PhonePe's dashboard and retry, not for the customer
        // to be emailed about. Acknowledging stops the retries for an event
        // we will never act on.
        break;
    }
  } catch (error) {
    // A 500 makes PhonePe retry, which is what we want for a transient DB error.
    console.error(`[phonepe-webhook] handling ${event} failed`, error);
    return NextResponse.json({ error: 'Handler failed.' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
