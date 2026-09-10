import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';
import { availableItems, type Order } from '@/lib/orders';

/**
 * PayU India Hosted Checkout, which takes the money.
 *
 * Spoken to over plain `fetch` and `crypto` rather than through `payu-websdk`.
 * The whole surface we need is one signed form and two server-to-server
 * commands, each a SHA-512 over pipe-joined fields, and the SDK's own docs are
 * not consistent about what it is called.
 *
 * The shape that matters everywhere downstream: PayU's payment page is reached
 * by the *browser* POSTing a signed form to PayU, and the customer comes back
 * the same way — PayU POSTs a signed form to our return route. That return is
 * signed, but it arrives through the customer's browser, so it is a hint. Only
 * the Verify Payment API is evidence, and every route that marks an order paid
 * — the return route, the webhook, the success page and the reconcile sweep —
 * asks it first and ends in the same `settle` path.
 *
 * Formulas are from docs.payu.in: "Generate Hash for Merchant Hosted",
 * "Verify Payment API" and "Check Action Status API".
 */

const HOSTS = {
  production: {
    payment: 'https://secure.payu.in/_payment',
    api: 'https://info.payu.in/merchant/postservice.php?form=2',
  },
  test: {
    payment: 'https://test.payu.in/_payment',
    api: 'https://test.payu.in/merchant/postservice.php?form=2',
  },
} as const;

/** Thrown when an order is not in a state that can be paid for. */
export class NotPayableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotPayableError';
  }
}

/** Thrown when PayU answered, but not with what was asked for. */
export class PayUError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = 'PayUError';
  }
}

function sha512(value: string): string {
  return createHash('sha512').update(value, 'utf8').digest('hex');
}

/** Constant-time compare of two hex digests. */
function digestsMatch(expected: string, received: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(received.toLowerCase(), 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * The txnid PayU will know this attempt by.
 *
 * Ours, and it must be new on every attempt: PayU refuses a txnid it has
 * already seen, so a customer whose card is declined and who tries again needs
 * a second one. PayU caps it at 25 characters. The reference without its
 * hyphens is at most 16, and a base-36 millisecond stamp adds 8 — 24, all
 * alphanumeric, and still legible as the order in PayU's dashboard.
 */
function mintTxnId(reference: string): string {
  const prefix = reference.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return `${prefix}${Date.now().toString(36).toUpperCase()}`.slice(0, 25);
}

/** Paise to the rupee string PayU is sent — and, identically, hashes. */
function rupees(paise: number): string {
  return (paise / 100).toFixed(2);
}

/** PayU's length limits, applied before hashing so the hash covers what is sent. */
function clip(value: string, max: number): string {
  return value.trim().slice(0, max);
}

export interface PaymentForm {
  /** Ours, and what every later lookup is keyed by. Stored as gateway_order_id. */
  txnId: string;
  /** Where the browser POSTs the form. */
  action: string;
  /** Every field, hash included, exactly as hashed. */
  fields: Record<string, string>;
}

/**
 * Builds the signed form that sends the customer to PayU for a confirmed order.
 *
 * `total_paise` is the total frozen onto the row when the order was priced, so
 * the number charged is by construction the number the payment page printed.
 * The amount is inside the hash, so a browser that edits the form before
 * submitting it is refused by PayU rather than charged a different sum.
 *
 * Card and UPI details are entered on PayU's own page, so no payment
 * credentials touch this server. That is what keeps the site out of PCI-DSS
 * scope.
 */
export function createPaymentForm(order: Order): PaymentForm {
  const payable = availableItems(order).filter((item) => (item.pricePaise ?? 0) > 0);
  if (!payable.length) {
    throw new NotPayableError('This order has no priced notes to pay for.');
  }
  if (!order.shipping) {
    throw new NotPayableError('This order has no delivery address yet.');
  }
  // PayU India settles in rupees. An order in anything else is a pricing bug
  // upstream, and taking the money would be worse than refusing it.
  if (order.currency.toUpperCase() !== 'INR') {
    throw new NotPayableError(`PayU cannot charge in ${order.currency}.`);
  }
  if (order.totalPaise < 100) {
    throw new NotPayableError('This order has no amount to charge.');
  }
  const phone = order.shipping.phone ?? order.whatsapp;
  if (!phone) {
    throw new NotPayableError('Please add a phone number to your delivery address before paying.');
  }

  const key = env.payu.key();
  const txnId = mintTxnId(order.reference);
  const amount = rupees(order.totalPaise);
  const productinfo = clip(`Order ${order.reference}`, 100);
  const firstname = clip(order.customerName || 'Customer', 60);
  const email = clip(order.customerEmail, 50);
  // udf1 carries our reference, so the return and the webhook can be traced to
  // an order even before the txnid is looked up, and PayU's dashboard shows it.
  const udf = [order.reference, '', '', '', ''];

  // key|txnid|amount|productinfo|firstname|email|udf1..udf5||||||SALT
  const hash = sha512(
    [key, txnId, amount, productinfo, firstname, email, ...udf, '', '', '', '', '', env.payu.salt()].join(
      '|'
    )
  );

  const returnUrl = `${env.siteUrl}/api/payments/payu/return`;
  return {
    txnId,
    action: HOSTS[env.payu.mode()].payment,
    fields: {
      key,
      txnid: txnId,
      amount,
      productinfo,
      firstname,
      email,
      phone: clip(phone, 50),
      udf1: udf[0],
      surl: returnUrl,
      furl: returnUrl,
      hash,
    },
  };
}

/**
 * Checks the reverse hash on a form PayU posted — the return leg or a
 * payment webhook, which carry the same fields.
 *
 * sha512([additional_charges|]SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|
 * firstname|productinfo|amount|txnid|key). A valid hash proves PayU wrote these
 * fields; it does not prove they are fresh, which is why callers still ask the
 * Verify Payment API before believing a payment.
 */
export function verifyResponseHash(fields: Record<string, string>): boolean {
  const received = fields.hash;
  if (!received || fields.key !== env.payu.key()) return false;
  const parts = [
    env.payu.salt(),
    fields.status ?? '',
    '',
    '',
    '',
    '',
    '',
    fields.udf5 ?? '',
    fields.udf4 ?? '',
    fields.udf3 ?? '',
    fields.udf2 ?? '',
    fields.udf1 ?? '',
    fields.email ?? '',
    fields.firstname ?? '',
    fields.productinfo ?? '',
    fields.amount ?? '',
    fields.txnid ?? '',
    fields.key,
  ];
  if (fields.additional_charges) parts.unshift(fields.additional_charges);
  return digestsMatch(sha512(parts.join('|')), received);
}

/** A postservice command: `hash = sha512(key|command|var1|salt)`. */
async function command<T>(name: string, vars: Record<string, string>): Promise<T> {
  const key = env.payu.key();
  const response = await fetch(HOSTS[env.payu.mode()].api, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      key,
      command: name,
      hash: sha512([key, name, vars.var1 ?? '', env.payu.salt()].join('|')),
      ...vars,
    }),
    cache: 'no-store',
  });
  const body = (await response.json().catch(() => null)) as (T & { status?: number; msg?: string }) | null;
  if (!response.ok || !body) {
    throw new PayUError(`PayU ${name} failed: ${response.statusText}`, response.status);
  }
  if (body.status === 0) {
    throw new PayUError(`PayU ${name} refused: ${body.msg ?? 'no reason given'}`);
  }
  return body;
}

export interface TransactionStatus {
  /** PayU's word for the payment: 'success', 'failure', 'pending', or 'Not Found'. */
  status: string;
  /** PayU's id for the payment (mihpayid), needed for refunds. */
  paymentId: string | null;
  /** What PayU says was charged, in paise, to compare against the order. */
  amountPaise: number | null;
}

/**
 * Asks PayU what actually happened to a txnid.
 *
 * The single source of truth. Only 'success' means the money moved; PayU's own
 * guidance is that 'pending' must be treated as not paid until a later check
 * says otherwise, which the reconcile sweep provides.
 */
export async function verifyPayment(txnId: string): Promise<TransactionStatus> {
  const body = await command<{
    transaction_details?: Record<string, { status?: string; mihpayid?: string; amt?: string }>;
  }>('verify_payment', { var1: txnId });

  const detail = body.transaction_details?.[txnId];
  const amount = detail?.amt ? Math.round(Number(detail.amt) * 100) : NaN;
  return {
    status: detail?.status ?? 'Not Found',
    paymentId: detail?.mihpayid && detail.mihpayid !== 'Not Found' ? detail.mihpayid : null,
    amountPaise: Number.isFinite(amount) ? amount : null,
  };
}

/**
 * Whether PayU confirms a txnid as paid in full for this order.
 *
 * The amount check is the one the hash on the request already implies, made
 * again against PayU's record: a success for less than the order's total is
 * not a payment for this order.
 */
export function isPaidInFull(status: TransactionStatus, totalPaise: number): boolean {
  return status.status === 'success' && status.amountPaise === totalPaise;
}

/**
 * Asks PayU whether a refund request has actually completed.
 *
 * PayU's refund webhook carries no hash, so its word is not taken: the refund's
 * own request id is looked up with Check Action Status before anything is
 * recorded or emailed.
 */
export async function refundSucceeded(requestId: string): Promise<boolean> {
  const body = await command<{
    transaction_details?: Record<string, Record<string, { status?: string }> | { status?: string }>;
  }>('check_action_status', { var1: requestId });

  const details = body.transaction_details?.[requestId];
  if (!details) return false;
  // Keyed either directly or by the refund's own id beneath the request.
  const entries = 'status' in details ? [details as { status?: string }] : Object.values(details);
  return entries.some((entry) => String(entry?.status ?? '').toLowerCase() === 'success');
}
