import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import AdminAuthShell from '@/app/admin/components/AdminAuthShell';
import AdminForgotPasswordForm from '@/app/admin/components/AdminForgotPasswordForm';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Reset admin password — My Lucky Dates',
  robots: { index: false, follow: false },
};

export default function AdminForgotPasswordPage() {
  return (
    <AdminAuthShell
      title="Reset your password"
      subtitle="We will email you a link to choose a new one."
    >
      <AdminForgotPasswordForm />
      <p className="text-center text-sm text-muted-foreground mt-5">
        <Link href="/admin/login" className="text-primary underline">
          Back to sign in
        </Link>
      </p>
    </AdminAuthShell>
  );
}
