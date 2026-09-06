import { NextResponse } from 'next/server';
import { verifyWebhookSignature } from '@/lib/razorpay';
import { markOrderPaid, getOrderByGatewayOrder, markOrderRefunded } from '@/lib/orders';
import { sendMail, paymentReceivedEmail, paymentFailedEmail, refundedEmail } from '@/lib/mail';
import { sendWhatsApp, orderPaidWhatsApp, whatsAppRecipient } from '@/lib/whatsapp';
import { issueInvoiceForOrder } from '@/lib/invoices';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/webhooks/razorpay
 *
 * The only trustworthy signal that money moved. The checkout hands the browser
 * a signed response too, and the success page can be reached without either,
 * so an order is marked paid here and nowhere else.
 *
 * Register the endpoint at dashboard.razorpay.com → Settings → Webhooks
 * pointing at https://your-domain/api/webhooks/razorpay, put the secret typed
 * there into RAZORPAY_WEBHOOK_SECRET — it is *not* the API key secret — and
 * subscribe it to the four events handled below. Subscribing only to
 * `order.paid` means a customer whose payment fails is never told anything.
 *
 * A delivery that never arrives is covered separately: /api/cron/sweep asks
 * Razorpay directly about anything still unpaid an hour later, so a missed
 * webhook delays an order rather than stranding it.
 */

/** The shape of the events we act on. Razorpay sends much more than this. */
interface RazorpayWebhookBody {
  event?: string;
  payload?: {
    payment?: { entity?: { id?: string; order_id?: string; error_description?: string } };
    order?: { entity?: { id?: string } };
    refund?: { entity?: { id?: string; payment_id?: string } };
  };
}

/**
 * Everything that happens on a payment we have just learned about, in the
 * order it has to happen in.
 *
 * Shared by `payment.captured` and `order.paid` because Razorpay fires both
 * for a single payment and there is no saying which arrives first.
 * `markOrderPaid` returns the order only to the call that actually flipped it,
 * so the loser of that race does nothing and the customer gets one receipt.
 */
async function settle(gatewayOrderId: string, gatewayPaymentId: string | null) {
  const order = await markOrderPaid(gatewayOrderId, gatewayPaymentId);
  if (!order) return;

  // The invoice is raised here, on the one delivery that flipped the order to
  // paid, so a redelivered webhook cannot raise a second. A failure to issue
  // must not lose the receipt: the sale happened either way, and the admin can
  // see the order is missing its invoice on the invoices page.
  let invoiceNumber: string | null = null;
  try {
    invoiceNumber = (await issueInvoiceForOrder(order)).number;
  } catch (error) {
    console.error('[razorpay-webhook] could not issue invoice', error);
  }
  await sendMail(paymentReceivedEmail(order, invoiceNumber));
  if (whatsAppRecipient(order)) await sendWhatsApp(orderPaidWhatsApp(order));
}

export async function POST(request: Request) {
  const signature = request.headers.get('x-razorpay-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature.' }, { status: 400 });
  }

  // The raw body is required — parsing it first would break the signature.
  const rawBody = await request.text();

  if (!verifyWebhookSignature(rawBody, signature)) {
    console.error('[razorpay-webhook] signature verification failed');
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  let body: RazorpayWebhookBody;
  try {
    body = JSON.parse(rawBody) as RazorpayWebhookBody;
  } catch {
    // Signed by us and still unparseable: acknowledge it, because retrying
    // will produce the same bytes for ever.
    console.error('[razorpay-webhook] signed body was not JSON');
    return NextResponse.json({ error: 'Invalid body.' }, { status: 400 });
  }

  const payment = body.payload?.payment?.entity;
  const event = body.event ?? '';

  try {
    switch (event) {
      // Two events, one meaning. Both carry the payment entity, and the
      // payment entity carries the order id, so neither needs its own path.
      case 'payment.captured':
      case 'order.paid': {
        const gatewayOrderId = payment?.order_id ?? body.payload?.order?.entity?.id;
        if (gatewayOrderId) await settle(gatewayOrderId, payment?.id ?? null);
        break;
      }

      // A decline. The customer does not know whether they have been charged,
      // and silence is what turns that into an abandoned order.
      case 'payment.failed': {
        if (payment?.order_id) {
          const order = await getOrderByGatewayOrder(payment.order_id);
          // Only worth saying while the order is still payable — a failed
          // attempt after a successful one is not news.
          if (order && order.status === 'confirmed') {
            await sendMail(paymentFailedEmail(order));
          }
        }
        break;
      }

      case 'refund.processed': {
        const paymentId = body.payload?.refund?.entity?.payment_id;
        if (paymentId) {
          // Null when a previous delivery already recorded the refund.
          const order = await markOrderRefunded(paymentId);
          if (order) await sendMail(refundedEmail(order));
        }
        break;
      }

      default:
        // Everything else is subscribed by accident or newly added by
        // Razorpay; acknowledging it stops the retries for an event we will
        // never act on.
        break;
    }
  } catch (error) {
    // A 500 makes Razorpay retry, which is what we want for a transient DB error.
    console.error(`[razorpay-webhook] handling ${event} failed`, error);
    return NextResponse.json({ error: 'Handler failed.' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
