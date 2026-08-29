import type { Migration } from './types';

/**
 * Phase 7: the hold becomes real, and a refund becomes representable.
 *
 * The confirmation email has always promised the note is "held for you for 7
 * days". Nothing in the schema or the code knew that: an order went confirmed,
 * sent one email, and sat there for ever. These columns are what the sweep
 * reads to chase, and then to stop pretending.
 *
 *   held_until          when the promise runs out. Set on confirmation.
 *   hold_reminder_count how many reminders have gone. The sweep updates it
 *                       conditionally, so two workers cannot both send the
 *                       same one.
 *   hold_lapsed_at      when the hold ran out unpaid. The order is NOT
 *                       cancelled — a human decides that — but this is what
 *                       puts it on the admin's "holds lapsed" list.
 *
 * `refunded` joins the status ENUM because /returns promises refunds and there
 * was no way to record one. It is deliberately terminal and set by the Stripe
 * webhook, never by the sweep.
 */
export const migration: Migration = {
  version: '0010',
  name: 'holds_and_refunds',
  async up(m) {
    if (!(await m.columnExists('orders', 'held_until'))) {
      await m.execute('ALTER TABLE orders ADD COLUMN held_until DATETIME NULL AFTER paid_at');
    }
    if (!(await m.columnExists('orders', 'hold_reminder_count'))) {
      await m.execute(
        `ALTER TABLE orders
           ADD COLUMN hold_reminder_count TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER held_until`
      );
    }
    if (!(await m.columnExists('orders', 'hold_lapsed_at'))) {
      await m.execute(
        'ALTER TABLE orders ADD COLUMN hold_lapsed_at DATETIME NULL AFTER hold_reminder_count'
      );
    }

    // The sweep asks "which confirmed orders are due something?" every run.
    if (!(await m.indexExists('orders', 'idx_orders_held_until'))) {
      await m.execute('ALTER TABLE orders ADD INDEX idx_orders_held_until (status, held_until)');
    }

    // MODIFY rewrites the column definition wholesale, so the existing values
    // are listed again unchanged and only `refunded` is new.
    await m.execute(
      `ALTER TABLE orders MODIFY COLUMN status
         ENUM('pending','checking','confirmed','unavailable','paid','shipped','refunded')
         NOT NULL DEFAULT 'pending'`
    );

    // Orders already confirmed when this ships have no hold recorded. Giving
    // them the full window from now is the only fair reading: they were never
    // told a deadline that had already passed.
    const updated = await m.execute(
      `UPDATE orders SET held_until = UTC_TIMESTAMP() + INTERVAL 7 DAY
        WHERE status = 'confirmed' AND held_until IS NULL`
    );
    if (updated.affectedRows) {
      m.warn(`gave ${updated.affectedRows} already-confirmed order(s) a fresh 7-day hold`);
    }
  },
};
