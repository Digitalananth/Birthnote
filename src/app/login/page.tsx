import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import AuthShell from '@/components/auth/AuthShell';
import LoginForm from '@/components/auth/LoginForm';
import { getCurrentUser } from '@/lib/session';

/**
 * Rendering strategy: SSR.
 *
 * Reads the session to bounce anyone already signed in, and the `next` query
 * parameter to send them back where they were headed.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Sign in — BirthNote',
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
      subtitle="Sign in to see your requests, their status and tracking."
      footer={
        <>
          New here?{' '}
          <Link
            href={next ? `/signup?next=${encodeURIComponent(next)}` : '/signup'}
            className="text-primary underline"
          >
            Create an account
          </Link>
        </>
      }
    >
      <LoginForm next={next} />
      <p className="text-sm text-muted-foreground mt-6">
        <Link href="/forgot-password" className="text-primary underline">
          Forgotten your password?
        </Link>
      </p>
    </AuthShell>
  );
}
