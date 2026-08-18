import React from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import PaymentHeroSection from '@/app/payment/components/PaymentHeroSection';
import PaymentFormSection from '@/app/payment/components/PaymentFormSection';

export default function PaymentPage() {
  return (
    <>
      <Header />
      <main>
        <PaymentHeroSection />
        <PaymentFormSection />
      </main>
      <Footer />
    </>
  );
}