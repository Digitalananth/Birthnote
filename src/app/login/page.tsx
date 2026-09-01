import React from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import AuthShell from '@/components/auth/AuthShell';
import OtpAuthForm from '@/components/auth/OtpAuthForm';
import { getCurrentUser } from '@/lib/session';

/**
 * Rendering strategy: SSR.
 *
 * Reads the session to bounce anyone already signed in, and the `next` query
 * parameter to send them back where they were headed.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Sign in — My Lucky Dates',
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  if (await getCurrentUser()) redirect(next && next.startsWith('/') ? next : '/account');

  return (
    <AuthShell
      title="Welcome back."
      subtitle="Enter your mobile number or email address and we will send you a code. Nothing to remember."
      // No "create an account" link: the same two steps make one if the number
      // or address has none, so a second route would be the same door offered
      // twice. /signup exists for anyone who arrives with that link already.
    >
      <OtpAuthForm next={next} />
    </AuthShell>
  );
}
