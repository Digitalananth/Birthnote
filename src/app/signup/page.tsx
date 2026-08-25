import React from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import AuthShell from '@/components/auth/AuthShell';
import OtpAuthForm from '@/components/auth/OtpAuthForm';
import { getCurrentUser } from '@/lib/session';

/**
 * Rendering strategy: SSR — see /login.
 *
 * Signing up and signing in are one flow now: enter a mobile number or an email
 * address, enter the code, and an account is created if it has none. This page
 * therefore renders the same form as /login and differs only in its wording. It
 * is kept rather than redirected because "create an account" links to it from
 * several places, and landing on a page titled "Welcome back" would read as
 * having been sent somewhere else.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Create an account — BirthNote',
  robots: { index: false, follow: false },
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  if (await getCurrentUser()) redirect(next && next.startsWith('/') ? next : '/account');

  return (
    <AuthShell
      title="Create your account."
      subtitle="Just a mobile number or an email address — we will send a code to confirm it."
    >
      <OtpAuthForm next={next} />
    </AuthShell>
  );
}
