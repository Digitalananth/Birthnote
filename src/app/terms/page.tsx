import React from 'react';
import type { Metadata } from 'next';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import LegalPage from '@/components/LegalPage';

/** Rendering strategy: SSG — static copy, prerendered at build time. */
export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Terms & refunds — BirthNote',
  description: 'The terms of sale for BirthNote orders, including cancellation and refunds.',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <>
      <Header />
      <LegalPage
        title="Terms & refunds"
        updated="20 August 2026"
        sections={[
          {
            heading: 'How an order works',
            body: [
              'Submitting a date is a request, not a purchase. Nothing is charged and no contract exists at that point. We search our collection and email you the outcome, normally within 24 hours.',
              'If we find a note we email you a payment link. A contract of sale forms only when your payment is successfully taken. If we cannot find a note, the request ends there and you are charged nothing.',
            ],
          },
          {
            heading: 'What you receive',
            body: [
              'A genuine banknote printed on or dated to the date you requested, supplied in an archival sleeve and gift box with a certificate of authenticity. Banknotes are historical objects: condition varies and is described to you before you pay. Minor handling wear consistent with the stated grade is not a defect.',
            ],
          },
          {
            heading: 'Price and delivery',
            body: [
              'The price shown at checkout is the total, including tracked delivery within the UK and Ireland. Orders are packaged within 1–2 working days and typically arrive 3–5 working days after dispatch.',
            ],
          },
          {
            heading: 'Cancellation and refunds',
            body: [
              'Under the Consumer Contracts Regulations you may cancel within 14 days of receiving your order for any reason. Tell us by email within that period, return the note unused and in its original packaging, and we refund the full price including standard outbound delivery within 14 days of receiving it back. Return postage is yours unless the item was faulty or not as described.',
              'If a note arrives damaged, is not the date you ordered, or is not as described, we refund it in full including your return postage. Email us with your reference number and we will arrange it.',
            ],
          },
          {
            heading: 'Payment',
            body: [
              'Payments are processed by Stripe. We never see or store your card details. Your statement will show a charge from BirthNote.',
            ],
          },
          {
            heading: 'Liability',
            body: [
              'Nothing in these terms limits our liability for death, personal injury, or fraud. Otherwise our liability for any order is limited to the amount you paid for it. These terms are governed by the law of England and Wales.',
            ],
          },
        ]}
      />
      <Footer />
    </>
  );
}
