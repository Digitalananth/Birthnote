import 'server-only';
import { query } from '@/lib/db';
import { env } from '@/lib/env';

/**
 * The columns the application code actually reads and writes, per table.
 *
 * Compared against information_schema by /api/health. `0001_baseline` is
 * CREATE TABLE IF NOT EXISTS, so a table that already existed in some other
 * shape — pasted by hand from an older schema, or edited in phpMyAdmin — is
 * left exactly as it was, and the later migrations only add the columns they
 * know about. This is what turns the resulting "Unknown column" 500s into a
 * name you can act on. Nothing is reported on a healthy database.
 */
const expected: Record<string, string[]> = {
  users: [
    'id', 'name', 'email', 'phone', 'whatsapp', 'phone_verified', 'email_verified',
    'created_at', 'updated_at',
  ],
  user_sessions: ['id', 'user_id', 'token_hash', 'user_agent', 'created_at', 'expires_at'],
  auth_otps: [
    'id', 'identifier', 'channel', 'code_hash', 'purpose', 'attempts', 'consumed_at',
    'expires_at', 'created_at',
  ],
  orders: [
    'id', 'reference', 'user_id', 'customer_name', 'customer_email', 'whatsapp',
    'whatsapp_opt_in', 'message', 'status', 'price_paise', 'currency', 'admin_notes',
    'stripe_session_id', 'stripe_payment_id', 'paid_at', 'tracking_number',
    'created_at', 'updated_at',
  ],
  order_items: [
    'id', 'order_id', 'position', 'note_date', 'display_date', 'requested_denomination',
    'gift_relationship', 'gift_for', 'availability', 'price_paise', 'note_denomination',
    'note_condition', 'note_serial', 'note_country', 'created_at', 'updated_at',
  ],
  order_events: ['id', 'order_id', 'status', 'note', 'actor', 'created_at'],
  rate_limits: ['bucket', 'hits', 'window_start'],
  admin_users: [
    'id', 'name', 'email', 'password_hash', 'role', 'is_active', 'last_login_at',
    'created_at', 'updated_at',
  ],
  admin_sessions: ['id', 'admin_user_id', 'token_hash', 'user_agent', 'created_at', 'expires_at'],
  admin_password_resets: ['id', 'admin_user_id', 'token_hash', 'expires_at', 'used_at', 'created_at'],
  pages: ['id', 'slug', 'title', 'body_markdown', 'meta_title', 'meta_description', 'status'],
  blog_categories: ['id', 'slug', 'name', 'description', 'meta_title', 'meta_description'],
  blog_posts: [
    'id', 'slug', 'title', 'excerpt', 'body_markdown', 'category_id', 'cover_image_url',
    'meta_title', 'meta_description', 'status', 'published_at', 'author_name',
  ],
  master_options: ['id', 'list_key', 'value', 'position', 'is_active'],
  schema_migrations: ['version', 'name', 'applied_at'],
};

export interface SchemaDrift {
  missingTables: string[];
  /** table → columns the code needs and the table does not have. */
  missingColumns: Record<string, string[]>;
}

export async function checkSchema(): Promise<SchemaDrift> {
  const rows = await query<{ table_name: string; column_name: string }[]>(
    `SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ?`,
    [env.mysql.database()]
  );
  const present = new Map<string, Set<string>>();
  for (const { table_name, column_name } of rows) {
    if (!present.has(table_name)) present.set(table_name, new Set());
    present.get(table_name)!.add(column_name);
  }

  const drift: SchemaDrift = { missingTables: [], missingColumns: {} };
  for (const [table, columns] of Object.entries(expected)) {
    const have = present.get(table);
    if (!have) {
      drift.missingTables.push(table);
      continue;
    }
    const missing = columns.filter((c) => !have.has(c));
    if (missing.length) drift.missingColumns[table] = missing;
  }
  return drift;
}
