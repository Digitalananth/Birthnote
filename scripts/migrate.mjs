#!/usr/bin/env node
/**
 * Creates the BirthNote tables. Idempotent — run it after every deploy.
 *
 *   npm run db:migrate
 *
 * Reads MYSQL_* from .env. On Hostinger you can also paste scripts/schema.sql
 * straight into phpMyAdmin if the Node process cannot reach the DB.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import mysql from 'mysql2/promise';

const scrypt = promisify(scryptCallback);

const here = dirname(fileURLToPath(import.meta.url));

// Minimal .env loader so the script works without extra dependencies.
try {
  const envFile = readFileSync(join(here, '..', '.env'), 'utf8');
  for (const line of envFile.split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, '');
  }
} catch {
  // No .env file — rely on the real environment (e.g. CI or hPanel vars).
}

const required = ['MYSQL_DATABASE', 'MYSQL_USER'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`✗ Missing environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const sql = readFileSync(join(here, 'schema.sql'), 'utf8');

const connection = await mysql.createConnection({
  host: process.env.MYSQL_HOST || 'localhost',
  port: Number(process.env.MYSQL_PORT || 3306),
  database: process.env.MYSQL_DATABASE,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD || '',
  multipleStatements: true,
});

/**
 * Columns added after the first release. MySQL has no
 * `ADD COLUMN IF NOT EXISTS`, so each one is checked against
 * information_schema first — which is what keeps `db:migrate` safe to run
 * after every deploy, as the README promises.
 */
const alterations = [
  {
    table: 'orders',
    column: 'user_id',
    ddl: 'ADD COLUMN user_id BIGINT UNSIGNED NULL AFTER reference',
  },
  // These two were added to `orders` in Phase 1 and moved to `order_items` in
  // Phase 3. They are still added on a database that predates the move, purely
  // so the backfill below has somewhere to read them from — `requiresColumn`
  // stops them being re-added, pointlessly and then fatally, on a database
  // where the move has already happened.
  {
    table: 'orders',
    column: 'requested_denomination',
    requiresColumn: 'display_date',
    ddl: 'ADD COLUMN requested_denomination SMALLINT UNSIGNED NULL AFTER message',
  },
  // Phase 5: where to send WhatsApp updates, and whether the customer asked
  // for them. Opt-in is stored per order rather than per person because
  // consent is given at the point of ordering, including by guests.
  {
    table: 'orders',
    column: 'whatsapp',
    ddl: 'ADD COLUMN whatsapp VARCHAR(24) NULL AFTER customer_email',
  },
  {
    table: 'orders',
    column: 'whatsapp_opt_in',
    ddl: 'ADD COLUMN whatsapp_opt_in TINYINT(1) NOT NULL DEFAULT 0 AFTER whatsapp',
  },
  {
    table: 'orders',
    column: 'gift_relationship',
    requiresColumn: 'display_date',
    ddl: 'ADD COLUMN gift_relationship VARCHAR(40) NULL AFTER gift_for',
  },
];

/**
 * Columns whose type changed. Guarded on the current definition so a deploy
 * does not rebuild the table every time.
 */
const widenings = [
  {
    table: 'order_events',
    column: 'actor',
    // Was VARCHAR(40), which an admin's email address can overflow now that
    // the actor is a real person rather than the literal string 'admin'.
    minLength: 190,
    ddl: 'MODIFY COLUMN actor VARCHAR(190) NOT NULL DEFAULT \'system\'',
  },
];

const indexes = [
  {
    table: 'orders',
    name: 'idx_orders_user',
    ddl: 'ADD KEY idx_orders_user (user_id, created_at)',
  },
];

// Deliberately SET NULL, not CASCADE: deleting an account must never delete
// the financial record of an order that was paid for.
const foreignKeys = [
  {
    table: 'orders',
    name: 'fk_orders_user',
    ddl: 'ADD CONSTRAINT fk_orders_user FOREIGN KEY (user_id) '
      + 'REFERENCES users (id) ON DELETE SET NULL',
  },
];

/**
 * Moves the per-note columns off `orders` and into `order_items`.
 *
 * Before bulk orders, an order *was* a note, so the date, denomination and
 * recipient lived on the order row. Each of those orders becomes an order with
 * exactly one item, and the columns are then dropped so there is a single
 * place the data lives — two copies of the same field is how they drift.
 *
 * Safe to re-run: it copies only orders that have no items yet, and it refuses
 * to drop anything until every order has at least one.
 */
async function backfillOrderItems() {
  const [columns] = await connection.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'orders'`,
    [process.env.MYSQL_DATABASE]
  );
  const has = (name) => columns.some((row) => row.COLUMN_NAME === name);

  // Already migrated on a previous run.
  if (!has('display_date')) return;

  const [result] = await connection.query(
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
  if (result.affectedRows) {
    console.log(`  Moved ${result.affectedRows} order(s) into order_items`);
  }

  // The guard: never drop a column while any order would lose its only copy.
  const [[{ orphans }]] = await connection.query(
    `SELECT COUNT(*) AS orphans FROM orders o
      WHERE NOT EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id)`
  );
  if (Number(orphans) > 0) {
    console.warn(
      `  ! ${orphans} order(s) still have no items — leaving the old columns in place.`
    );
    return;
  }

  const moved = [
    'note_date',
    'display_date',
    'requested_denomination',
    'gift_relationship',
    'gift_for',
    'note_denomination',
    'note_condition',
    'note_serial',
    'note_country',
  ].filter(has);

  if (moved.length) {
    await connection.query(
      `ALTER TABLE orders ${moved.map((c) => `DROP COLUMN ${c}`).join(', ')}`
    );
    console.log(`  Dropped from orders: ${moved.join(', ')}`);
  }
}

/**
 * Hashes a password in the same `scrypt$salt$key` format as src/lib/users.ts.
 *
 * Duplicated here rather than imported because this script is plain Node and
 * the app is TypeScript — keep the two in step if the format ever changes.
 */
async function hashPassword(plain) {
  const salt = randomBytes(16);
  const derived = await scrypt(plain, salt, 64);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

/**
 * Creates the first owner account from ADMIN_EMAIL / ADMIN_PASSWORD.
 *
 * Phase 2 replaced the shared ADMIN_PASSWORD with real accounts. Without this
 * step, deploying that change would lock the shop owner out of their own admin
 * panel — there would be no account to sign in as, and no signed-in admin to
 * create one. Runs only when admin_users is empty, so it never resurrects a
 * deliberately deleted account or resets a changed password.
 */
async function seedFirstAdmin() {
  const [[{ total }]] = await connection.query('SELECT COUNT(*) AS total FROM admin_users');
  if (Number(total) > 0) return;

  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!email || !password) {
    console.warn(
      '  ! No admin accounts exist yet. Set ADMIN_EMAIL and ADMIN_PASSWORD in .env\n' +
        '    and re-run this script to create the first owner account.'
    );
    return;
  }

  await connection.query(
    `INSERT INTO admin_users (name, email, password_hash, role, is_active)
     VALUES (?, ?, ?, 'owner', 1)`,
    [process.env.ADMIN_NAME || 'Owner', email, await hashPassword(password)]
  );
  console.log(`  Created the first owner account: ${email}`);
}

async function exists(query, params) {
  const [rows] = await connection.query(query, params);
  return Number(Object.values(rows[0])[0]) > 0;
}

const columnExists = (table, column) =>
  exists(
    `SELECT COUNT(*) FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [process.env.MYSQL_DATABASE, table, column]
  );

const indexExists = (table, name) =>
  exists(
    `SELECT COUNT(*) FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [process.env.MYSQL_DATABASE, table, name]
  );

const constraintExists = (table, name) =>
  exists(
    `SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?`,
    [process.env.MYSQL_DATABASE, table, name]
  );

try {
  await connection.query(sql);

  const applied = [];
  for (const { table, column, ddl, requiresColumn } of alterations) {
    if (await columnExists(table, column)) continue;
    if (requiresColumn && !(await columnExists(table, requiresColumn))) continue;
    await connection.query(`ALTER TABLE ${table} ${ddl}`);
    applied.push(`${table}.${column}`);
  }
  for (const { table, column, minLength, ddl } of widenings) {
    const [rows] = await connection.query(
      `SELECT CHARACTER_MAXIMUM_LENGTH AS len FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [process.env.MYSQL_DATABASE, table, column]
    );
    if (!rows.length || Number(rows[0].len) >= minLength) continue;
    await connection.query(`ALTER TABLE ${table} ${ddl}`);
    applied.push(`${table}.${column} widened`);
  }
  for (const { table, name, ddl } of indexes) {
    if (await indexExists(table, name)) continue;
    await connection.query(`ALTER TABLE ${table} ${ddl}`);
    applied.push(name);
  }
  for (const { table, name, ddl } of foreignKeys) {
    if (await constraintExists(table, name)) continue;
    await connection.query(`ALTER TABLE ${table} ${ddl}`);
    applied.push(name);
  }

  await backfillOrderItems();
  await seedFirstAdmin();

  const [tables] = await connection.query('SHOW TABLES');
  console.log(`\u2713 Schema applied to ${process.env.MYSQL_DATABASE}`);
  console.log(`  Tables: ${tables.map((row) => Object.values(row)[0]).join(', ')}`);
  console.log(
    applied.length ? `  Added: ${applied.join(', ')}` : '  No new columns needed.'
  );
} catch (error) {
  console.error('\u2717 Migration failed:', error.message);
  process.exitCode = 1;
} finally {
  await connection.end();
}
