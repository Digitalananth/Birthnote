import 'server-only';
import type { ResultSetHeader } from 'mysql2';
import { query } from '@/lib/db';
import { recordError } from '@/server/errors';
import { getOrderByReference } from '@/lib/orders';
import { sendMail, checkoutAbandonedEmail } from '@/lib/mail';
import { settleIfPaid } from '@/server/settle';

/**
 * Payments PayU completed but never told us about.
 *
 * The webhook and the success page are both quick and both skippable — a
 * delivery that never arrives, a customer who closes the tab on the return
 * leg — and either way someone who has paid is left looking unpaid. This asks
 * PayU directly about every checkout attempt, on an order still unpaid, that
 * was opened more than an hour ago.
 *
 * The hour of delay keeps it off checkouts a customer is still in the middle
 * of, where the webhook is about to arrive anyway.
 *
 * It lives here rather than in the route because two callers need it: the
 * HTTP endpoint at /api/cron/sweep, and the opportunistic runner in
 * background-sweep.ts. A Next.js route module may export only handlers.
 */
export interface ReconcileResult {
  recovered: string[];
  checked: number;
  /** References sent the abandoned-checkout nudge on this run. */
  nudged: string[];
}

interface UnpaidRow {
  reference: string;
  txn_id: string;
}

export async function reconcilePayments(): Promise<ReconcileResult> {
  /*
   * One row per *attempt*, not per order. A customer who opened the checkout
   * twice may have paid on the first, and asking PayU only about the latest
   * txnid gets "not paid" for an order that is. Newest attempts first: a
   * payment is made minutes after its attempt, so that is where a lost one is,
   * and old abandoned attempts must not crowd it out of the limit.
   *
   * `gateway = 'payu'` is not decoration. Orders that predate the
   * migrations hold earlier processors' identifiers, and one of those fetched
   * from PayU is at best a 404 for every sweep from now until the row is
   * archived.
   */
  const rows = await query<UnpaidRow[]>(
    `SELECT o.reference, a.txn_id
       FROM order_payment_attempts a
       JOIN orders o ON o.id = a.order_id
      WHERE o.status = 'confirmed'
        AND o.gateway = 'payu'
        AND a.created_at < UTC_TIMESTAMP() - INTERVAL 1 HOUR
      ORDER BY a.created_at DESC
      LIMIT 50`
  );

  const recovered: string[] = [];
  for (const row of rows) {
    // An earlier attempt of the same order settled it on this very run.
    if (recovered.includes(row.reference)) continue;
    try {
      // A payment recovered here is as real as one the webhook delivered, so
      // it goes through the same gate — PayU's word and the amount — and the
      // same idempotent settle, so whichever route arrives first is the only
      // one that emails. 'pending' is left for the next sweep.
      const outcome = await settleIfPaid(row.txn_id, 'reconcile');
      if (outcome === 'settled') recovered.push(row.reference);
    } catch (error) {
      // One unreadable order must not stop the rest of the run.
      recordError('reconcile', error, row.reference);
    }
  }

  const nudged = await nudgeAbandonedCheckouts();
  return { recovered, checked: rows.length, nudged };
}

/**
 * Reminds customers who opened a checkout a day ago and never came back.
 *
 * Stripe announced this as an event — a session expired, and the expiry was
 * the news. An abandoned PayU checkout is not announced
 * either, so the question still has to be asked: which
 * confirmed orders have had a checkout opened against them, long enough ago
 * that the customer is not still in it?
 *
 * `checkout_reminder_at` is what stops it repeating. It is set before the mail
 * is sent rather than after: a send that throws halfway is far better left
 * unrepeated than retried every fifteen minutes into somebody's inbox.
 */
async function nudgeAbandonedCheckouts(): Promise<string[]> {
  const rows = await query<{ reference: string }[]>(
    `SELECT reference FROM orders
      WHERE status = 'confirmed'
        AND gateway = 'payu'
        AND gateway_order_id IS NOT NULL
        AND checkout_reminder_at IS NULL
        AND updated_at < UTC_TIMESTAMP() - INTERVAL 24 HOUR
      ORDER BY updated_at ASC
      LIMIT 25`
  );

  const nudged: string[] = [];
  for (const row of rows) {
    try {
      // Claim it first, and only for a row still in the state we read it in:
      // two workers sweeping at once means two SELECTs returning the same
      // reference, and only the UPDATE can decide which of them owns it.
      const claim = await query<ResultSetHeader>(
        `UPDATE orders SET checkout_reminder_at = UTC_TIMESTAMP()
          WHERE reference = ? AND status = 'confirmed' AND checkout_reminder_at IS NULL`,
        [row.reference]
      );
      if (!claim.affectedRows) continue;

      const order = await getOrderByReference(row.reference);
      if (!order) continue;
      await sendMail(checkoutAbandonedEmail(order));
      nudged.push(row.reference);
    } catch (error) {
      recordError('reconcile.nudge', error, row.reference);
    }
  }
  return nudged;
}
