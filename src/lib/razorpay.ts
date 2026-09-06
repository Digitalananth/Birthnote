import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import Razorpay from 'razorpay';
import { env } from '@/lib/env';
import { availableItems, type Order } from '@/lib/orders';

const globalForRazorpay = globalThis as unknown as { myLuckyDatesRazorpay?: Razorpay };

export function getRazorpay(): Razorpay {
  if (!globalForRazorpay.myLuckyDatesRazorpay) {
    globalForRazorpay.myLuckyDatesRazorpay = new Razorpay({
      key_id: env.razorpay.keyId(),
      key_secret: env.razorpay.keySecret(),
    });
  }
  return globalForRazorpay.myLuckyDatesRazorpay;
}

/** Thrown when an order is not in a state that can be paid for. */
export class NotPayableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotPayableError';
  }
}

/**
 * Creates a Razorpay Order for a confirmed order of ours.
 *
 * A Razorpay Order is one amount, not a list of lines. That is the one real
 * difference from the hosted page this replaced, and it is why the payment
 * page itself now prints the breakup — notes, delivery, GST — before the
 * checkout opens. The customer must be able to see what the total is made of
 * *somewhere*, and if the gateway will not show it then we must.
 *
 * `total_paise` is that total, frozen onto the row when the order was priced,
 * so there is nothing to recompute here: the number charged is by construction
 * the number the page printed and the number the invoice will carry.
 *
 * Card and UPI details are entered in Razorpay's own iframe, so no payment
 * credentials touch this server — that is what keeps the site out of PCI-DSS
 * scope, exactly as the hosted redirect did.
 *
 * The address is already ours by this point: it is taken on the payment page,
 * because the delivery state decides whether the tax is CGST + SGST or IGST
 * and that must be settled before the charge, not after.
 */
export async function createPaymentOrder(order: Order) {
  const payable = availableItems(order).filter((item) => (item.pricePaise ?? 0) > 0);
  if (!payable.length) {
    throw new NotPayableError('This order has no priced notes to pay for.');
  }
  if (!order.shipping) {
    throw new NotPayableError('This order has no delivery address yet.');
  }
  // Razorpay's domestic account settles in rupees only. An order in anything
  // else is a pricing bug upstream, and taking the money would be worse than
  // refusing it.
  if (order.currency.toUpperCase() !== 'INR') {
    throw new NotPayableError(`Razorpay cannot charge in ${order.currency}.`);
  }
  if (order.totalPaise <= 0) {
    throw new NotPayableError('This order has no amount to charge.');
  }

  return getRazorpay().orders.create({
    // Paise, the same minor unit the whole codebase stores money in.
    amount: order.totalPaise,
    currency: 'INR',
    // Razorpay allows 40 characters and requires uniqueness; our references
    // are 24 and already unique, so they serve directly. It is what makes a
    // row in Razorpay's dashboard findable from a customer email.
    receipt: order.reference,
    notes: { reference: order.reference, notes: String(payable.length) },
    /*
     * Capture automatically.
     *
     * Razorpay authorises and captures as two steps, and whether the second
     * happens by itself is an account-wide dashboard setting. Left on manual
     * — which is not the default, but is one click away and invisible from
     * here — every payment would sit authorised, `order.paid` would never
     * fire, and the money would be released back days later. Setting it per
     * order overrides the account setting, so the behaviour lives in the code
     * that depends on it rather than in a checkbox nobody remembers.
     */
    payment: { capture: 'automatic' },
  });
}

/** Constant-time compare of two hex digests of the same length. */
function digestsMatch(a: string, b: string): boolean {
  const expected = Buffer.from(a, 'utf8');
  const actual = Buffer.from(b, 'utf8');
  // timingSafeEqual throws on a length mismatch, which is itself a leak of
  // nothing useful — a wrong-length signature is wrong whatever its contents.
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/**
 * Verifies the signature on a webhook body.
 *
 * Signed with the *webhook* secret — the one typed into Razorpay's webhook
 * settings page, not the API key secret — over the raw request body. The body
 * must not have been parsed and re-serialised first or the bytes no longer
 * match what was signed.
 */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const expected = createHmac('sha256', env.razorpay.webhookSecret()).update(rawBody).digest('hex');
  return digestsMatch(expected, signature);
}
