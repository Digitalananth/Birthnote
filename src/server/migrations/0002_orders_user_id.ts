import type { Migration } from './types';

/**
 * Phase 1: an order can belong to an account.
 *
 * Deliberately SET NULL, not CASCADE: deleting an account must never delete
 * the financial record of an order that was paid for.
 *
 * Guarded because databases migrated by the old script already have these.
 */
export const migration: Migration = {
  version: '0002',
  name: 'orders_user_id',
  async up(m) {
    if (!(await m.columnExists('orders', 'user_id'))) {
      await m.execute('ALTER TABLE orders ADD COLUMN user_id BIGINT UNSIGNED NULL AFTER reference');
    }
    if (!(await m.indexExists('orders', 'idx_orders_user'))) {
      await m.execute('ALTER TABLE orders ADD KEY idx_orders_user (user_id, created_at)');
    }
    if (!(await m.constraintExists('orders', 'fk_orders_user'))) {
      await m.execute(
        'ALTER TABLE orders ADD CONSTRAINT fk_orders_user FOREIGN KEY (user_id) ' +
          'REFERENCES users (id) ON DELETE SET NULL'
      );
    }
  },
};
