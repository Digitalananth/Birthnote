import 'server-only';
import type { ResultSetHeader } from 'mysql2';
import { query } from '@/lib/db';
import { recordError } from '@/server/errors';
import { getOrderByReference } from '@/lib/orders';
import { fetchOrderStatus } from '@/lib/phonepe';
import { sendMail, checkoutAbandonedEmail } from '@/lib/mail';
import { settleOrder } from '@/server/settle';

/**
 * Payments PhonePe completed but never told us about.
 *
 * The webhook and the success page are both quick and both skippable — a
 * delivery that never arrives, a customer who closes the tab on the return
 * leg — and either way someone who has paid is left looking unpaid. This asks
 * PhonePe directly about anything still unpaid an hour after it was last
 * touched.
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
  gateway_order_id: string;
}

export async function reconcilePayments(): Promise<ReconcileResult> {
  /*
   * `gateway = 'phonepe'` is not decoration. Orders that predate the
   * migrations hold Razorpay and Stripe identifiers in the same column, and
   * one of those fetched from PhonePe is at best a 404 for every sweep from
   * now until the row is archived.
   */
  const rows = await query<UnpaidRow[]>(
    `SELECT reference, gateway_order_id FROM orders
      WHERE status = 'confirmed'
        AND gateway = 'phonepe'
        AND gateway_order_id IS NOT NULL
        AND updated_at < UTC_TIMESTAMP() - INTERVAL 1 HOUR
      ORDER BY updated_at ASC
      LIMIT 25`
  );

  const recovered: string[] = [];
  for (const row of rows) {
    try {
      // One call, unlike the two Razorpay needed: PhonePe returns the order's
      // state and the attempt that carried it together. 'PENDING' is still in
      // play or expired unpaid, 'FAILED' is decided against us. Only
      // 'COMPLETED' means the money moved.
      const status = await fetchOrderStatus(row.gateway_order_id);
      if (status.state !== 'COMPLETED') continue;

      // A payment recovered here is as real as one the webhook delivered, so
      // it gets its invoice and its receipt the same way — and through the
      // same call, so whichever of the three routes arrives first is the only
      // one that emails.
      const settled = await settleOrder(row.gateway_order_id, status.transactionId, 'reconcile');
      if (settled) recovered.push(row.reference);
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
 * the news. A PhonePe order does expire, half an hour after it is created, but
 * nothing announces that either, so the question still has to be asked: which
 * confirmed orders have had a checkout opened against them, long enough ago
 * that the customer is not still in it?
 *
 * `checkout_reminder_at` is what stops it repeating. It is set before the mail
 * is sent rather than after: a send that throws halfway is far better left
 * unrepeated than retried every fifteen minutes into somebody's inbox.
 *
 * Writing it bumps `updated_at`, which puts the order back outside the hour
 * the reconcile pass above waits for. That is a delay of one sweep on an
 * order that has been unpaid for a day, on the off-chance its webhook was
 * also lost — well inside the tolerance that pass is already built for.
 */
async function nudgeAbandonedCheckouts(): Promise<string[]> {
  const rows = await query<{ reference: string }[]>(
    `SELECT reference FROM orders
      WHERE status = 'confirmed'
        AND gateway = 'phonepe'
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
