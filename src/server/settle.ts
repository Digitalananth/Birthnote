import 'server-only';
import { markOrderPaid, getOrderByReference, type Order } from '@/lib/orders';
import { fetchOrderStatus } from '@/lib/phonepe';
import { recordError } from '@/server/errors';
import { sendMail, paymentReceivedEmail } from '@/lib/mail';
import { sendWhatsApp, orderPaidWhatsApp, whatsAppRecipient } from '@/lib/whatsapp';
import { issueInvoiceForOrder } from '@/lib/invoices';

/**
 * Everything that happens on a payment we have just learned about, in the
 * order it has to happen in.
 *
 * Shared rather than inlined into the webhook because three callers now learn
 * about the same payment by different routes — the webhook, the success page
 * asking PhonePe directly on the return leg, and the reconcile sweep — and any
 * of them may be first. They must all end in one invoice and one receipt.
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
 * Asks PhonePe whether an order that still looks unpaid has in fact been paid.
 *
 * For the return leg. PhonePe redirects the customer back with no status, no
 * transaction id and no signature — the URL is the same whether they paid,
 * failed or pressed back — so the only way for the page they land on to say
 * anything true is to ask.
 *
 * Returns the order as it stands afterwards, refreshed when this call is what
 * settled it. A gateway that is slow or down must not break the page: the
 * customer still sees their order, saying "confirming", which is exactly what
 * it said before this existed and is still true. The webhook and the reconcile
 * sweep are both still behind it.
 */
export async function confirmPendingPayment(order: Order): Promise<Order> {
  if (order.status !== 'confirmed') return order;
  // Never ask PhonePe about an id that belongs to an earlier processor.
  if (order.gateway !== 'phonepe' || !order.gatewayOrderId) return order;

  try {
    const status = await fetchOrderStatus(order.gatewayOrderId);
    if (status.state !== 'COMPLETED') return order;
    await settleOrder(order.gatewayOrderId, status.transactionId, 'return-leg');
    return (await getOrderByReference(order.reference)) ?? order;
  } catch (error) {
    recordError('return-leg', error, order.reference);
    return order;
  }
}
