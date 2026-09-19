import type { Migration } from './types';

/**
 * Every PayU txnid an order was ever given, and every callback PayU made.
 *
 * `orders.gateway_order_id` holds one txnid, and each click on Pay replaced
 * it. A customer who opened the checkout twice and paid on the first attempt
 * was then paid under an id no row held: the return leg, the webhook, the
 * success page and the reconcile sweep all looked the order up by that column,
 * found nothing, and said nothing. `order_payment_attempts` keeps them all, so
 * a payment is matched whichever attempt it was made on. The column stays, as
 * "the latest attempt" until the order is paid and "the paid attempt" after.
 *
 * `payu_callbacks` is `courier_webhook_deliveries` for PayU, for the same
 * reason: a callback that was refused or matched nothing left no trace, so
 * "is PayU calling us?" had no answer short of asking PayU. One row per call
 * to the return leg or the webhook, holding what was decided and why, never
 * the payload.
 *
 * Attempts are backfilled from the one id each existing order still holds.
 * Ids already overwritten are gone; an admin can re-attach one from the PayU
 * dashboard through the order page's payment check.
 */
export const migration: Migration = {
  version: '0025',
  name: 'payment_attempts',
  async up(m) {
    await m.execute(`
      CREATE TABLE IF NOT EXISTS order_payment_attempts (
        id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        order_id    INT UNSIGNED    NOT NULL,
        txn_id      VARCHAR(255)    NOT NULL,
        created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_opa_txn (txn_id),
        KEY idx_opa_order (order_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await m.execute(`
      INSERT IGNORE INTO order_payment_attempts (order_id, txn_id, created_at)
      SELECT id, gateway_order_id, updated_at FROM orders
       WHERE gateway = 'payu' AND gateway_order_id IS NOT NULL
    `);

    await m.execute(`
      CREATE TABLE IF NOT EXISTS payu_callbacks (
        id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        received_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
        -- return | webhook
        source       VARCHAR(20)     NOT NULL,
        -- settled | already_paid | not_paid | amount_mismatch | unmatched |
        -- failure | refund | ignored | bad_hash | invalid | failed
        outcome      VARCHAR(20)     NOT NULL,
        txn_id       VARCHAR(255)        NULL,
        order_id     INT UNSIGNED        NULL,
        -- PayU's own status field, verbatim.
        payu_status  VARCHAR(40)         NULL,
        detail       VARCHAR(500)        NULL,
        PRIMARY KEY (id),
        KEY idx_pc_order (order_id, received_at),
        KEY idx_pc_txn (txn_id),
        KEY idx_pc_received (received_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  },
};
