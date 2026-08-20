import React from 'react';
import type { Metadata } from 'next';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import RequestHeroSection from '@/app/request-a-banknote/components/RequestHeroSection';
import RequestFormSection from '@/app/request-a-banknote/components/RequestFormSection';

/**
 * Rendering strategy: SSG.
 *
 * The page is identical for every visitor — only the form inside it is
 * interactive — so it is prerendered once at build time and served as static
 * HTML. The submission goes to /api/requests, which is dynamic.
 */
export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Request a banknote — BirthNote',
  description:
    'Tell us your date and we will search our collection for a genuine banknote printed on it. No payment until we confirm availability.',
  alternates: { canonical: '/request-a-banknote' },
};

export default function RequestABanknotePage() {
  return (
    <>
      <Header />
      <main>
        <RequestHeroSection />
        <RequestFormSection />
      </main>
      <Footer />
    </>
  );
}