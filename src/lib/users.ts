import 'server-only';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { query } from '@/lib/db';

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number
) => Promise<Buffer>;

/**
 * scrypt rather than bcrypt: bcrypt needs a native build that shared hosting
 * often cannot compile, while scrypt ships inside Node itself. N=16384 keeps a
 * single hash around 100ms on the small CPU this runs on — slow enough to make
 * offline cracking expensive, fast enough that a login is not noticeably slow.
 */
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export interface User {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  whatsapp: string | null;
  phoneVerified: boolean;
  emailVerified: boolean;
  createdAt: string;
}

interface UserRow extends RowDataPacket {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  phone: string | null;
  whatsapp: string | null;
  phone_verified: number;
  email_verified: number;
  created_at: Date;
}

function mapUser(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    whatsapp: row.whatsapp,
    phoneVerified: Boolean(row.phone_verified),
    emailVerified: Boolean(row.email_verified),
    createdAt: row.created_at.toISOString(),
  };
}

/** Stored as `scrypt$<salt-hex>$<key-hex>` so the format can evolve later. */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(plain, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, keyHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, 'hex');
  const derived = await scrypt(plain, Buffer.from(saltHex, 'hex'), expected.length);
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/**
 * Burns roughly one password hash worth of CPU without checking anything.
 *
 * The login route calls this when the email is unknown, so a missing account
 * and a wrong password take the same time — otherwise the response latency
 * alone tells an attacker which addresses are registered.
 */
export async function fakePasswordCheck(): Promise<void> {
  await scrypt('not-a-real-password', randomBytes(SALT_LENGTH), KEY_LENGTH);
}

const SELECT_USER = 'SELECT * FROM users';

export async function getUserByEmail(email: string): Promise<User | null> {
  const rows = await query<UserRow[]>(`${SELECT_USER} WHERE email = ? LIMIT 1`, [email]);
  return rows.length ? mapUser(rows[0]) : null;
}

export async function getUserById(id: number): Promise<User | null> {
  const rows = await query<UserRow[]>(`${SELECT_USER} WHERE id = ? LIMIT 1`, [id]);
  return rows.length ? mapUser(rows[0]) : null;
}

/** The hash is fetched on its own so it never rides along on a `User`. */
export async function getPasswordHash(userId: number): Promise<string | null> {
  const rows = await query<(RowDataPacket & { password_hash: string })[]>(
    'SELECT password_hash FROM users WHERE id = ? LIMIT 1',
    [userId]
  );
  return rows[0]?.password_hash ?? null;
}

export interface NewUserInput {
  name: string;
  email: string;
  password: string;
  phone?: string | null;
}

export class EmailTakenError extends Error {
  constructor() {
    super('That email address already has an account.');
    this.name = 'EmailTakenError';
  }
}

export async function createUser(input: NewUserInput): Promise<User> {
  const passwordHash = await hashPassword(input.password);
  try {
    const result = await query<ResultSetHeader>(
      `INSERT INTO users (name, email, password_hash, phone) VALUES (?, ?, ?, ?)`,
      [input.name, input.email, passwordHash, input.phone || null]
    );
    const user = await getUserById(result.insertId);
    if (!user) throw new Error('User vanished immediately after insert.');
    return user;
  } catch (error) {
    // The unique key is the real guard: two simultaneous signups with the same
    // address both pass a pre-check, and only this catches the second one.
    if ((error as { code?: string }).code === 'ER_DUP_ENTRY') throw new EmailTakenError();
    throw error;
  }
}

export async function updateProfile(
  userId: number,
  values: { name: string; phone: string | null; whatsapp: string | null }
): Promise<User | null> {
  await query('UPDATE users SET name = ?, phone = ?, whatsapp = ? WHERE id = ?', [
    values.name,
    values.phone,
    values.whatsapp,
    userId,
  ]);
  return getUserById(userId);
}

export async function setPassword(userId: number, plain: string): Promise<void> {
  const passwordHash = await hashPassword(plain);
  await query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, userId]);
}

export async function changeEmail(userId: number, email: string): Promise<User | null> {
  try {
    await query('UPDATE users SET email = ?, email_verified = 0 WHERE id = ?', [email, userId]);
  } catch (error) {
    if ((error as { code?: string }).code === 'ER_DUP_ENTRY') throw new EmailTakenError();
    throw error;
  }
  return getUserById(userId);
}

/**
 * Attaches past guest orders to an account.
 *
 * Someone who ordered without signing up, then signs up later with the same
 * address, would otherwise see an empty My Orders page. Run on both signup and
 * login: the second covers orders placed as a guest *after* registering.
 *
 * Only rows with no owner are touched, so this can never move an order from
 * one account to another.
 */
export async function claimGuestOrders(userId: number, email: string): Promise<number> {
  const result = await query<ResultSetHeader>(
    'UPDATE orders SET user_id = ? WHERE customer_email = ? AND user_id IS NULL',
    [userId, email]
  );
  return result.affectedRows ?? 0;
}
