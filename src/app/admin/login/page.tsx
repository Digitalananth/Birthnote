import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import AdminLoginForm from '@/app/admin/components/AdminLoginForm';
import { isAdminAuthenticated } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin — BirthNote',
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (await isAdminAuthenticated()) redirect('/admin');

  const { next } = await searchParams;
  // Only allow same-site relative paths, so ?next= cannot be used as an
  // open redirect to another domain.
  const target = next && /^\/admin(\/|$)/.test(next) ? next : '/admin';

  return (
    <main className="min-h-screen bg-secondary/30 flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <p className="text-xs uppercase tracking-widest text-primary font-bold mb-2 text-center">
          BirthNote
        </p>
        <h1 className="font-sans font-extrabold text-2xl text-foreground mb-8 text-center">
          Order admin
        </h1>
        <div className="card-warm p-8">
          <AdminLoginForm next={target} />
        </div>
        <p className="text-center text-sm text-muted-foreground mt-5">
          <Link href="/admin/forgot-password" className="text-primary underline">
            Forgotten your password?
          </Link>
        </p>
      </div>
    </main>
  );
}
