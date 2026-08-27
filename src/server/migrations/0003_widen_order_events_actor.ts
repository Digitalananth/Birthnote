import type { Migration } from './types';

/**
 * Phase 2: `order_events.actor` was VARCHAR(40), which an admin's email
 * address can overflow now that the actor is a real person rather than the
 * literal string 'admin'.
 */
export const migration: Migration = {
  version: '0003',
  name: 'widen_order_events_actor',
  async up(m) {
    const [row] = await m.query(
      `SELECT CHARACTER_MAXIMUM_LENGTH AS len FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'order_events' AND COLUMN_NAME = 'actor'`,
      [m.database]
    );
    if (row && Number(row.len) >= 190) return;
    await m.execute(
      "ALTER TABLE order_events MODIFY COLUMN actor VARCHAR(190) NOT NULL DEFAULT 'system'"
    );
  },
};
