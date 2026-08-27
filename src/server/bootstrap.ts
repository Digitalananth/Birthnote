import 'server-only';
import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { env } from '@/lib/env';
import { query } from '@/lib/db';

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number
) => Promise<Buffer>;

/**
 * Creates the first owner account from ADMIN_EMAIL / ADMIN_PASSWORD.
 *
 * This is deliberately not a migration. A migration runs once and is then a
 * matter of record; this depends on environment variables that may not be
 * set on the first start and may be set on the third, so it is checked on
 * every start instead — and returns without touching anything the moment an
 * admin exists. It therefore never resurrects a deleted account and never
 * resets a changed password: changing ADMIN_PASSWORD later does nothing.
 *
 * Without it, a fresh deploy would leave nobody able to sign in and no
 * signed-in admin to create anyone.
 */
export async function seedFirstAdmin(): Promise<string | null> {
  const [{ total }] = await query<{ total: number }[]>('SELECT COUNT(*) AS total FROM admin_users');
  if (Number(total) > 0) return null;

  const email = env.admin.bootstrapEmail().trim().toLowerCase();
  const password = env.admin.bootstrapPassword();
  if (!email || !password) {
    return (
      'no admin accounts exist and ADMIN_EMAIL / ADMIN_PASSWORD are not set, so nobody ' +
      'can sign in to /admin. Set them in the environment and restart the app.'
    );
  }

  // The same `scrypt$salt$key` format src/lib/users.ts verifies against.
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64);
  const hash = `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;

  await query(
    `INSERT INTO admin_users (name, email, password_hash, role, is_active)
     VALUES (?, ?, ?, 'owner', 1)`,
    [process.env.ADMIN_NAME?.trim() || 'Owner', email, hash]
  );
  return `created the first owner account: ${email}`;
}
