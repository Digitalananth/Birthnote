import type { Migration } from './types';

/**
 * Courier tracking that can be checked, and caught up.
 *
 * `courier_webhook_deliveries` is one row per call to /api/webhooks/courier,
 * whatever became of it — accepted, refused for a bad token, or matched to no
 * order. Until this, a webhook that was rejected or found nothing left no
 * trace at all, so "is Shiprocket calling us?" had no answer short of asking
 * Shiprocket. The row holds what was decided and why, never the payload: the
 * scans that matter are already on the order's timeline, and a refused call's
 * body is untrusted text nobody needs to keep.
 *
 * The three order columns come from Shiprocket's tracking API, which is now
 * read directly as well as listened to: the courier's own tracking page, their
 * estimated delivery date, and when we last asked — the last so the customer
 * page can refresh a stale order without calling Shiprocket on every view.
 */

const COLUMNS: [column: string, definition: string][] = [
  ['track_url', 'VARCHAR(500) NULL AFTER shipment_status'],
  ['courier_etd', 'VARCHAR(60) NULL AFTER track_url'],
  ['tracking_synced_at', 'DATETIME NULL AFTER courier_etd'],
];

export const migration: Migration = {
  version: '0021',
  name: 'courier_tracking',
  async up(m) {
    for (const [column, definition] of COLUMNS) {
      if (!(await m.columnExists('orders', column))) {
        await m.execute(`ALTER TABLE orders ADD COLUMN ${column} ${definition}`);
      }
    }

    await m.execute(`
      CREATE TABLE IF NOT EXISTS courier_webhook_deliveries (
        id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        received_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
        -- accepted | unmatched | no_awb | unauthorised | invalid | failed
        outcome        VARCHAR(20)     NOT NULL,
        awb            VARCHAR(64)         NULL,
        order_id       INT UNSIGNED        NULL,
        -- Shiprocket's current_status, verbatim.
        courier_status VARCHAR(60)         NULL,
        scan_count     INT UNSIGNED    NOT NULL DEFAULT 0,
        detail         VARCHAR(500)        NULL,
        PRIMARY KEY (id),
        KEY idx_cwd_order (order_id, received_at),
        KEY idx_cwd_received (received_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  },
};
