import 'server-only';
import { query } from '@/lib/db';
import { recordError } from '@/server/errors';
import { markOrderPaid } from '@/lib/orders';
import { getStripe } from '@/lib/stripe';
import { sendMail, paymentReceivedEmail } from '@/lib/mail';
import { issueInvoiceForOrder } from '@/lib/invoices';
import { sendWhatsApp, orderPaidWhatsApp, whatsAppRecipient } from '@/lib/whatsapp';

/**
 * Payments Stripe completed but never told us about.
 *
 * The webhook is the only thing that marks an order paid, so a delivery that
 * never arrives — a deploy mid-flight, an outage, a misconfigured endpoint —
 * leaves a customer who has paid looking unpaid for ever. This asks Stripe
 * directly about anything still unpaid an hour after it was last touched.
 *
 * The hour of delay keeps it off sessions a customer is still in the middle
 * of, where the webhook is about to arrive anyway.
 *
 * It lives here rather than in the route because two callers need it: the
 * HTTP endpoint at /api/cron/sweep, and the opportunistic runner in
 * background-sweep.ts. A Next.js route module may export only handlers.
 */
export interface ReconcileResult {
  recovered: string[];
  checked: number;
}

export async function reconcilePayments(): Promise<ReconcileResult> {
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
      // One unreadable session must not stop the rest of the run.
      recordError('reconcile', error, row.reference);
    }
  }
  return { recovered, checked: rows.length };
}
