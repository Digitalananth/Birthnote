import React from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import LogoutButton from '@/app/admin/components/LogoutButton';
import type { AdminUser } from '@/lib/admin-roles';

/**
 * The admin header bar.
 *
 * `current` decides which item is highlighted; every page passes its own key
 * rather than reading the pathname, which a server component cannot do.
 *
 * "Admins" appears only for owners. That is presentation, not protection —
 * the page and its API routes check the role themselves. Pages and Blog are
 * open to both roles; see `requireContentAdmin`.
 */
type NavKey = 'dashboard' | 'orders' | 'pages' | 'blog' | 'users';

const ITEMS: { key: NavKey; href: string; label: string; icon: string; ownerOnly?: boolean }[] = [
  { key: 'dashboard', href: '/admin', label: 'Dashboard', icon: 'ChartBarIcon' },
  { key: 'orders', href: '/admin/orders', label: 'Orders', icon: 'ArchiveBoxIcon' },
  { key: 'pages', href: '/admin/pages', label: 'Pages', icon: 'DocumentTextIcon' },
  { key: 'blog', href: '/admin/blog', label: 'Blog', icon: 'EnvelopeOpenIcon' },
  { key: 'users', href: '/admin/users', label: 'Admins', icon: 'UserCircleIcon', ownerOnly: true },
];

export default function AdminNav({
  admin,
  current = 'orders',
}: {
  admin: AdminUser;
  current?: NavKey;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
      <div className="flex items-center gap-4">
        {ITEMS.filter((item) => !item.ownerOnly || admin.role === 'owner').map((item) => (
          <Link
            key={item.key}
            href={item.href}
            aria-current={current === item.key ? 'page' : undefined}
            className={`flex items-center gap-2 text-sm transition-colors ${
              current === item.key
                ? 'font-semibold text-foreground'
                : 'font-medium text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon name={item.icon} size={16} />
            {item.label}
          </Link>
        ))}
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
