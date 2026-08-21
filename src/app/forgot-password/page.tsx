import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import AuthShell from '@/components/auth/AuthShell';
import ForgotPasswordForm from '@/components/auth/ForgotPasswordForm';

/**
 * Rendering strategy: SSG.
 *
 * Identical for everyone — the form posts to a dynamic route.
 */
export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Reset your password — BirthNote',
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset your password."
      subtitle="Tell us your email address and we will send you a link to choose a new password."
      footer={
        <Link href="/login" className="text-primary underline">
          Back to sign in
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
