import 'server-only';
import type { ResultSetHeader } from 'mysql2';
import { query } from '@/lib/db';
import { recordError } from '@/server/errors';
import { markOrderPaid, getOrderByReference } from '@/lib/orders';
import { getRazorpay } from '@/lib/razorpay';
import { sendMail, paymentReceivedEmail, checkoutAbandonedEmail } from '@/lib/mail';
import { issueInvoiceForOrder } from '@/lib/invoices';
import { sendWhatsApp, orderPaidWhatsApp, whatsAppRecipient } from '@/lib/whatsapp';

/**
 * Payments Razorpay completed but never told us about.
 *
 * The webhook is the only thing that marks an order paid, so a delivery that
 * never arrives — a deploy mid-flight, an outage, a misconfigured endpoint —
 * leaves a customer who has paid looking unpaid for ever. This asks Razorpay
 * directly about anything still unpaid an hour after it was last touched.
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
   * `gateway = 'razorpay'` is not decoration. Orders that predate the
   * migration hold Stripe identifiers in the same column, and a Stripe
   * session id fetched from Razorpay is at best a 404 for every sweep from
   * now until the row is archived.
   */
  const rows = await query<UnpaidRow[]>(
    `SELECT reference, gateway_order_id FROM orders
      WHERE status = 'confirmed'
        AND gateway = 'razorpay'
        AND gateway_order_id IS NOT NULL
        AND updated_at < UTC_TIMESTAMP() - INTERVAL 1 HOUR
      ORDER BY updated_at ASC
      LIMIT 25`
  );

  const recovered: string[] = [];
  for (const row of rows) {
    try {
      const gatewayOrder = await getRazorpay().orders.fetch(row.gateway_order_id);
      // 'created' is untouched, 'attempted' is tried and not completed. Only
      // 'paid' means the full amount was captured.
      if (gatewayOrder.status !== 'paid') continue;

      // A Razorpay order carries no payment id, only its own. The captured
      // payment has to be looked up separately — and the order may hold
      // several attempts, of which at most one is captured.
      const payments = await getRazorpay().orders.fetchPayments(row.gateway_order_id);
      const captured = payments.items.find((payment) => payment.status === 'captured');

      const order = await markOrderPaid(row.gateway_order_id, captured?.id ?? null);
      // Null when something else got there first; only the winner emails.
      if (order) {
        recovered.push(order.reference);
        // A payment recovered here is as real as one the webhook delivered, so
        // it gets its invoice the same way.
        let invoiceNumber: string | null = null;
        try {
          invoiceNumber = (await issueInvoiceForOrder(order)).number;
        } catch (invoiceError) {
          recordError('reconcile.invoice', invoiceError, row.reference);
        }
        await sendMail(paymentReceivedEmail(order, invoiceNumber));
        if (whatsAppRecipient(order)) await sendWhatsApp(orderPaidWhatsApp(order));
      }
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
 * the news. A Razorpay order does not expire, so nothing announces it and the
 * question has to be asked: which confirmed orders have had a checkout opened
 * against them, long enough ago that the customer is not still in it?
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
        AND gateway = 'razorpay'
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
