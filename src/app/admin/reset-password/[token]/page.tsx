import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import AdminAuthShell from '@/app/admin/components/AdminAuthShell';
import AdminResetPasswordForm from '@/app/admin/components/AdminResetPasswordForm';
import FormAlert from '@/components/auth/FormAlert';
import { peekAdminResetToken } from '@/lib/password-reset';
import { isValidResetToken } from '@/lib/auth-validation';
import { getAdminById } from '@/lib/admin-users';

/**
 * Rendering strategy: SSR.
 *
 * Serves both the invite link a new admin receives and an ordinary reset, so
 * the token is checked — and the account confirmed still active — before the
 * form appears.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Set admin password — BirthNote',
  robots: { index: false, follow: false },
};

export default async function AdminResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let valid = false;
  if (isValidResetToken(token)) {
    const adminId = await peekAdminResetToken(token);
    valid = adminId !== null && Boolean((await getAdminById(adminId))?.isActive);
  }

  if (!valid) {
    return (
      <AdminAuthShell title="This link has expired">
        <FormAlert tone="error">
          Admin links work once and expire after an hour. Ask an owner to send a new one, or reset
          your password yourself.
        </FormAlert>
        <p className="text-center text-sm text-muted-foreground mt-5">
          <Link href="/admin/forgot-password" className="text-primary underline">
            Send me a new link
          </Link>
        </p>
      </AdminAuthShell>
    );
  }

  return (
    <AdminAuthShell
      title="Choose your password"
      subtitle="This signs you out on every other device."
    >
      <AdminResetPasswordForm token={token} />
    </AdminAuthShell>
  );
}
