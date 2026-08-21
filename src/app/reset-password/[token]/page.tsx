import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import AuthShell from '@/components/auth/AuthShell';
import ResetPasswordForm from '@/components/auth/ResetPasswordForm';
import FormAlert from '@/components/auth/FormAlert';
import { peekResetToken } from '@/lib/password-reset';
import { isValidResetToken } from '@/lib/auth-validation';

/**
 * Rendering strategy: SSR.
 *
 * The token is checked before the form renders, so an expired link says so
 * immediately instead of after someone has typed a new password twice.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Choose a new password — BirthNote',
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const valid = isValidResetToken(token) && (await peekResetToken(token)) !== null;

  if (!valid) {
    return (
      <AuthShell
        title="This link has expired."
        footer={
          <Link href="/forgot-password" className="text-primary underline">
            Send me a new link
          </Link>
        }
      >
        <FormAlert tone="error">
          Reset links work once and expire after an hour. Request a new one and we will email it
          straight away.
        </FormAlert>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Choose a new password."
      subtitle="Setting a new password signs you out on every other device."
    >
      <ResetPasswordForm token={token} />
    </AuthShell>
  );
}
