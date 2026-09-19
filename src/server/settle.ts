import 'server-only';
import {
  markOrderPaid,
  getOrderByReference,
  getOrderByGatewayOrder,
  listPaymentAttempts,
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
 * What became of one question put to PayU about one txnid.
 *
 * - `settled`: PayU confirmed it and this call marked the order paid.
 * - `already_paid`: the order was paid before this call; nothing to do.
 * - `not_paid`: PayU does not (yet) call this txnid a success.
 * - `amount_mismatch`: a success, for a sum that is not the order's total.
 * - `unmatched`: no order of ours was ever given this txnid.
 * - `not_payable`: the order is not waiting on a PayU payment at all.
 */
export type SettleOutcome =
  | 'settled'
  | 'already_paid'
  | 'not_paid'
  | 'amount_mismatch'
  | 'unmatched'
  | 'not_payable';

/**
 * Asks PayU about a txnid and settles the order it belongs to if — and only
 * if — PayU says it was paid in full.
 *
 * The one gate every route passes through. The return leg and the webhook both
 * arrive with a signed form, but a signed form can be replayed; this re-asks
 * PayU over an authenticated call about an id the server already holds, and
 * checks the amount against the order's frozen total.
 *
 * Nothing here is silent. A txnid that matches no order, and a second attempt
 * paid on an order that was already paid, are both money somebody has to look
 * at, so both are recorded where /api/health shows them.
 */
export async function settleIfPaid(txnId: string, source: string): Promise<SettleOutcome> {
  const order = await getOrderByGatewayOrder(txnId);
  if (!order) {
    recordError(`${source}.unmatched`, new Error('PayU txnid belongs to no order'), txnId);
    return 'unmatched';
  }
  // Never ask PayU about an id that belongs to an earlier processor.
  if (order.gateway !== 'payu') return 'not_payable';

  if (order.status !== 'confirmed') {
    const paid = Boolean(order.paidAt);
    // Paid under this very txnid: a redelivery, the ordinary case. Paid under
    // another: the customer may have completed two attempts, which only PayU
    // can say — and if so, the second is a refund waiting to be made.
    if (paid && order.gatewayOrderId !== txnId) {
      const second = await verifyPayment(txnId);
      if (second.status === 'success') {
        recordError(
          `${source}.duplicate`,
          new Error(`Second PayU payment ${txnId} on an order already paid; refund it`),
          order.reference
        );
      }
    }
    return paid ? 'already_paid' : 'not_payable';
  }

  const status = await verifyPayment(txnId);
  if (!isPaidInFull(status, order.totalPaise)) {
    if (status.status === 'success') {
      recordError(
        `${source}.amount`,
        new Error(`PayU success for ${status.amountPaise} paise, order total ${order.totalPaise}`),
        order.reference
      );
      return 'amount_mismatch';
    }
    return 'not_paid';
  }
  // Null from the settle means another caller flipped the row in between.
  return (await settleOrder(txnId, status.paymentId, source)) ? 'settled' : 'already_paid';
}

/**
 * Asks PayU about every txnid an order was given, newest first, stopping at
 * the first that settles it.
 *
 * For the callers that start from an order rather than a callback — the
 * success page and the admin's payment check — where "the" txnid is a guess:
 * the customer may have paid on any attempt.
 */
export async function settleAnyAttempt(
  order: Order,
  source: string
): Promise<{ txnId: string; outcome: SettleOutcome }[]> {
  const results: { txnId: string; outcome: SettleOutcome }[] = [];
  for (const txnId of await listPaymentAttempts(order.id)) {
    const outcome = await settleIfPaid(txnId, source);
    results.push({ txnId, outcome });
    if (outcome === 'settled') break;
  }
  return results;
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
  if (order.status !== 'confirmed' || order.gateway !== 'payu') return order;
  try {
    const results = await settleAnyAttempt(order, 'return-leg');
    if (!results.some((result) => result.outcome === 'settled')) return order;
    return (await getOrderByReference(order.reference)) ?? order;
  } catch (error) {
    recordError('return-leg', error, order.reference);
    return order;
  }
}
