import React from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Icon from '@/components/ui/AppIcon';
import LogoutButton from '@/app/account/components/LogoutButton';
import { formatPhoneNumber } from '@/lib/auth-validation';
import { requireUser } from '@/lib/session';

/**
 * Rendering strategy: SSR for everything beneath /account.
 *
 * The signed-in guard lives here rather than in middleware so there is a
 * single place to audit, and so each page can use the user object the layout
 * already loaded — `getCurrentUser` is request-cached, so this costs one
 * query for the whole render.
 */
export const dynamic = 'force-dynamic';

const NAV = [
  { href: '/account', label: 'Overview', icon: 'HomeIcon' as const },
  { href: '/account/orders', label: 'My Orders', icon: 'ArchiveBoxIcon' as const },
  { href: '/account/profile', label: 'My Profile', icon: 'UserCircleIcon' as const },
];

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser('/account');

  return (
    <>
      <Header />
      <main className="min-h-screen bg-background pt-28 pb-24">
        <div className="max-w-5xl mx-auto px-6 md:px-12">
          <div className="mb-10">
            <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-2">
              My Account
            </p>
            <h1
              className="font-sans font-extrabold text-foreground"
              style={{ fontSize: 'clamp(1.5rem, 4vw, 2.25rem)', letterSpacing: '-0.03em' }}
            >
              {user.name || formatPhoneNumber(user.phone)}
            </h1>
            {/*
              The mobile number is what identifies the account, so it is the
              subtitle. The email is shown alongside only when there is one —
              it is optional now, and an empty line under the name reads as a
              missing detail rather than a deliberate absence.
            */}
            <p className="text-sm text-muted-foreground mt-1">
              {formatPhoneNumber(user.phone)}
              {user.email ? ` · ${user.email}` : ''}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 items-start">
            <nav className="md:col-span-1 flex flex-row md:flex-col gap-1 overflow-x-auto">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors whitespace-nowrap"
                >
                  <Icon name={item.icon} size={16} />
                  {item.label}
                </Link>
              ))}
              <LogoutButton />
            </nav>

            <div className="md:col-span-3">{children}</div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
