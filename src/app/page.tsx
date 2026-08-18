import React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import HeroSection from '@/app/components/HeroSection';
import HowItWorksSection from '@/app/components/HowItWorksSection';
import WhyItMattersSection from '@/app/components/WhyItMattersSection';
import WhatYouReceiveSection from '@/app/components/WhatYouReceiveSection';
import BanknotesDisplaySection from '@/app/components/BanknotesDisplaySection';
import TestimonialsSection from '@/app/components/TestimonialsSection';
import FinalCtaSection from '@/app/components/FinalCtaSection';

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
        <FinalCtaSection />
      </main>
      <Footer />
    </>
  );
}