import type { Migration } from './types';

/**
 * Phase 3: bulk orders. Moves the per-note columns off `orders` and into
 * `order_items`.
 *
 * Before bulk orders, an order *was* a note, so the date, denomination and
 * recipient lived on the order row. Each of those orders becomes an order with
 * exactly one item, and the columns are then dropped so there is a single
 * place the data lives — two copies of the same field is how they drift.
 *
 * On a fresh database the baseline still creates those columns on `orders`
 * (schema.sql is frozen as it was), so this runs there too and simply finds
 * nothing to copy before dropping them.
 *
 * It refuses to drop anything until every order has at least one item.
 */
const movedColumns = [
  'note_date',
  'display_date',
  'requested_denomination',
  'gift_relationship',
  'gift_for',
  'note_denomination',
  'note_condition',
  'note_serial',
  'note_country',
];

export const migration: Migration = {
  version: '0004',
  name: 'order_items',
  async up(m) {
    // Already moved by the old script.
    if (!(await m.columnExists('orders', 'display_date'))) return;

    // Two columns that Phase 1 added to `orders` and that the copy below reads.
    // A database that predates them needs them to exist (as NULL) for the
    // INSERT ... SELECT to be valid.
    if (!(await m.columnExists('orders', 'requested_denomination'))) {
      await m.execute(
        'ALTER TABLE orders ADD COLUMN requested_denomination SMALLINT UNSIGNED NULL AFTER message'
      );
    }
    if (!(await m.columnExists('orders', 'gift_relationship'))) {
      await m.execute('ALTER TABLE orders ADD COLUMN gift_relationship VARCHAR(40) NULL AFTER gift_for');
    }

    const result = await m.execute(
      `INSERT INTO order_items
         (order_id, position, note_date, display_date, requested_denomination,
          gift_relationship, gift_for, availability, price_paise,
          note_denomination, note_condition, note_serial, note_country, created_at)
       SELECT o.id, 1, o.note_date, o.display_date, o.requested_denomination,
              o.gift_relationship, o.gift_for,
              CASE
                WHEN o.status = 'unavailable' THEN 'unavailable'
                WHEN o.status IN ('confirmed','paid','shipped') THEN 'available'
                ELSE 'pending'
              END,
              CASE WHEN o.status IN ('confirmed','paid','shipped')
                   THEN o.price_paise ELSE NULL END,
              o.note_denomination, o.note_condition, o.note_serial, o.note_country,
              o.created_at
         FROM orders o
        WHERE NOT EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id)`
    );
    if (result.affectedRows) m.warn(`moved ${result.affectedRows} order(s) into order_items`);

    // The guard: never drop a column while any order would lose its only copy.
    const [{ orphans }] = await m.query(
      `SELECT COUNT(*) AS orphans FROM orders o
        WHERE NOT EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id)`
    );
    if (Number(orphans) > 0) {
      throw new Error(
        `${orphans} order(s) have no items, so the old columns on orders cannot be dropped`
      );
    }

    const present: string[] = [];
    for (const column of movedColumns) {
      if (await m.columnExists('orders', column)) present.push(column);
    }
    if (present.length) {
      await m.execute(`ALTER TABLE orders ${present.map((c) => `DROP COLUMN ${c}`).join(', ')}`);
    }
  },
};
