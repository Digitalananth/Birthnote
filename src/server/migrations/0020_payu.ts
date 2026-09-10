import type { Migration } from './types';

/**
 * PhonePe out, PayU in.
 *
 * The same shape as 0019, for the same reason: 0017 made the gateway columns
 * neutral, so a new processor needs no new columns — only the default moves, so
 * that a row created without the application naming a gateway is labelled the
 * one actually in use.
 *
 * No data is rewritten. A PhonePe order keeps its ids and its label, still
 * shows them on the admin page, and is still excluded from the reconcile sweep,
 * which filters to `gateway = 'payu'`. Asking PayU about a PhonePe order id
 * would be a "not found" every sweep until the row was archived.
 */

export const migration: Migration = {
  version: '0020',
  name: 'payu',
  async up(m) {
    if (!(await m.columnExists('orders', 'gateway'))) {
      m.warn('orders has no gateway column; 0017 did not complete.');
      return;
    }
    await m.execute("ALTER TABLE orders ALTER COLUMN gateway SET DEFAULT 'payu'");
  },
};
