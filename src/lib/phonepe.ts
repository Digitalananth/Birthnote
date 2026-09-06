import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';
import { availableItems, type Order } from '@/lib/orders';

/**
 * PhonePe Standard Checkout v2, which takes the money.
 *
 * Spoken to over plain `fetch` rather than through an SDK. The whole surface
 * we need is four calls, and a dependency that wraps them would still have to
 * be told the base URLs and would still leave the token caching to us.
 *
 * The shape differs from the hosted modal this replaced in one way that
 * matters everywhere downstream: PhonePe hosts the payment page on its own
 * origin and *redirects* the customer there. Nothing comes back on the return
 * leg — no signature, no status, not even a transaction id. So the redirect is
 * a hint and only two things are evidence: the webhook, and the Order Status
 * API. Both are used, and both end in the same `settle` path.
 */

/** Prod and sandbox differ by more than a hostname; the OAuth path moves too. */
const HOSTS = {
  production: {
    oauth: 'https://api.phonepe.com/apis/identity-manager/v1/oauth/token',
    api: 'https://api.phonepe.com/apis/pg',
  },
  sandbox: {
    oauth: 'https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token',
    api: 'https://api-preprod.phonepe.com/apis/pg-sandbox',
  },
} as const;

/** Thrown when an order is not in a state that can be paid for. */
export class NotPayableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotPayableError';
  }
}

/** Thrown when PhonePe answered, but not with what was asked for. */
export class PhonePeError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = 'PhonePeError';
  }
}

interface CachedToken {
  token: string;
  /** Epoch seconds, from PhonePe's own `expires_at`. */
  expiresAt: number;
}

const globalForPhonePe = globalThis as unknown as {
  myLuckyDatesPhonePeToken?: CachedToken;
  myLuckyDatesPhonePeTokenPromise?: Promise<string>;
};

/*
 * Refresh this many seconds before PhonePe says the token dies.
 *
 * A token that expires mid-flight fails the call it was fetched for, and the
 * customer sees that as a checkout that would not open. A minute is far longer
 * than any round trip here and costs nothing but a slightly earlier refresh.
 */
const TOKEN_REFRESH_MARGIN_SECONDS = 60;

/**
 * An `O-Bearer` token, cached until shortly before it expires.
 *
 * Cached on `globalThis` for the same reason the connection pool is: in dev,
 * Next.js re-evaluates modules on every edit, and a module-level variable
 * would mean a fresh token per keystroke. PhonePe rate-limits token issuance.
 *
 * The in-flight promise is cached too, not just the result. Without it, a
 * burst of checkouts arriving on a cold process each starts its own token
 * request — the exact moment the rate limit is most likely to be reached, and
 * for a token every one of them would have shared.
 */
export async function getAccessToken(): Promise<string> {
  const cached = globalForPhonePe.myLuckyDatesPhonePeToken;
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.expiresAt - TOKEN_REFRESH_MARGIN_SECONDS > now) return cached.token;

  if (globalForPhonePe.myLuckyDatesPhonePeTokenPromise) {
    return globalForPhonePe.myLuckyDatesPhonePeTokenPromise;
  }

  const pending = (async () => {
    const response = await fetch(HOSTS[env.phonepe.mode()].oauth, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.phonepe.clientId(),
        client_version: env.phonepe.clientVersion(),
        client_secret: env.phonepe.clientSecret(),
        grant_type: 'client_credentials',
      }),
      cache: 'no-store',
    });

    const body = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      expires_at?: number;
      message?: string;
    };
    if (!response.ok || !body.access_token) {
      throw new PhonePeError(
        `PhonePe refused the client credentials: ${body.message ?? response.statusText}`,
        response.status
      );
    }

    globalForPhonePe.myLuckyDatesPhonePeToken = {
      token: body.access_token,
      // A token with no stated expiry is treated as short-lived rather than
      // eternal: guessing long here means serving a dead token for an hour.
      expiresAt: body.expires_at ?? Math.floor(Date.now() / 1000) + 300,
    };
    return body.access_token;
  })();

  globalForPhonePe.myLuckyDatesPhonePeTokenPromise = pending;
  try {
    return await pending;
  } finally {
    // Cleared whether it resolved or threw. A failed token fetch that left
    // its rejected promise cached would fail every later call for ever.
    globalForPhonePe.myLuckyDatesPhonePeTokenPromise = undefined;
  }
}

/** A PhonePe API call with the bearer token attached. */
async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const response = await fetch(`${HOSTS[env.phonepe.mode()].api}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `O-Bearer ${token}`,
      ...init?.headers,
    },
    cache: 'no-store',
  });

  const body = (await response.json().catch(() => ({}))) as T & {
    code?: string;
    message?: string;
  };
  if (!response.ok) {
    throw new PhonePeError(
      `PhonePe ${path} failed: ${body.code ?? ''} ${body.message ?? response.statusText}`.trim(),
      response.status
    );
  }
  return body;
}

/**
 * The id PhonePe will know this attempt by.
 *
 * Unlike Razorpay, which issued the id, PhonePe takes ours — and takes it as
 * the key of the whole order, so it must be new on every attempt. A customer
 * whose card is declined and who tries again needs a second PhonePe order;
 * reusing the reference would land on the first, failed one.
 *
 * The reference is still the prefix, so the id remains legible in PhonePe's
 * dashboard and greppable from a customer email. 24 characters plus a base-36
 * millisecond stamp is well inside the 63-character limit, and both halves use
 * only characters PhonePe allows.
 */
function mintMerchantOrderId(reference: string): string {
  return `${reference}-${Date.now().toString(36).toUpperCase()}`;
}

export interface PaymentOrder {
  /** Ours, and what every later lookup is keyed by. Stored as gateway_order_id. */
  merchantOrderId: string;
  /** PhonePe's hosted checkout, which the browser is sent to. */
  redirectUrl: string;
}

/**
 * Creates a PhonePe order for a confirmed order of ours.
 *
 * `total_paise` is the total frozen onto the row when the order was priced, so
 * there is nothing to recompute here: the number charged is by construction
 * the number the payment page printed and the number the invoice will carry.
 * PhonePe is handed one amount and no line items, which is why the payment
 * page prints the breakup — notes, delivery, GST — before the button.
 *
 * Card and UPI details are entered on PhonePe's own page, so no payment
 * credentials touch this server. That is what keeps the site out of PCI-DSS
 * scope, exactly as the Razorpay modal and the Stripe redirect before it did.
 */
export async function createPaymentOrder(order: Order): Promise<PaymentOrder> {
  const payable = availableItems(order).filter((item) => (item.pricePaise ?? 0) > 0);
  if (!payable.length) {
    throw new NotPayableError('This order has no priced notes to pay for.');
  }
  if (!order.shipping) {
    throw new NotPayableError('This order has no delivery address yet.');
  }
  // PhonePe is a domestic gateway and settles in rupees only. An order in
  // anything else is a pricing bug upstream, and taking the money would be
  // worse than refusing it.
  if (order.currency.toUpperCase() !== 'INR') {
    throw new NotPayableError(`PhonePe cannot charge in ${order.currency}.`);
  }
  if (order.totalPaise <= 0) {
    throw new NotPayableError('This order has no amount to charge.');
  }
  // PhonePe rejects anything under a rupee. Our cheapest note is far above
  // this; the guard exists so a pricing bug fails here with a sentence rather
  // than at PhonePe with a code.
  if (order.totalPaise < 100) {
    throw new NotPayableError('This order is below the minimum amount PhonePe will charge.');
  }

  const merchantOrderId = mintMerchantOrderId(order.reference);

  const body = await call<{ redirectUrl?: string; state?: string }>('/checkout/v2/pay', {
    method: 'POST',
    body: JSON.stringify({
      merchantOrderId,
      amount: order.totalPaise,
      /*
       * Thirty minutes to pay.
       *
       * PhonePe caps this at an hour and defaults to it. Half that is chosen
       * deliberately: an expired order is the honest state for a checkout
       * nobody is sitting in, and the customer simply presses the button
       * again for a fresh one. The abandoned-checkout nudge, which fires a day
       * later, is what actually brings them back.
       */
      expireAfter: 1800,
      // udf1 carries our reference so a PhonePe dashboard row can be traced
      // back to an order without going through the merchantOrderId prefix.
      metaInfo: { udf1: order.reference },
      paymentFlow: {
        type: 'PG_CHECKOUT',
        message: `Order ${order.reference}`,
        merchantUrls: { redirectUrl: `${env.siteUrl}/payment/${order.reference}/success` },
      },
    }),
  });

  if (!body.redirectUrl) {
    throw new PhonePeError('PhonePe created the order without a checkout URL.');
  }
  return { merchantOrderId, redirectUrl: body.redirectUrl };
}

export interface OrderStatus {
  state: 'PENDING' | 'COMPLETED' | 'FAILED' | string;
  /** PhonePe's id for the attempt that succeeded, when one has. */
  transactionId: string | null;
}

/**
 * Asks PhonePe what actually happened to an order.
 *
 * The single source of truth on the return leg, and the backstop for a webhook
 * that never arrived. One call answers both questions the old Razorpay path
 * needed two for: the state, and the id of the attempt that carried it.
 */
export async function fetchOrderStatus(merchantOrderId: string): Promise<OrderStatus> {
  const body = await call<{
    state?: string;
    paymentDetails?: { state?: string; transactionId?: string }[];
  }>(`/checkout/v2/order/${encodeURIComponent(merchantOrderId)}/status?details=false`);

  // An order may hold several attempts, of which at most one completed. Fall
  // back to the sole attempt when PhonePe reports one without a state.
  const completed =
    body.paymentDetails?.find((attempt) => attempt.state === 'COMPLETED') ??
    (body.state === 'COMPLETED' ? body.paymentDetails?.[0] : undefined);

  return { state: body.state ?? 'PENDING', transactionId: completed?.transactionId ?? null };
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
 * Verifies the Authorization header on a webhook.
 *
 * PhonePe does not sign the body. It sends `SHA256(username:password)` over
 * the credentials typed into the dashboard when the webhook was registered —
 * the same value on every delivery, which makes it a shared secret rather than
 * a signature. It proves the sender knows the password and nothing about the
 * bytes that followed.
 *
 * That is the reason the handler does not act on the payload's word alone: it
 * re-asks the Order Status API before marking anything paid. A constant header
 * cannot tell a replayed body from a fresh one, and this is the cheapest place
 * to stop trusting it.
 *
 * Compared in constant time all the same, so the digest cannot be recovered a
 * character at a time from response timings.
 */
export function verifyWebhookAuth(header: string | null): boolean {
  if (!header) return false;
  const expected = createHash('sha256')
    .update(`${env.phonepe.webhookUsername()}:${env.phonepe.webhookPassword()}`)
    .digest('hex');
  // Some senders prefix the scheme; accept the digest with or without it.
  const received = header.replace(/^SHA256\s+/i, '').trim();
  return digestsMatch(expected, received.toLowerCase());
}
