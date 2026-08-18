import React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import RequestHeroSection from '@/app/request-a-banknote/components/RequestHeroSection';
import RequestFormSection from '@/app/request-a-banknote/components/RequestFormSection';

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