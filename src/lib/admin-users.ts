import 'server-only';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { query } from '@/lib/db';
import { hashPassword, EmailTakenError } from '@/lib/users';
import { ADMIN_ROLES, type AdminRole, type AdminUser } from '@/lib/admin-roles';

/**
 * Admin accounts.
 *
 * Password hashing is shared with customer accounts (`src/lib/users.ts`) —
 * same scrypt format, same verification — but the records are kept in a
 * separate table. A customer and an admin are different things, and one table
 * with a flag makes it far too easy for a bug in the customer path to hand out
 * admin rights.
 *
 * The role vocabulary and the record type live in `admin-roles.ts` so the
 * client-side management UI can use them without importing this module.
 */
export { ADMIN_ROLES };
export type { AdminRole, AdminUser };

interface AdminRow extends RowDataPacket {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  role: AdminRole;
  is_active: number;
  last_login_at: Date | null;
  created_at: Date;
}

function mapAdmin(row: AdminRow): AdminUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    isActive: Boolean(row.is_active),
    lastLoginAt: row.last_login_at ? row.last_login_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
  };
}

const SELECT_ADMIN = 'SELECT * FROM admin_users';

/** Only ever returns an active account — a deactivated admin cannot sign in. */
export async function getActiveAdminByEmail(email: string): Promise<AdminUser | null> {
  const rows = await query<AdminRow[]>(
    `${SELECT_ADMIN} WHERE email = ? AND is_active = 1 LIMIT 1`,
    [email]
  );
  return rows.length ? mapAdmin(rows[0]) : null;
}

export async function getAdminById(id: number): Promise<AdminUser | null> {
  const rows = await query<AdminRow[]>(`${SELECT_ADMIN} WHERE id = ? LIMIT 1`, [id]);
  return rows.length ? mapAdmin(rows[0]) : null;
}

export async function getAdminPasswordHash(adminId: number): Promise<string | null> {
  const rows = await query<(RowDataPacket & { password_hash: string })[]>(
    'SELECT password_hash FROM admin_users WHERE id = ? LIMIT 1',
    [adminId]
  );
  return rows[0]?.password_hash ?? null;
}

export async function listAdmins(): Promise<AdminUser[]> {
  const rows = await query<AdminRow[]>(`${SELECT_ADMIN} ORDER BY created_at ASC`);
  return rows.map(mapAdmin);
}

export async function createAdmin(input: {
  name: string;
  email: string;
  password: string;
  role: AdminRole;
}): Promise<AdminUser> {
  const passwordHash = await hashPassword(input.password);
  try {
    const result = await query<ResultSetHeader>(
      `INSERT INTO admin_users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`,
      [input.name, input.email, passwordHash, input.role]
    );
    const admin = await getAdminById(result.insertId);
    if (!admin) throw new Error('Admin vanished immediately after insert.');
    return admin;
  } catch (error) {
    if ((error as { code?: string }).code === 'ER_DUP_ENTRY') throw new EmailTakenError();
    throw error;
  }
}

export async function updateAdmin(
  adminId: number,
  values: { name: string; email: string; role: AdminRole; isActive: boolean }
): Promise<AdminUser | null> {
  try {
    await query(
      'UPDATE admin_users SET name = ?, email = ?, role = ?, is_active = ? WHERE id = ?',
      [values.name, values.email, values.role, values.isActive ? 1 : 0, adminId]
    );
  } catch (error) {
    if ((error as { code?: string }).code === 'ER_DUP_ENTRY') throw new EmailTakenError();
    throw error;
  }
  return getAdminById(adminId);
}

export async function setAdminPassword(adminId: number, plain: string): Promise<void> {
  await query('UPDATE admin_users SET password_hash = ? WHERE id = ?', [
    await hashPassword(plain),
    adminId,
  ]);
}

export async function deleteAdmin(adminId: number): Promise<void> {
  await query('DELETE FROM admin_users WHERE id = ?', [adminId]);
}

export async function touchLastLogin(adminId: number): Promise<void> {
  await query('UPDATE admin_users SET last_login_at = UTC_TIMESTAMP() WHERE id = ?', [adminId]);
}

/**
 * How many owners could still sign in if the given account were removed.
 *
 * Guards every destructive change to an owner: deleting the last one, or
 * demoting or deactivating them, would leave a panel nobody can administer and
 * no way back in short of editing the database by hand.
 */
export async function countOtherActiveOwners(excludingId: number): Promise<number> {
  const rows = await query<(RowDataPacket & { total: number })[]>(
    "SELECT COUNT(*) AS total FROM admin_users WHERE role = 'owner' AND is_active = 1 AND id <> ?",
    [excludingId]
  );
  return Number(rows[0]?.total ?? 0);
}
