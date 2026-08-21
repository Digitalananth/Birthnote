/**
 * The admin role vocabulary and record shape.
 *
 * Split out of `admin-users.ts` because that module is `server-only` — the
 * admin management UI is a client component and needs the role list and the
 * type, but must never pull in the database code alongside them.
 */
export const ADMIN_ROLES = ['owner', 'staff'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: AdminRole;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}
