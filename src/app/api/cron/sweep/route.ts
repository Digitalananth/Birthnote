import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';
import { query } from '@/lib/db';
import { recordError } from '@/server/errors';
import { recordSweep } from '@/server/sweep-state';
import { markOrderPaid } from '@/lib/orders';
import { getStripe } from '@/lib/stripe';
import { sendMail, paymentReceivedEmail } from '@/lib/mail';
import { sendWhatsApp, orderPaidWhatsApp, whatsAppRecipient } from '@/lib/whatsapp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Reconciliation, called by the hosting's cron over HTTP.
 *
 * This deliberately sends nothing to a customer on its own initiative. Chasing
 * an unpaid hold is a judgement call an admin makes from the order queue — see
 * src/lib/holds.ts. All that runs unattended is the one thing a human cannot
 * do by watching: noticing a payment Stripe completed and never told us about.
 *
 * It runs over HTTP rather than as a script because Hostinger prunes the
 * deployment to .next, node_modules, package.json and public — there is no
 * scripts/ directory on the server, and the running app is the only thing
 * holding the database and Stripe credentials.
 *
 * `markOrderPaid` is idempotent, so running twice, or two workers running at
 * once, cannot pay an order twice or email the customer twice.
 */

/**
 * Compares the presented token with the configured one in constant time.
 *
 * A plain `===` leaks the secret one character at a time to anyone able to
 * measure the response, which over enough requests is a real attack on a
 * long-lived shared secret.
 */
function authorised(request: Request): boolean {
  if (!env.cron.enabled()) return false;
  const header = request.headers.get('authorization') ?? '';
  const presented = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!presented) return false;

  const expected = env.cron.secret();
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, which would itself leak the
  // length; compare a known-equal pair and fail separately.
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

/**
 * Payments Stripe completed but never told us about.
 *
 * The webhook is the only thing that marks an order paid, so a delivery that
 * never arrives — a deploy mid-flight, an outage, a misconfigured endpoint —
 * leaves a customer who has paid looking unpaid for ever. This asks Stripe
 * directly about anything still unpaid an hour after it was last touched.
 *
 * The hour of delay keeps the sweep off sessions a customer is still in the
 * middle of, where the webhook is about to arrive anyway.
 */
async function reconcilePayments(): Promise<{ recovered: string[]; checked: number }> {
  const rows = await query<{ reference: string; stripe_session_id: string }[]>(
    `SELECT reference, stripe_session_id FROM orders
      WHERE status = 'confirmed'
        AND stripe_session_id IS NOT NULL
        AND updated_at < UTC_TIMESTAMP() - INTERVAL 1 HOUR
      ORDER BY updated_at ASC
      LIMIT 25`
  );

  const recovered: string[] = [];
  for (const row of rows) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(row.stripe_session_id);
      if (session.payment_status !== 'paid') continue;

      const paymentIntent =
        typeof session.payment_intent === 'string' ? session.payment_intent : null;
      const order = await markOrderPaid(session.id, paymentIntent);
      // Null when something else got there first; only the winner emails.
      if (order) {
        recovered.push(order.reference);
        await sendMail(paymentReceivedEmail(order));
        if (whatsAppRecipient(order)) await sendWhatsApp(orderPaidWhatsApp(order));
      }
    } catch (error) {
      // One unreadable session must not stop the rest of the sweep.
      recordError('cron-reconcile', error, row.reference);
    }
  }
  return { recovered, checked: rows.length };
}

export async function POST(request: Request) {
  if (!authorised(request)) {
    // Deliberately identical whether the secret is wrong or simply unset: an
    // unauthenticated caller learns nothing about which.
    return NextResponse.json({ error: 'Not authorised.' }, { status: 401 });
  }

  let reconciled: { recovered: string[]; checked: number } = { recovered: [], checked: 0 };
  if (env.stripe.configured()) {
    try {
      reconciled = await reconcilePayments();
    } catch (error) {
      recordError('cron-reconcile', error);
    }
  }

  const at = recordSweep();

  return NextResponse.json({
    ok: true,
    at,
    recovered: reconciled.recovered,
    sessionsChecked: reconciled.checked,
  });
}

/**
 * GET is the same sweep, so a cron that cannot easily send POST still works.
 * The secret is required either way.
 */
export const GET = POST;
