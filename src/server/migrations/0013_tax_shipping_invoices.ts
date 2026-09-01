import type { Migration } from './types';

/**
 * GST, delivery charges, and the tax invoice.
 *
 * Three things arrive together because they are one thing: a priced order is
 * now a taxable supply, and a taxable supply has to be able to produce an
 * invoice that a chartered accountant would accept.
 *
 * **`app_settings`** — a key/value store for the handful of numbers that decide
 * what an order costs and whose name is on the invoice. Key/value rather than a
 * column per setting because these are settings, not data: the alternative is a
 * migration every time the owner wants to change a rate, which is exactly the
 * thing they asked to be able to do themselves. It is deliberately not
 * `master_options` — that table is a list of choices offered on a form; this is
 * one value each.
 *
 * **Money on `orders`** — the breakup is stored, not recomputed on read. A tax
 * invoice must say what was actually charged, and rates change: an order paid
 * at 5% must still show 5% after the rate becomes 12%, so the numbers are
 * frozen onto the row when the order is priced and again when it is paid.
 * `price_paise` keeps its meaning — the notes before tax — and `total_paise` is
 * the new number Stripe charges.
 *
 * **Delivery address on `orders`** — collected on our own payment page rather
 * than at Stripe, because the state decides CGST/SGST versus IGST and we need
 * it before the customer pays, not after. `ship_state_code` is the GST state
 * code, kept beside the name so the tax treatment does not depend on spelling.
 *
 * **`invoices`** — one row per issued invoice, carrying a JSON snapshot of the
 * whole document. The snapshot is the point: an invoice is a legal record of a
 * moment, and re-rendering one from today's settings would silently rewrite
 * history the first time an address or a rate is edited.
 */

/** The defaults the owner asked for, editable from /admin/settings afterwards. */
const DEFAULT_SETTINGS: [key: string, value: string][] = [
  ['gst_goods_rate', '5'],
  ['gst_shipping_rate', '18'],
  ['shipping_flat_paise', '9900'],
  // 0 disables the threshold — the charge always applies until an owner sets one.
  ['shipping_free_above_paise', '0'],
  // Blank until the owner fills them in. An invoice will not issue without a
  // GSTIN and a state, which is better than issuing one that is not valid.
  ['seller_legal_name', ''],
  ['seller_trade_name', 'My Lucky Dates'],
  ['seller_gstin', ''],
  ['seller_state_code', ''],
  ['seller_address', ''],
  ['seller_email', ''],
  ['seller_phone', ''],
  // Collectors' pieces; the owner can correct it for their own classification.
  ['hsn_goods', '9705'],
  ['sac_shipping', '996812'],
  ['invoice_prefix', 'MLD'],
  ['invoice_terms', ''],
];

const ORDER_COLUMNS: [column: string, definition: string][] = [
  // Money, all in paise, all frozen at the time they were charged.
  ['shipping_paise', 'INT UNSIGNED NOT NULL DEFAULT 0 AFTER price_paise'],
  ['tax_paise', 'INT UNSIGNED NOT NULL DEFAULT 0 AFTER shipping_paise'],
  ['cgst_paise', 'INT UNSIGNED NOT NULL DEFAULT 0 AFTER tax_paise'],
  ['sgst_paise', 'INT UNSIGNED NOT NULL DEFAULT 0 AFTER cgst_paise'],
  ['igst_paise', 'INT UNSIGNED NOT NULL DEFAULT 0 AFTER sgst_paise'],
  ['total_paise', 'INT UNSIGNED NOT NULL DEFAULT 0 AFTER igst_paise'],
  // The rates this particular order was charged at, so an invoice reprinted
  // after a rate change still shows the rate that was applied.
  ['gst_goods_rate', 'DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER total_paise'],
  ['gst_shipping_rate', 'DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER gst_goods_rate'],
  // Where it is going. Null until the customer fills in the address step.
  ['ship_name', 'VARCHAR(160) NULL'],
  ['ship_line1', 'VARCHAR(200) NULL'],
  ['ship_line2', 'VARCHAR(200) NULL'],
  ['ship_city', 'VARCHAR(120) NULL'],
  ['ship_state_code', 'CHAR(2) NULL'],
  ['ship_pincode', 'VARCHAR(10) NULL'],
  ['ship_phone', 'VARCHAR(24) NULL'],
  // A business buyer claiming input credit needs their own GSTIN on the face
  // of the invoice. Optional — most customers are consumers.
  ['buyer_gstin', 'VARCHAR(15) NULL'],
];

export const migration: Migration = {
  version: '0013',
  name: 'tax_shipping_invoices',
  async up(m) {
    await m.execute(`
      CREATE TABLE IF NOT EXISTS app_settings (
        setting_key VARCHAR(64)  NOT NULL,
        value       TEXT             NULL,
        updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                          ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (setting_key)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // INSERT IGNORE: a re-run must not reset a rate the owner has changed.
    for (const [key, value] of DEFAULT_SETTINGS) {
      await m.execute('INSERT IGNORE INTO app_settings (setting_key, value) VALUES (?, ?)', [
        key,
        value,
      ]);
    }

    for (const [column, definition] of ORDER_COLUMNS) {
      if (!(await m.columnExists('orders', column))) {
        await m.execute(`ALTER TABLE orders ADD COLUMN ${column} ${definition}`);
      }
    }

    // Orders that predate tax were charged exactly their notes total, and that
    // is what they must keep saying. Backfilling `total_paise` from
    // `price_paise` states what actually happened; leaving it zero would claim
    // they were free.
    await m.execute('UPDATE orders SET total_paise = price_paise WHERE total_paise = 0');

    await m.execute(`
      CREATE TABLE IF NOT EXISTS invoices (
        id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        order_id       BIGINT UNSIGNED NOT NULL,
        -- The number on the face of the document, e.g. MLD/2026-27/0001.
        number         VARCHAR(40)     NOT NULL,
        -- The series this number was drawn from, and its position in it.
        financial_year VARCHAR(9)      NOT NULL,
        sequence       INT UNSIGNED    NOT NULL,
        issued_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
        place_of_supply CHAR(2)        NOT NULL,
        inter_state    TINYINT(1)      NOT NULL,
        total_paise    INT UNSIGNED    NOT NULL,
        tax_paise      INT UNSIGNED    NOT NULL,
        -- The whole document as it was issued: seller, buyer, lines, taxes.
        -- Re-rendering from live settings would rewrite issued invoices.
        snapshot       JSON            NOT NULL,
        created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        -- One invoice per order, and no number issued twice. Both are the
        -- database's job: a duplicate delivery of a Stripe webhook must not be
        -- able to produce a second invoice for the same sale.
        UNIQUE KEY uq_invoices_order (order_id),
        UNIQUE KEY uq_invoices_number (number),
        UNIQUE KEY uq_invoices_series (financial_year, sequence),
        KEY idx_invoices_issued (issued_at),
        CONSTRAINT fk_invoices_order FOREIGN KEY (order_id)
          REFERENCES orders (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  },
};
