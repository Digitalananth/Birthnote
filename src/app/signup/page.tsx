import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import AuthShell from '@/components/auth/AuthShell';
import SignupForm from '@/components/auth/SignupForm';
import { getCurrentUser } from '@/lib/session';

/** Rendering strategy: SSR — see /login. */
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
      subtitle="One place for every date you ask us to find — with its status, price and tracking."
      footer={
        <>
          Already have an account?{' '}
          <Link
            href={next ? `/login?next=${encodeURIComponent(next)}` : '/login'}
            className="text-primary underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      <SignupForm next={next} />
    </AuthShell>
  );
}
