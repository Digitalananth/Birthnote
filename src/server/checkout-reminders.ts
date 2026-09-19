import 'server-only';
import type { ResultSetHeader } from 'mysql2';
import { query } from '@/lib/db';
import { recordError } from '@/server/errors';
import { getOrderByReference } from '@/lib/orders';
import { sendMail, checkoutAbandonedEmail } from '@/lib/mail';

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
 *
 * This is all the background sweep does. It does not ask PayU about unpaid
 * orders: a payment the webhook and return leg both missed is recovered from
 * the admin's per-order check — /api/admin/orders/:reference/payment-check.
 */
export async function nudgeAbandonedCheckouts(): Promise<string[]> {
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
