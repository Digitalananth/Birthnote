import 'server-only';
import {
  markOrderPaid,
  getOrderByReference,
  getOrderByGatewayOrder,
  type Order,
} from '@/lib/orders';
import { verifyPayment, isPaidInFull } from '@/lib/payu';
import { recordError } from '@/server/errors';
import { sendMail, paymentReceivedEmail } from '@/lib/mail';
import { sendWhatsApp, orderPaidWhatsApp, whatsAppRecipient } from '@/lib/whatsapp';
import { issueInvoiceForOrder } from '@/lib/invoices';

/**
 * Everything that happens on a payment we have just learned about, in the
 * order it has to happen in.
 *
 * Shared rather than inlined into the webhook because four callers learn about
 * the same payment by different routes — the return leg, the webhook, the
 * success page and the reconcile sweep — and any of them may be first. They must all end in one invoice and one receipt.
 *
 * `markOrderPaid` is what makes that true. It locks the row and flips it only
 * from an unpaid state, returning the order to the single call that actually
 * changed it; everyone else gets null and does nothing. So this can be called
 * as often as anyone likes, from as many places as learn the news.
 */
export async function settleOrder(
  gatewayOrderId: string,
  gatewayPaymentId: string | null,
  source: string
): Promise<boolean> {
  const order = await markOrderPaid(gatewayOrderId, gatewayPaymentId);
  if (!order) return false;

  // The invoice is raised on the one call that flipped the order, so a
  // redelivered webhook cannot raise a second. A failure to issue must not
  // lose the receipt: the sale happened either way, and the admin can see the
  // order is missing its invoice on the invoices page.
  let invoiceNumber: string | null = null;
  try {
    invoiceNumber = (await issueInvoiceForOrder(order)).number;
  } catch (error) {
    recordError(`${source}.invoice`, error, order.reference);
  }
  await sendMail(paymentReceivedEmail(order, invoiceNumber));
  if (whatsAppRecipient(order)) await sendWhatsApp(orderPaidWhatsApp(order));
  return true;
}

/**
 * Asks PayU about a txnid and settles the order it belongs to if — and only
 * if — PayU says it was paid in full.
 *
 * The one gate every route passes through. The return leg and the webhook both
 * arrive with a signed form, but a signed form can be replayed; this re-asks
 * PayU over an authenticated call about an id the server already holds, and
 * checks the amount against the order's frozen total.
 *
 * Returns true only on the call that actually settled the order.
 */
export async function settleIfPaid(txnId: string, source: string): Promise<boolean> {
  const order = await getOrderByGatewayOrder(txnId);
  // Never ask PayU about an id that belongs to an earlier processor.
  if (!order || order.gateway !== 'payu' || order.status !== 'confirmed') return false;

  const status = await verifyPayment(txnId);
  if (!isPaidInFull(status, order.totalPaise)) {
    if (status.status === 'success') {
      recordError(
        `${source}.amount`,
        new Error(`PayU success for ${status.amountPaise} paise, order total ${order.totalPaise}`),
        order.reference
      );
    }
    return false;
  }
  return settleOrder(txnId, status.paymentId, source);
}

/**
 * Asks PayU whether an order that still looks unpaid has in fact been paid.
 *
 * For the success page, which can be reached by anyone who types its URL and so
 * says nothing true unless it asks.
 *
 * Returns the order as it stands afterwards, refreshed when this call is what
 * settled it. A gateway that is slow or down must not break the page: the
 * customer still sees their order, saying "confirming", which is still true.
 * The webhook and the reconcile sweep are both still behind it.
 */
export async function confirmPendingPayment(order: Order): Promise<Order> {
  if (order.status !== 'confirmed' || order.gateway !== 'payu' || !order.gatewayOrderId) {
    return order;
  }
  try {
    if (!(await settleIfPaid(order.gatewayOrderId, 'return-leg'))) return order;
    return (await getOrderByReference(order.reference)) ?? order;
  } catch (error) {
    recordError('return-leg', error, order.reference);
    return order;
  }
}
