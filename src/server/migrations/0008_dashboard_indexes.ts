import type { Migration } from './types';

/**
 * Indexes the admin dashboard's aggregates need.
 *
 * The dashboard sums revenue by `paid_at` and counts notes by `availability`.
 * Neither column is indexed: `orders` has (status, created_at) and
 * `order_items` has (order_id, position) and (note_date). Without these, the
 * overview is a pair of full table scans on every page load — cheap today,
 * and quietly not cheap at ten thousand orders.
 *
 * `indexExists` is checked because a hand-made database may already have them.
 */
export const migration: Migration = {
  version: '0008',
  name: 'dashboard_indexes',
  async up(m) {
    if (!(await m.indexExists('orders', 'idx_orders_paid_at'))) {
      await m.execute('ALTER TABLE orders ADD INDEX idx_orders_paid_at (paid_at)');
    }
    if (!(await m.indexExists('order_items', 'idx_items_availability'))) {
      await m.execute('ALTER TABLE order_items ADD INDEX idx_items_availability (availability)');
    }
  },
};
