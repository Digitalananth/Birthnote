import 'server-only';
import { cache } from 'react';
import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { RowDataPacket } from 'mysql2';
import { query } from '@/lib/db';
import { getAdminById, type AdminUser } from '@/lib/admin-users';

/**
 * Admin sessions.
 *
 * This used to be a stateless signed cookie holding nothing but a timestamp,
 * because there was exactly one admin and one shared password. With real
 * accounts that no longer works: removing someone's access has to end their
 * session immediately, and a signed cookie cannot be taken back.
 *
 * Same shape as the customer sessions in `src/lib/session.ts` — a random
 * token in the cookie, only its SHA-256 in the table.
 */
const COOKIE_NAME = 'birthnote_admin_session';

/**
 * Twelve hours, matching the old cookie: an admin session lives on a machine
 * that also handles money, so it expires far sooner than a customer's 30 days.
 */
const MAX_AGE_SECONDS = 60 * 60 * 12;

export const adminCookie = {
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

export async function createAdminSession(
  adminUserId: number,
  userAgent?: string | null
): Promise<string> {
  const token = randomBytes(32).toString('hex');
  await query(
    `INSERT INTO admin_sessions (admin_user_id, token_hash, user_agent, expires_at)
     VALUES (?, ?, ?, UTC_TIMESTAMP() + INTERVAL ? SECOND)`,
    [adminUserId, hashToken(token), userAgent?.slice(0, 255) || null, MAX_AGE_SECONDS]
  );
  return token;
}

/**
 * The signed-in admin, or null.
 *
 * Re-reads `is_active` on every request, so revoking an account takes effect
 * on their next click rather than whenever their session happens to expire.
 */
export const getCurrentAdmin = cache(async (): Promise<AdminUser | null> => {
  let token: string | undefined;
  try {
    token = (await cookies()).get(COOKIE_NAME)?.value;
  } catch {
    return null;
  }
  if (!token) return null;

  const rows = await query<(RowDataPacket & { admin_user_id: number })[]>(
    `SELECT admin_user_id FROM admin_sessions
      WHERE token_hash = ? AND expires_at > UTC_TIMESTAMP() LIMIT 1`,
    [hashToken(token)]
  );
  if (!rows.length) return null;

  const admin = await getAdminById(rows[0].admin_user_id);
  return admin?.isActive ? admin : null;
});

export async function isAdminAuthenticated(): Promise<boolean> {
  return (await getCurrentAdmin()) !== null;
}

/** Guard for admin pages. Redirects to the login screen when signed out. */
export async function requireAdmin(next = '/admin'): Promise<AdminUser> {
  const admin = await getCurrentAdmin();
  if (!admin) redirect(`/admin/login?next=${encodeURIComponent(next)}`);
  return admin;
}

/**
 * Guard for user management.
 *
 * Sends a signed-in but unauthorised admin to the order queue rather than the
 * login page — they are not anonymous, they simply cannot come in here.
 */
export async function requireOwner(next = '/admin/users'): Promise<AdminUser> {
  const admin = await requireAdmin(next);
  if (admin.role !== 'owner') redirect('/admin');
  return admin;
}

export async function destroyAdminSession(): Promise<void> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (token) {
    await query('DELETE FROM admin_sessions WHERE token_hash = ?', [hashToken(token)]);
  }
}

/**
 * Ends every session for an admin.
 *
 * Called when an account is deactivated, deleted, or has its password changed
 * by someone else — the point of those actions is that the person is out now,
 * not in twelve hours.
 */
export async function destroyAllAdminSessions(adminUserId: number): Promise<void> {
  await query('DELETE FROM admin_sessions WHERE admin_user_id = ?', [adminUserId]);
}

export async function pruneExpiredAdminSessions(): Promise<void> {
  try {
    await query('DELETE FROM admin_sessions WHERE expires_at < UTC_TIMESTAMP()');
  } catch (error) {
    console.error('[admin-session] prune failed', error);
  }
}
