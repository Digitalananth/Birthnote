import React from 'react';
import type { Metadata } from 'next';
import AdminNav from '@/app/admin/components/AdminNav';
import AdminUsersManager from '@/app/admin/components/AdminUsersManager';
import { requireOwner } from '@/lib/auth';
import { listAdmins } from '@/lib/admin-users';

/**
 * Rendering strategy: SSR, owner only.
 *
 * requireOwner sends a signed-in staff member back to the order queue rather
 * than the login page — they are not anonymous, they simply cannot come here.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Admins — BirthNote admin',
  robots: { index: false, follow: false },
};

export default async function AdminUsersPage() {
  const owner = await requireOwner('/admin/users');
  const admins = await listAdmins();

  return (
    <main className="min-h-screen bg-secondary/20 px-4 md:px-10 py-10">
      <div className="max-w-4xl mx-auto">
        <AdminNav admin={owner} current="users" />

        <div className="mb-8">
          <p className="text-xs uppercase tracking-widest text-primary font-bold mb-1">BirthNote</p>
          <h1 className="font-sans font-extrabold text-2xl md:text-3xl text-foreground">
            User management
          </h1>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            <strong>Owners</strong> can manage orders and other admins. <strong>Staff</strong> can
            manage orders only.
          </p>
        </div>

        <AdminUsersManager admins={admins} currentAdminId={owner.id} />
      </div>
    </main>
  );
}
