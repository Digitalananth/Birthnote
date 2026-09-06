import type { Migration } from './types';

/**
 * Shiprocket: shipments pushed, AWBs assigned, deliveries heard about.
 *
 * Everything here is additive. `tracking_number` keeps its meaning and becomes
 * the AWB — the shipped email, the WhatsApp template and the admin's
 * "awaiting dispatch" query all read it already, and giving the courier's own
 * number a second home would only let the two disagree.
 *
 * `shipment_status` holds Shiprocket's raw wording rather than something
 * mapped. Their vocabulary is long, inconsistent between couriers, and grows;
 * storing the string they sent means a status nobody has seen before is
 * recorded rather than discarded, and can be read later by whoever has to
 * work out what happened.
 *
 * `delivered` joins the status ENUM because the journey now has an end. Until
 * this, the tracking page stopped at "Dispatched" and never said the parcel
 * arrived — which is also the moment the seven-day return window in /terms
 * starts, and the customer was never told it had.
 */

const COLUMNS: [column: string, definition: string][] = [
  // Shiprocket's two ids. The order id is theirs for the order as a whole;
  // the shipment id is what every subsequent call takes.
  ['shiprocket_order_id', 'VARCHAR(64) NULL AFTER tracking_number'],
  ['shiprocket_shipment_id', 'VARCHAR(64) NULL AFTER shiprocket_order_id'],
  ['courier_name', 'VARCHAR(120) NULL AFTER shiprocket_shipment_id'],
  // Shiprocket hosts the PDF; we keep the link rather than the file.
  ['label_url', 'VARCHAR(500) NULL AFTER courier_name'],
  ['shipment_status', 'VARCHAR(60) NULL AFTER label_url'],
  ['delivered_at', 'DATETIME NULL AFTER shipment_status'],
];

export const migration: Migration = {
  version: '0018',
  name: 'shiprocket',
  async up(m) {
    /*
     * The ENUM is rebuilt from what is actually in the column, not from a
     * list written here.
     *
     * `refunded` was added by 0010 and `delivered` is being added now, but a
     * database that took the migrations in some other order — or had a member
     * added by hand — would lose whatever this file failed to mention. Reading
     * the current definition and appending to it cannot drop a member it does
     * not know about.
     */
    const [column] = await m.query(
      `SELECT COLUMN_TYPE AS type FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'status'`,
      [m.database]
    );
    const currentType = String((column as { type?: string } | undefined)?.type ?? '');
    if (currentType && !currentType.includes("'delivered'")) {
      // COLUMN_TYPE reads back as enum('a','b'); splice the new member in
      // before the closing bracket so the existing order is untouched.
      const widened = currentType.replace(/\)$/, ",'delivered')");
      await m.execute(`ALTER TABLE orders MODIFY status ${widened} NOT NULL DEFAULT 'pending'`);
    } else if (!currentType) {
      m.warn('orders.status is not an ENUM; delivered was not added to it.');
    }

    for (const [column_, definition] of COLUMNS) {
      if (!(await m.columnExists('orders', column_))) {
        await m.execute(`ALTER TABLE orders ADD COLUMN ${column_} ${definition}`);
      }
    }

    // The tracking webhook arrives knowing the AWB and nothing else, so that
    // is the lookup that has to be fast.
    if (!(await m.indexExists('orders', 'idx_orders_awb'))) {
      await m.execute('ALTER TABLE orders ADD KEY idx_orders_awb (tracking_number)');
    }

    /*
     * Which PIN codes a courier will collect from and deliver to.
     *
     * Cached because the answer changes on the scale of months and the form
     * asks on every keystroke that completes a PIN code. Without this the
     * public endpoint is a free proxy onto Shiprocket's rate limit, spendable
     * by anyone who wants to enumerate six-digit numbers.
     */
    await m.execute(`
      CREATE TABLE IF NOT EXISTS pincode_serviceability (
        pincode     CHAR(6)      NOT NULL,
        serviceable TINYINT(1)   NOT NULL,
        -- Best estimated delivery date any courier offered, as they worded it.
        etd         VARCHAR(60)      NULL,
        courier     VARCHAR(120)     NULL,
        checked_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (pincode),
        KEY idx_pincode_checked (checked_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    /*
     * Shiprocket has no API keys: you post the dashboard password and get a
     * bearer token good for about ten days, and repeated logins are throttled
     * hard. So the token has to be shared between workers, and app_settings is
     * where shared configuration already lives.
     *
     * It is a credential in a plaintext column, which is worth being honest
     * about. What it is not is the password — that stays in the environment,
     * and the worst a leaked token buys is ten days of access that rotating
     * the password ends immediately.
     */
    const SETTINGS: [key: string, value: string][] = [
      // The *nickname* of a pickup address registered in the Shiprocket
      // dashboard, not the address. Nothing works until this matches one.
      ['shiprocket_pickup_location', ''],
      // Where couriers collect from, so serviceability can be asked. Filled
      // in from the chosen pickup address rather than typed twice.
      ['shiprocket_pickup_pincode', ''],
      ['shiprocket_channel_id', ''],
      // A sleeved note in a gift box. create/adhoc refuses an order without
      // both a weight and three dimensions.
      ['parcel_weight_kg', '0.1'],
      ['parcel_length_cm', '20'],
      ['parcel_breadth_cm', '15'],
      ['parcel_height_cm', '2'],
      // Written by the client, not by a human. Blank until the first login.
      ['shiprocket_token', ''],
      ['shiprocket_token_expires_at', ''],
    ];
    for (const [key, value] of SETTINGS) {
      await m.execute('INSERT IGNORE INTO app_settings (setting_key, value) VALUES (?, ?)', [
        key,
        value,
      ]);
    }
  },
};
