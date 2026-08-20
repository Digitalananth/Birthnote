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
              'When you request a banknote we store the date you asked for, your name, your email address, and anything you write in the optional gift and message fields. That is the whole record — we do not ask for a postal address until payment.',
              'If you pay, Stripe collects your card and delivery details on its own hosted checkout page. Those details are never sent to or stored on our servers; we receive only a payment reference, the amount, and the delivery address needed to post your order.',
            ],
          },
          {
            heading: 'Why we hold it',
            body: [
              'To search our collection for your date, to email you the outcome, to take payment if you go ahead, and to deliver your order. That is a contract you have asked us to perform, which is our lawful basis under UK GDPR Article 6(1)(b).',
            ],
          },
          {
            heading: 'Who we share it with',
            body: [
              'Stripe, to process payment. Our email provider, to deliver transactional email. Our delivery carrier, to post your order. Nobody else — we do not sell data and we do not send marketing email.',
            ],
          },
          {
            heading: 'How long we keep it',
            body: [
              'Order records are kept for six years, which is the period UK tax law requires for transaction records. Requests that never become an order are deleted after twelve months.',
            ],
          },
          {
            heading: 'Your rights',
            body: [
              'You can ask for a copy of your data, ask us to correct it, or ask us to delete it where we are not required to keep it. Email us and we will respond within thirty days. If you are unhappy with how we handle a request you can complain to the Information Commissioner’s Office at ico.org.uk.',
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
