import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';
import { query, transaction } from '@/lib/db';

/**
 * Single-use password reset tokens, for customers and admins alike.
 *
 * As with sessions, only the SHA-256 of the token is stored — the plaintext
 * exists solely inside the email that carries it.
 *
 * The two audiences keep separate tables so an admin reset can never land on
 * a customer account, but the logic is identical, so it is written once and
 * pointed at whichever table applies.
 */
const TTL_SECONDS = 60 * 60; // 1 hour

interface ResetTable {
  table: string;
  userColumn: string;
}

const CUSTOMER: ResetTable = { table: 'password_resets', userColumn: 'user_id' };
const ADMIN: ResetTable = { table: 'admin_password_resets', userColumn: 'admin_user_id' };

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Issues a token, invalidating any earlier unused ones.
 *
 * Without that, requesting a second link would leave the first still live, so
 * an old email in an inbox would stay a working key into the account.
 */
async function issue({ table, userColumn }: ResetTable, userId: number): Promise<string> {
  const token = randomBytes(32).toString('hex');
  await transaction(async (conn) => {
    await conn.execute(
      `UPDATE ${table} SET used_at = UTC_TIMESTAMP() WHERE ${userColumn} = ? AND used_at IS NULL`,
      [userId]
    );
    await conn.execute(
      `INSERT INTO ${table} (${userColumn}, token_hash, expires_at)
       VALUES (?, ?, UTC_TIMESTAMP() + INTERVAL ? SECOND)`,
      [userId, hashToken(token), TTL_SECONDS]
    );
  });
  return token;
}

async function peek({ table, userColumn }: ResetTable, token: string): Promise<number | null> {
  const rows = await query<(RowDataPacket & { owner: number })[]>(
    `SELECT ${userColumn} AS owner FROM ${table}
      WHERE token_hash = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP() LIMIT 1`,
    [hashToken(token)]
  );
  return rows.length ? rows[0].owner : null;
}

async function consume({ table, userColumn }: ResetTable, token: string): Promise<number | null> {
  return transaction(async (conn) => {
    const [rows] = await conn.execute<(RowDataPacket & { id: number; owner: number })[]>(
      `SELECT id, ${userColumn} AS owner FROM ${table}
        WHERE token_hash = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()
        LIMIT 1 FOR UPDATE`,
      [hashToken(token)]
    );
    if (!rows.length) return null;
    await conn.execute(`UPDATE ${table} SET used_at = UTC_TIMESTAMP() WHERE id = ?`, [rows[0].id]);
    return rows[0].owner;
  });
}

/*
 * The table names above are module constants, never anything a caller supplies,
 * so interpolating them into these statements introduces no injection path.
 * Every value is still bound as a parameter.
 */

export function createResetToken(userId: number): Promise<string> {
  return issue(CUSTOMER, userId);
}

export function createAdminResetToken(adminUserId: number): Promise<string> {
  return issue(ADMIN, adminUserId);
}

export function peekAdminResetToken(token: string): Promise<number | null> {
  return peek(ADMIN, token);
}

export function consumeAdminResetToken(token: string): Promise<number | null> {
  return consume(ADMIN, token);
}

/** The user id a live token belongs to, or null. Does not consume it. */
export function peekResetToken(token: string): Promise<number | null> {
  return peek(CUSTOMER, token);
}

/**
 * Consumes a token, returning the user id it belonged to.
 *
 * The UPDATE itself is the guard: it matches only rows that are still unused
 * and unexpired, so two simultaneous submissions of the same link cannot both
 * come back with a user id.
 */
export function consumeResetToken(token: string): Promise<number | null> {
  return consume(CUSTOMER, token);
}
