import 'server-only';
import { cache } from 'react';
import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { query } from '@/lib/db';
import { getUserById, type User } from '@/lib/users';

/**
 * Database-backed customer sessions.
 *
 * The admin panel uses a signed stateless cookie (`src/lib/auth.ts`), which is
 * fine for one operator but cannot be revoked. Customers need "log out" to
 * actually end a session and a password reset to kill every other one, so each
 * session is a row that can be deleted.
 *
 * The cookie carries a random token; the table stores only its SHA-256. A
 * database leak therefore yields no usable sessions.
 */
const COOKIE_NAME = 'birthnote_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export const sessionCookie = {
  name: COOKIE_NAME,
  options: {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  },
};

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Creates the session row and returns the plaintext token for the cookie. */
export async function createSession(userId: number, userAgent?: string | null): Promise<string> {
  const token = randomBytes(32).toString('hex');
  await query(
    `INSERT INTO user_sessions (user_id, token_hash, user_agent, expires_at)
     VALUES (?, ?, ?, UTC_TIMESTAMP() + INTERVAL ? SECOND)`,
    [userId, hashToken(token), userAgent?.slice(0, 255) || null, MAX_AGE_SECONDS]
  );
  return token;
}

/**
 * The signed-in user, or null.
 *
 * Wrapped in React's `cache` so a layout, its page and any server component
 * beneath them share a single pair of queries per request.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  let token: string | undefined;
  try {
    token = (await cookies()).get(COOKIE_NAME)?.value;
  } catch {
    return null;
  }
  if (!token) return null;

  const rows = await query<(RowDataPacket & { user_id: number })[]>(
    `SELECT user_id FROM user_sessions
      WHERE token_hash = ? AND expires_at > UTC_TIMESTAMP() LIMIT 1`,
    [hashToken(token)]
  );
  if (!rows.length) return null;
  return getUserById(rows[0].user_id);
});

/**
 * Guard for every `/account/*` route.
 *
 * Sends anonymous visitors to the login page with a `next` parameter so they
 * land back where they were aiming.
 */
export async function requireUser(next?: string): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(next ? `/login?next=${encodeURIComponent(next)}` : '/login');
  }
  return user;
}

/** Deletes the current session row. Safe to call when not signed in. */
export async function destroySession(): Promise<void> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (token) {
    await query('DELETE FROM user_sessions WHERE token_hash = ?', [hashToken(token)]);
  }
}

/** Signs a user out everywhere — used after a password change or reset. */
export async function destroyAllSessions(userId: number): Promise<void> {
  await query('DELETE FROM user_sessions WHERE user_id = ?', [userId]);
}

/**
 * Clears out expired rows.
 *
 * Called after each login rather than from a cron job, because shared hosting
 * makes scheduled tasks awkward and logins are frequent enough to keep the
 * table small.
 */
export async function pruneExpiredSessions(): Promise<void> {
  try {
    await query<ResultSetHeader>('DELETE FROM user_sessions WHERE expires_at < UTC_TIMESTAMP()');
  } catch (error) {
    console.error('[session] prune failed', error);
  }
}
