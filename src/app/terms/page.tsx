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
              'If we find a note we email you a payment link. A contract of sale forms only when your payment is successfully received. If we cannot find a note, the request ends there and you are charged nothing.',
            ],
          },
          {
            heading: 'What you receive',
            body: [
              'A genuine banknote printed on or dated to the date you requested, supplied in an archival sleeve and gift box with a certificate of authenticity. Banknotes are historical objects: condition varies and is described to you in full before you pay. Minor handling wear consistent with the stated grade is not a defect.',
              'We deal only in demonetised and collectible notes traded as collectors’ items. Nothing we sell is offered as legal tender at face value.',
            ],
          },
          {
            heading: 'Price and delivery',
            body: [
              'All prices are in Indian Rupees and are inclusive of applicable taxes. The price shown at checkout is the total, including tracked delivery anywhere in India.',
              'Orders are packaged within 1–2 working days and typically arrive 3–7 working days after dispatch, depending on your location. We deliver within India only.',
            ],
          },
          {
            heading: 'Cancellation, returns and refunds',
            body: [
              'You may cancel any time before dispatch for a full refund — email us with your reference number and we will refund in full.',
              'After delivery, you may return your order within 7 days of receiving it for any reason. Tell us by email within that period, return the note unused and in its original packaging, and we refund the full price including outbound delivery within 7 working days of receiving it back. Return shipping is yours unless the item was damaged or not as described.',
              'If a note arrives damaged, is not the date you ordered, or is not as described, we refund it in full including your return shipping. Email us with your reference number and photographs and we will arrange it.',
              'Refunds are credited to the original payment method. Your bank typically takes a further 5–7 working days to show the credit.',
            ],
          },
          {
            heading: 'Payment',
            body: [
              'Payments are processed by Stripe. We never see or store your card, UPI or netbanking details. Your statement will show a charge from BirthNote.',
            ],
          },
          {
            heading: 'Grievance redressal',
            body: [
              'In accordance with the Consumer Protection (E-Commerce) Rules, 2020, complaints may be sent to our grievance officer by email. We acknowledge every complaint within 48 hours and resolve it within one month of receipt.',
            ],
          },
          {
            heading: 'Liability and governing law',
            body: [
              'Nothing in these terms limits our liability for fraud or for anything that cannot be limited under law. Otherwise our liability for any order is limited to the amount you paid for it.',
              'These terms are governed by the laws of India, and are subject to the exclusive jurisdiction of the courts at our registered place of business. Your rights under the Consumer Protection Act, 2019 are unaffected.',
            ],
          },
        ]}
      />
      <Footer />
    </>
  );
}
