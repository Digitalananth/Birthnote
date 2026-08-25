import 'server-only';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

/**
 * Password hashing — for admin accounts only.
 *
 * Customers no longer have passwords: they sign in with a code sent to their
 * mobile number (`src/lib/otp.ts`), so `users.password_hash` is gone. Admins
 * still do, because the people who run the shop sign in from a desk rather
 * than a phone and a password manager suits that better than an SMS per login.
 *
 * These functions used to live in `src/lib/users.ts`, which is why the stored
 * format is unchanged — moving them must not invalidate a single existing
 * admin password.
 *
 * scrypt rather than bcrypt: bcrypt needs a native build that shared hosting
 * often cannot compile, while scrypt ships inside Node itself. N=16384 keeps a
 * single hash around 100ms on the small CPU this runs on — slow enough to make
 * offline cracking expensive, fast enough that a login is not noticeably slow.
 */
const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/** Stored as `scrypt$<salt-hex>$<key-hex>` so the format can evolve later. */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(plain, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPassword(plain: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [scheme, saltHex, keyHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, 'hex');
  const derived = await scrypt(plain, Buffer.from(saltHex, 'hex'), expected.length);
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/**
 * Burns roughly one password hash worth of CPU without checking anything.
 *
 * The admin login route calls this when the address is unknown, so a missing
 * account and a wrong password take the same time — otherwise the response
 * latency alone tells an attacker which addresses can sign in.
 */
export async function fakePasswordCheck(): Promise<void> {
  await scrypt('not-a-real-password', randomBytes(SALT_LENGTH), KEY_LENGTH);
}
