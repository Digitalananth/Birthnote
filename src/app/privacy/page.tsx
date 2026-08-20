import React from 'react';
import type { Metadata } from 'next';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import LegalPage from '@/components/LegalPage';

/** Rendering strategy: SSG — static copy, prerendered at build time. */
export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Privacy policy — BirthNote',
  description: 'What data BirthNote collects, why, and how long we keep it.',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <>
      <Header />
      <LegalPage
        title="Privacy policy"
        updated="20 August 2026"
        sections={[
          {
            heading: 'What we collect',
            body: [
              'When you request a banknote we store the date you asked for, your name, your email address, and anything you write in the optional gift and message fields. That is the whole record — we do not ask for a delivery address until payment.',
              'If you pay, Stripe collects your payment and delivery details on its own hosted checkout page. Those details are never sent to or stored on our servers; we receive only a payment reference, the amount, and the delivery address needed to ship your order.',
            ],
          },
          {
            heading: 'Why we hold it',
            body: [
              'To search our collection for your date, to email you the outcome, to take payment if you go ahead, and to deliver your order. Under the Digital Personal Data Protection Act, 2023 we process this data on the consent you give when you submit the form, for the purpose stated on that form and no other.',
            ],
          },
          {
            heading: 'Who we share it with',
            body: [
              'Stripe, to process payment. Our email provider, to deliver transactional email. Our delivery partner, to ship your order. Nobody else — we do not sell data and we do not send marketing email.',
              'Stripe processes payment data on servers outside India. Submitting an order means agreeing to that transfer, which is necessary to take payment.',
            ],
          },
          {
            heading: 'How long we keep it',
            body: [
              'Order records are kept for six years, the period Indian tax and GST law requires for transaction records. Requests that never become an order are deleted after twelve months.',
            ],
          },
          {
            heading: 'Your rights',
            body: [
              'As a Data Principal you may ask for a summary of the data we hold about you, ask us to correct or complete it, ask us to erase it where we are not required by law to keep it, withdraw your consent, and nominate someone to exercise these rights on your behalf. Email us and we will respond within thirty days.',
              'If you are not satisfied with how we handle a request, you may raise it with our grievance officer, and after that with the Data Protection Board of India.',
            ],
          },
          {
            heading: 'Cookies',
            body: [
              'We set one cookie, and only for shop staff signing into the order admin. The public pages set no analytics or advertising cookies.',
            ],
          },
        ]}
      />
      <Footer />
    </>
  );
}
