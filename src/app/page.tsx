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
import BlogSection from '@/app/components/BlogSection';
import FinalCtaSection from '@/app/components/FinalCtaSection';

/**
 * Rendering strategy: ISR.
 *
 * The landing page is prerendered at build time and served from the cache;
 * the first visitor after the window gets the cached page instantly while
 * Next.js regenerates it in the background.
 *
 * TestimonialsSection and BlogSection read the database, so they are rendered
 * into that same cached HTML; admin saves revalidate `/` immediately. The
 * window is short because the build runs *before* boot-time migrations: when
 * a deploy adds a table a section reads, the build-time copy is rendered
 * without it (the section hides itself), and a long window would keep that
 * copy live for an hour. One regeneration a minute costs next to nothing.
 */
export const revalidate = 60;

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
        <BlogSection />
        <FinalCtaSection />
      </main>
      <Footer />
    </>
  );
}
