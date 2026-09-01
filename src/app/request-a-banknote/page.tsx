import React from 'react';
import type { Metadata } from 'next';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import RequestHeroSection from '@/app/request-a-banknote/components/RequestHeroSection';
import RequestFormSection from '@/app/request-a-banknote/components/RequestFormSection';
import { getCurrentUser } from '@/lib/session';

/**
 * Rendering strategy: SSR.
 *
 * This page was static until accounts arrived. It now reads the session so a
 * signed-in customer's name and email are already filled in, which cannot be
 * done from a prerendered page. Fetching the user from the browser instead
 * would keep the HTML static but flash an empty form on every load.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Request a banknote — My Lucky Dates',
  description:
    'Tell us your date and we will search our collection for a genuine banknote printed on it. No payment until we confirm availability.',
  alternates: { canonical: '/request-a-banknote' },
};

export default async function RequestABanknotePage() {
  const user = await getCurrentUser();

  return (
    <>
      <Header />
      <main>
        <RequestHeroSection />
        <RequestFormSection
          user={user && { name: user.name, email: user.email, whatsapp: user.whatsapp }}
        />
      </main>
      <Footer />
    </>
  );
}
