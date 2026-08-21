import React from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import LogoutButton from '@/app/admin/components/LogoutButton';
import type { AdminUser } from '@/lib/admin-roles';

/**
 * The admin header bar.
 *
 * "Admins" appears only for owners. That is presentation, not protection —
 * the page and its API routes check the role themselves.
 */
export default function AdminNav({ admin }: { admin: AdminUser }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
      <div className="flex items-center gap-4">
        <Link
          href="/admin"
          className="flex items-center gap-2 text-sm font-semibold text-foreground"
        >
          <Icon name="ArchiveBoxIcon" size={16} />
          Orders
        </Link>
        {admin.role === 'owner' && (
          <Link
            href="/admin/users"
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <Icon name="UserCircleIcon" size={16} />
            Admins
          </Link>
        )}
      </div>

      <div className="flex items-center gap-4">
        <span className="text-xs text-muted-foreground">
          {admin.name} · <span className="uppercase tracking-wide font-semibold">{admin.role}</span>
        </span>
        <LogoutButton />
      </div>
    </div>
  );
}
