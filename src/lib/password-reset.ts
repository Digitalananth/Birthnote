import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';
import { query, transaction } from '@/lib/db';

/**
 * Single-use password reset tokens, for admin accounts.
 *
 * As with sessions, only the SHA-256 of the token is stored — the plaintext
 * exists solely inside the email that carries it.
 *
 * Customers have no reset flow because they have no password: they sign in
 * with a code sent to their mobile number, and a code that expires in ten
 * minutes is already the whole of "I cannot get in". The generic shape below
 * is left as-is rather than inlined, so a second audience could be added back
 * without rediscovering the concurrency handling in `consume`.
 */
const TTL_SECONDS = 60 * 60; // 1 hour

interface ResetTable {
  table: string;
  userColumn: string;
}

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

/**
 * Consumes a token, returning the account id it belonged to.
 *
 * The `FOR UPDATE` select is the guard: it matches only rows that are still
 * unused and unexpired, so two simultaneous submissions of the same link
 * cannot both come back with an id.
 */
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

export function createAdminResetToken(adminUserId: number): Promise<string> {
  return issue(ADMIN, adminUserId);
}

export function peekAdminResetToken(token: string): Promise<number | null> {
  return peek(ADMIN, token);
}

export function consumeAdminResetToken(token: string): Promise<number | null> {
  return consume(ADMIN, token);
}
