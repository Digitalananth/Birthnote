import type { Migration } from './types';

/**
 * Stripe out, Razorpay in.
 *
 * The two columns that held Stripe's identifiers are renamed rather than
 * dropped and re-added, because what they hold has not changed in kind: one
 * is the gateway's id for the intent to pay, the other its id for the money
 * that moved. Renaming keeps every historical row readable — a Stripe order
 * from last month still shows its ids on the admin page, and its invoice
 * still reconciles against the Stripe dashboard.
 *
 * `gateway` is what makes that safe. Without it the two id spaces are
 * indistinguishable and a refund against an old order would be sent to
 * Razorpay, which would answer "no such payment" — or worse, one day, would
 * not. With it, the reconcile sweep filters to its own gateway's rows and the
 * admin can see which processor a given order belongs to. Existing rows are
 * backfilled to 'stripe'; the column defaults to 'razorpay' so everything
 * created from here on is right without the application saying so.
 *
 * MySQL has no `CHANGE COLUMN IF EXISTS`, so each rename is guarded on the
 * old column still being there. That makes the migration safe to re-run and,
 * more to the point, safe against a database where someone has already done
 * this by hand.
 */

const RENAMES: [from: string, to: string, definition: string][] = [
  ['stripe_session_id', 'gateway_order_id', 'VARCHAR(255) NULL'],
  ['stripe_payment_id', 'gateway_payment_id', 'VARCHAR(255) NULL'],
];

export const migration: Migration = {
  version: '0017',
  name: 'razorpay',
  async up(m) {
    for (const [from, to, definition] of RENAMES) {
      if (await m.columnExists('orders', from)) {
        await m.execute(`ALTER TABLE orders CHANGE ${from} ${to} ${definition}`);
      } else if (!(await m.columnExists('orders', to))) {
        // Neither name is present, which no migration path produces. Say so
        // rather than adding a column and pretending the history is intact.
        m.warn(`orders has neither ${from} nor ${to}; payment ids cannot be stored.`);
      }
    }

    if (!(await m.columnExists('orders', 'gateway'))) {
      await m.execute(
        `ALTER TABLE orders
           ADD COLUMN gateway VARCHAR(16) NOT NULL DEFAULT 'razorpay' AFTER currency`
      );
      // Every row that exists at this moment predates Razorpay. Written
      // before the index below so the sweep never sees a Stripe order
      // labelled as one of ours.
      await m.execute(
        `UPDATE orders SET gateway = 'stripe'
          WHERE gateway_order_id IS NOT NULL OR gateway_payment_id IS NOT NULL`
      );
    }

    // idx_orders_session was on stripe_session_id and is what the reconcile
    // sweep and the webhook look an order up by. Same lookup, new name.
    if (await m.indexExists('orders', 'idx_orders_session')) {
      await m.execute('ALTER TABLE orders DROP INDEX idx_orders_session');
    }
    if (!(await m.indexExists('orders', 'idx_orders_gateway_order'))) {
      await m.execute('ALTER TABLE orders ADD KEY idx_orders_gateway_order (gateway_order_id)');
    }
    /*
     * When the customer was last nudged about a checkout they opened and did
     * not finish.
     *
     * A column rather than an `order_events` row, because the timelines on
     * the tracking and admin pages print any status they do not recognise
     * verbatim: a marker filed there would show the customer the words
     * "checkout_abandoned" in their own order history. This is bookkeeping
     * about a reminder, not a thing that happened to the order.
     */
    if (!(await m.columnExists('orders', 'checkout_reminder_at'))) {
      await m.execute(
        'ALTER TABLE orders ADD COLUMN checkout_reminder_at DATETIME NULL AFTER gateway_payment_id'
      );
    }

    // markOrderRefunded looks an order up by the payment id, which until now
    // had no index at all: it was rare enough not to matter with Stripe and
    // is no rarer with Razorpay, but a refund webhook doing a table scan on
    // `orders` is a cost with nothing to recommend it.
    if (!(await m.indexExists('orders', 'idx_orders_gateway_payment'))) {
      await m.execute('ALTER TABLE orders ADD KEY idx_orders_gateway_payment (gateway_payment_id)');
    }
  },
};
