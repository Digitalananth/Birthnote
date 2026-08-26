import 'server-only';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { query } from '@/lib/db';

/**
 * Customer accounts.
 *
 * An account is a mobile number. There is no password here and no
 * `password_hash` column behind it: people sign in with a one-time code
 * (`src/lib/otp.ts`), so the only credential that ever exists is the session
 * token in `src/lib/session.ts`. The scrypt helpers that used to live in this
 * file moved to `src/lib/password.ts`, which now serves admin accounts alone.
 */
export interface User {
  id: number;
  name: string;
  /** Optional: accounts are identified by `phone`, not by an address. */
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  phoneVerified: boolean;
  emailVerified: boolean;
  createdAt: string;
}

interface UserRow extends RowDataPacket {
  id: number;
  name: string;
  email: string | null;
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

const SELECT_USER = 'SELECT * FROM users';

export async function getUserByEmail(email: string): Promise<User | null> {
  const rows = await query<UserRow[]>(`${SELECT_USER} WHERE email = ? LIMIT 1`, [email]);
  return rows.length ? mapUser(rows[0]) : null;
}

/**
 * Lookup by the account identifier.
 *
 * `phone` must already be in canonical form — `normalisePhoneNumber` — because
 * this is an exact match. Passing what the customer typed would miss their row
 * and silently create a duplicate account on the next sign-in.
 */
export async function getUserByPhone(phone: string): Promise<User | null> {
  const rows = await query<UserRow[]>(`${SELECT_USER} WHERE phone = ? LIMIT 1`, [phone]);
  return rows.length ? mapUser(rows[0]) : null;
}

export async function getUserById(id: number): Promise<User | null> {
  const rows = await query<UserRow[]>(`${SELECT_USER} WHERE id = ? LIMIT 1`, [id]);
  return rows.length ? mapUser(rows[0]) : null;
}

export interface NewUserInput {
  /**
   * Canonical form — see `normalisePhoneNumber`. Null for an account opened
   * with an email address, which has no number until its owner adds one.
   */
  phone?: string | null;
  name?: string;
  email?: string | null;
  /** True when the number was proved by a one-time code. */
  phoneVerified?: boolean;
  /** True when the address was proved by a one-time code. */
  emailVerified?: boolean;
}

export class EmailTakenError extends Error {
  constructor() {
    super('That email address already has an account.');
    this.name = 'EmailTakenError';
  }
}

export class PhoneTakenError extends Error {
  constructor() {
    super('That mobile number already has an account.');
    this.name = 'PhoneTakenError';
  }
}

/**
 * Turns a duplicate-key error into the specific one the caller can explain.
 *
 * MySQL names the key it collided on in the message, which is the only way to
 * tell "this number is taken" from "this address is taken" — and telling
 * someone the wrong one sends them off correcting a field that was fine.
 */
function duplicateError(error: unknown): Error {
  const message = (error as { message?: string }).message ?? '';
  return message.includes('uq_users_phone') ? new PhoneTakenError() : new EmailTakenError();
}

export async function createUser(input: NewUserInput): Promise<User> {
  try {
    const result = await query<ResultSetHeader>(
      `INSERT INTO users (name, email, phone, phone_verified, email_verified)
       VALUES (?, ?, ?, ?, ?)`,
      [
        input.name?.trim() || '',
        input.email || null,
        input.phone || null,
        input.phoneVerified ? 1 : 0,
        input.emailVerified ? 1 : 0,
      ]
    );
    const user = await getUserById(result.insertId);
    if (!user) throw new Error('User vanished immediately after insert.');
    return user;
  } catch (error) {
    // The unique keys are the real guard: two simultaneous signups with the
    // same number both pass a pre-check, and only this catches the second.
    if ((error as { code?: string }).code === 'ER_DUP_ENTRY') throw duplicateError(error);
    throw error;
  }
}

/**
 * Records that a number has been proved by a one-time code.
 *
 * Also fills in the name and address if the account has none — someone whose
 * first contact was a guest order has a row with no name, and the first time
 * they sign in is the first chance to ask. Existing values are never
 * overwritten here: changing them is what the profile page is for.
 */
export async function markPhoneVerified(
  userId: number,
  extras: { name?: string; email?: string | null } = {}
): Promise<User | null> {
  await query(
    `UPDATE users
        SET phone_verified = 1,
            name = IF(name = '' AND ? <> '', ?, name),
            email = COALESCE(email, ?)
      WHERE id = ?`,
    [extras.name?.trim() || '', extras.name?.trim() || '', extras.email || null, userId]
  );
  return getUserById(userId);
}

/**
 * The same, for someone who proved an address instead of a number.
 *
 * `phone` is filled in only when the account has none, exactly as `email` is
 * above: a number already on file is what that person signs in with, and a
 * form post is not allowed to move it — see `updateProfile`.
 */
export async function markEmailVerified(
  userId: number,
  extras: { name?: string; phone?: string | null } = {}
): Promise<User | null> {
  try {
    await query(
      `UPDATE users
          SET email_verified = 1,
              name = IF(name = '' AND ? <> '', ?, name),
              phone = COALESCE(phone, ?)
        WHERE id = ?`,
      [extras.name?.trim() || '', extras.name?.trim() || '', extras.phone || null, userId]
    );
  } catch (error) {
    if ((error as { code?: string }).code === 'ER_DUP_ENTRY') throw new PhoneTakenError();
    throw error;
  }
  return getUserById(userId);
}

/**
 * Finds the account a sign-in code was sent to.
 *
 * Which column is matched follows the channel and nothing else. Searching both
 * would mean a code proving one identifier could open the account holding the
 * other, which is the whole reason `auth_otps` keys on the channel too.
 */
export async function getUserByIdentifier(
  identifier: string,
  channel: 'sms' | 'email'
): Promise<User | null> {
  return channel === 'email' ? getUserByEmail(identifier) : getUserByPhone(identifier);
}

/**
 * Saves the editable part of an account.
 *
 * `phone` is not among them and must not be: it is what the account is signed
 * in with, so moving it needs a code sent to the new number, not a form post.
 */
export async function updateProfile(
  userId: number,
  values: { name: string; whatsapp: string | null }
): Promise<User | null> {
  await query('UPDATE users SET name = ?, whatsapp = ? WHERE id = ?', [
    values.name,
    values.whatsapp,
    userId,
  ]);
  return getUserById(userId);
}

/** Passing null removes the address — it is optional, not a credential. */
export async function changeEmail(userId: number, email: string | null): Promise<User | null> {
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
 * Someone who ordered without signing up, then signs in later with the same
 * number or address, would otherwise see an empty My Orders page. Run on every
 * sign-in, not only the first: the later ones cover orders placed as a guest
 * after the account was opened.
 *
 * Only identifiers the account has *proved* with a one-time code are matched,
 * which is why this takes the whole `User` rather than loose strings. A guest
 * order is claimed on nothing but the contact details it carries, and those
 * details belong to a person who may well have no account at all — so an
 * unproved address typed into the profile form, or a second contact detail
 * offered at signup, would otherwise hand that person's order history to
 * whoever typed it. The `user_id IS NULL` guard below stops an order moving
 * between accounts, but the first claim is the one that matters: it is
 * irreversible, and it is the rightful owner who is locked out by it.
 */
export async function claimGuestOrders(user: User): Promise<number> {
  // `orders.whatsapp` is the only number an order carries, and it holds
  // whatever the customer typed — it was never normalised. Comparing only the
  // last ten digits is what makes "+91 98765 43210" on an order match the
  // canonical "919876543210" on the account.
  const conditions: string[] = [];
  const params: (string | number)[] = [user.id];
  if (user.emailVerified && user.email) {
    conditions.push('customer_email = ?');
    params.push(user.email);
  }
  if (user.phoneVerified && user.phone) {
    conditions.push(
      "RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(whatsapp, ''), ' ', ''), '-', ''), '(', ''), ')', ''), 10) = ?"
    );
    params.push(user.phone.slice(-10));
  }
  if (!conditions.length) return 0;

  const result = await query<ResultSetHeader>(
    `UPDATE orders SET user_id = ?
      WHERE user_id IS NULL AND (${conditions.join(' OR ')})`,
    params
  );
  return result.affectedRows ?? 0;
}
