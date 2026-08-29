import type { Migration } from './types';

/**
 * Indexes the reports scan.
 *
 * Every report is bounded by a date range. `orders` has (status, created_at),
 * which a range on created_at alone cannot use — the leading column is not in
 * the predicate. `order_events` has (order_id, created_at), same problem for
 * the funnel and turnaround reports, which sweep events by time rather than by
 * order. `users.created_at` has no index at all.
 */
export const migration: Migration = {
  version: '0009',
  name: 'report_indexes',
  async up(m) {
    if (!(await m.indexExists('orders', 'idx_orders_created'))) {
      await m.execute('ALTER TABLE orders ADD INDEX idx_orders_created (created_at)');
    }
    if (!(await m.indexExists('order_events', 'idx_events_created'))) {
      await m.execute('ALTER TABLE order_events ADD INDEX idx_events_created (created_at)');
    }
    if (!(await m.indexExists('users', 'idx_users_created'))) {
      await m.execute('ALTER TABLE users ADD INDEX idx_users_created (created_at)');
    }
  },
};
