import React from 'react';
import type { Metadata } from 'next';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import HeroSection from '@/app/components/HeroSection';
import HowItWorksSection from '@/app/components/HowItWorksSection';
import WhyItMattersSection from '@/app/components/WhyItMattersSection';
import WhatYouReceiveSection from '@/app/components/WhatYouReceiveSection';
import BanknotesDisplaySection from '@/app/components/BanknotesDisplaySection';
import TestimonialsSection from '@/app/components/TestimonialsSection';
import JournalSection from '@/app/components/JournalSection';
import FinalCtaSection from '@/app/components/FinalCtaSection';

/**
 * Rendering strategy: ISR.
 *
 * The landing page is fully static HTML, so it is prerendered at build time
 * and served from disk — no database, no React rendering per request. The
 * hourly revalidate means copy or imagery changes go live without a rebuild:
 * the first visitor after the window gets the cached page instantly while
 * Next.js regenerates it in the background.
 *
 * JournalSection reads the database, so it is rendered into that same cached
 * HTML; publishing a post revalidates `/` from the admin API rather than
 * waiting the hour out.
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

export default function HomePage() {
  return (
    <>
      <Header />
      <main>
        <HeroSection />
        <HowItWorksSection />
        <WhyItMattersSection />
        <WhatYouReceiveSection />
        <BanknotesDisplaySection />
        <TestimonialsSection />
        <JournalSection />
        <FinalCtaSection />
      </main>
      <Footer />
    </>
  );
}