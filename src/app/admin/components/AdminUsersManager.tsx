'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import FormAlert from '@/components/auth/FormAlert';
import { ADMIN_ROLES, type AdminRole, type AdminUser } from '@/lib/admin-roles';
import { formatDateTime } from '@/lib/order-status';

type Errors = Record<string, string>;

/**
 * Add, edit, deactivate and delete admin accounts.
 *
 * Every guard that matters — owner-only, last-owner, no self-demotion — lives
 * in the API routes. This component only makes those rules visible.
 */
export default function AdminUsersManager({
  admins,
  currentAdminId,
}: {
  admins: AdminUser[];
  currentAdminId: number;
}) {
  const router = useRouter();
  const [invite, setInvite] = useState({ name: '', email: '', role: 'staff' as AdminRole });
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const reset = () => {
    setErrors({});
    setFailure('');
    setNotice('');
  };

  const handleInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    reset();
    setBusy('invite');
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invite),
      });
      const payload = await response.json().catch(() => ({}));
      if (payload.errors) {
        setErrors(payload.errors);
        return;
      }
      if (!response.ok) {
        setFailure(payload.error || 'We could not create that account.');
        return;
      }
      setNotice(`Invited ${invite.email}. They have been emailed a link to set their password.`);
      setInvite({ name: '', email: '', role: 'staff' });
      router.refresh();
    } catch {
      setFailure('We could not reach the server. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const patch = async (admin: AdminUser, changes: Partial<AdminUser>) => {
    reset();
    setBusy(`row-${admin.id}`);
    try {
      const response = await fetch(`/api/admin/users/${admin.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: admin.name,
          email: admin.email,
          role: admin.role,
          isActive: admin.isActive,
          ...changes,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFailure(payload.error || 'We could not save that change.');
        return;
      }
      router.refresh();
    } catch {
      setFailure('We could not reach the server. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (admin: AdminUser) => {
    reset();
    setBusy(`row-${admin.id}`);
    try {
      const response = await fetch(`/api/admin/users/${admin.id}`, { method: 'DELETE' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFailure(payload.error || 'We could not delete that account.');
        return;
      }
      setNotice(`Removed ${admin.email}.`);
      router.refresh();
    } catch {
      setFailure('We could not reach the server. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const input =
    'px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40';

  return (
    <div className="flex flex-col gap-8">
      {failure && <FormAlert tone="error">{failure}</FormAlert>}
      {notice && <FormAlert tone="success">{notice}</FormAlert>}

      <section className="card-warm p-6">
        <h2 className="font-sans font-bold text-foreground text-sm uppercase tracking-wide mb-1">
          Invite an admin
        </h2>
        <p className="text-xs text-muted-foreground mb-5 leading-relaxed">
          They choose their own password from a one-time link, so you never have to send one.
        </p>

        <form onSubmit={handleInvite} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="sm:col-span-1">
            <input
              aria-label="Name"
              placeholder="Name"
              value={invite.name}
              onChange={(event) => setInvite((p) => ({ ...p, name: event.target.value }))}
              className={`${input} w-full`}
            />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
          </div>
          <div className="sm:col-span-2">
            <input
              aria-label="Email address"
              type="email"
              placeholder="name@example.com"
              value={invite.email}
              onChange={(event) => setInvite((p) => ({ ...p, email: event.target.value }))}
              className={`${input} w-full`}
            />
            {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
          </div>
          <div className="sm:col-span-1 flex gap-2">
            <select
              aria-label="Role"
              value={invite.role}
              onChange={(event) =>
                setInvite((p) => ({ ...p, role: event.target.value as AdminRole }))
              }
              className={`${input} flex-1`}
            >
              {ADMIN_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={busy === 'invite'}
              className="px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {busy === 'invite' ? '…' : 'Invite'}
            </button>
          </div>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-sans font-bold text-foreground text-sm uppercase tracking-wide">
          Admins ({admins.length})
        </h2>

        {admins.map((admin) => {
          const isSelf = admin.id === currentAdminId;
          const rowBusy = busy === `row-${admin.id}`;

          return (
            <div
              key={admin.id}
              className={`card-warm p-5 flex flex-col sm:flex-row sm:items-center gap-4 ${
                admin.isActive ? '' : 'opacity-60'
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground text-sm">
                  {admin.name}
                  {isSelf && <span className="text-muted-foreground font-normal"> (you)</span>}
                </p>
                <p className="text-xs text-muted-foreground break-words">{admin.email}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {admin.lastLoginAt
                    ? `Last signed in ${formatDateTime(admin.lastLoginAt)}`
                    : 'Has not signed in yet'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label={`Role for ${admin.email}`}
                  value={admin.role}
                  disabled={rowBusy || isSelf}
                  onChange={(event) => patch(admin, { role: event.target.value as AdminRole })}
                  className={`${input} disabled:opacity-60`}
                >
                  {ADMIN_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  disabled={rowBusy || isSelf}
                  onClick={() => patch(admin, { isActive: !admin.isActive })}
                  className="px-3 py-2.5 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                >
                  {admin.isActive ? 'Deactivate' : 'Reactivate'}
                </button>

                <button
                  type="button"
                  disabled={rowBusy || isSelf}
                  onClick={() => remove(admin)}
                  className="px-3 py-2.5 rounded-xl border border-red-200 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                >
                  <Icon name="XMarkIcon" size={12} />
                </button>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
