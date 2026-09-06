import type { Migration } from './types';

/**
 * Razorpay out, PhonePe in.
 *
 * Almost nothing to do, and that is the point: 0017 already renamed the two
 * Stripe columns to gateway-neutral names and added `gateway` to say whose id
 * space each row's identifiers belong to. A third processor needs no new
 * columns at all — only the default changed, so that a row created without the
 * application naming a gateway is labelled the one actually in use.
 *
 * No data is rewritten. Every historical row keeps its ids and its label, so a
 * Razorpay order from last month still shows its ids on the admin page and
 * still reconciles against the Razorpay dashboard — and, more to the point, is
 * still excluded from the reconcile sweep, which filters to `gateway =
 * 'phonepe'`. Asking PhonePe about a Razorpay order id would be a 404 every
 * fifteen minutes until the row was archived.
 *
 * MySQL applies `ALTER ... SET DEFAULT` to future inserts only, which is
 * exactly the scope wanted here, and re-running it is harmless — so unlike the
 * renames in 0017 this needs no existence guard.
 */

export const migration: Migration = {
  version: '0019',
  name: 'phonepe',
  async up(m) {
    if (!(await m.columnExists('orders', 'gateway'))) {
      // 0017 adds this column and 0017 runs first. Reaching here means the
      // history is not what it claims to be; say so rather than papering over
      // it, because the sweep's gateway filter depends on this column.
      m.warn('orders has no gateway column; 0017 did not complete.');
      return;
    }
    await m.execute("ALTER TABLE orders ALTER COLUMN gateway SET DEFAULT 'phonepe'");
  },
};
