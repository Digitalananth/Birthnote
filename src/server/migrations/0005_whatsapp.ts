import type { Migration } from './types';

/**
 * Phase 5: where to send WhatsApp updates, and whether the customer asked for
 * them. Opt-in is stored per order rather than per person because consent is
 * given at the point of ordering, including by guests.
 */
export const migration: Migration = {
  version: '0005',
  name: 'whatsapp',
  async up(m) {
    if (!(await m.columnExists('orders', 'whatsapp'))) {
      await m.execute('ALTER TABLE orders ADD COLUMN whatsapp VARCHAR(24) NULL AFTER customer_email');
    }
    if (!(await m.columnExists('orders', 'whatsapp_opt_in'))) {
      await m.execute(
        'ALTER TABLE orders ADD COLUMN whatsapp_opt_in TINYINT(1) NOT NULL DEFAULT 0 AFTER whatsapp'
      );
    }
  },
};
