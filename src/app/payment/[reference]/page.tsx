import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Icon from '@/components/ui/AppIcon';
import OrderNotes from '@/components/OrderNotes';
import PaymentHeroSection from '@/app/payment/components/PaymentHeroSection';
import CheckoutButton from '@/app/payment/components/CheckoutButton';
import { getOrderByReference } from '@/lib/orders';
import { isValidReference, formatPrice } from '@/lib/validation';

/**
 * Rendering strategy: SSR (force-dynamic).
 *
 * The order summary and its eligibility for payment are read from MySQL on
 * every request, so a customer cannot pay twice by reopening a cached page.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PageProps {
  params: Promise<{ reference: string }>;
  searchParams: Promise<{ cancelled?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { reference } = await params;
  return {
    title: `Complete your order ${reference.toUpperCase()} — BirthNote`,
    robots: { index: false, follow: false },
  };
}

export default async function PaymentPage({ params, searchParams }: PageProps) {
  const { reference } = await params;
  const { cancelled } = await searchParams;

  if (!isValidReference(reference)) notFound();
  const order = await getOrderByReference(reference);
  if (!order) notFound();

  const amountLabel = formatPrice(order.pricePaise, order.currency);
  const alreadyPaid = order.status === 'paid' || order.status === 'shipped';

  // Only a confirmed order can be paid. Anything else gets an explanation
  // rather than a checkout button.
  if (order.status !== 'confirmed') {
    return (
      <>
        <Header />
        <main className="min-h-screen bg-background pt-32 pb-24">
          <div className="max-w-xl mx-auto px-6 md:px-12">
            <div className="card-warm p-10 text-center">
              <div
                className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 ${
                  alreadyPaid ? 'bg-green-50' : 'bg-accent/15'
                }`}
              >
                <Icon
                  name={alreadyPaid ? 'CheckCircleIcon' : 'ClockIcon'}
                  size={30}
                  className={alreadyPaid ? 'text-green-700' : 'text-accent'}
                />
              </div>
              <h1 className="font-sans font-extrabold text-2xl text-foreground mb-3">
                {alreadyPaid ? 'This order is already paid.' : 'Not ready for payment yet.'}
              </h1>
              <p className="text-sm text-muted-foreground leading-relaxed mb-8">
                {alreadyPaid
                  ? 'Nothing further to do — we will email you as soon as your note ships.'
                  : order.status === 'unavailable'
                    ? 'We could not find a note for this date, so there is nothing to pay for. You have not been charged.'
                    : 'We are still checking our collection. We will email you a payment link as soon as your date is confirmed.'}
              </p>
              <Link
                href={`/track-order/${order.reference}`}
                className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors"
              >
                <Icon name="MagnifyingGlassIcon" size={16} />
                View order status
              </Link>
            </div>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <main>
        <PaymentHeroSection />

        <section className="bg-background py-8 md:py-12 pb-10">
          <div className="max-w-2xl mx-auto px-6 md:px-12 flex flex-col gap-5">
            {cancelled && (
              <div className="flex items-start gap-3 rounded-xl border border-accent/30 bg-accent/10 px-5 py-4">
                <Icon name="InformationCircleIcon" size={18} className="text-accent mt-0.5 shrink-0" />
                <p className="text-sm text-foreground leading-relaxed">
                  Your payment was cancelled and you have not been charged. Your note is still
                  reserved — you can complete the order below whenever you are ready.
                </p>
              </div>
            )}

            {/* Order summary */}
            <div className="card-warm p-6 md:p-8">
              <h2 className="font-sans font-bold text-foreground text-sm uppercase tracking-wide mb-5">
                Order summary
              </h2>

              <div className="pb-4 mb-4 border-b border-border">
                <p className="text-xs text-muted-foreground mb-3">
                  Reference {order.reference}
                </p>
                {/*
                  Every requested note is listed, found or not, so the customer
                  can see exactly what they are being charged for and what they
                  are not.
                */}
                <OrderNotes order={order} showPrices showDetails />
              </div>

              <div className="flex items-baseline justify-between mb-5">
                <p className="font-sans font-bold text-foreground">Total</p>
                <p className="font-sans font-bold text-foreground">{amountLabel}</p>
              </div>

              <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                {[
                  'Archival sleeve and gift box included.',
                  'Tracked delivery anywhere in India, arriving in 3–5 days.',
                ].map((line) => (
                  <div key={line} className="flex items-start gap-3">
                    <Icon name="CheckIcon" size={16} className="text-accent mt-0.5 shrink-0" />
                    <span className="leading-relaxed">{line}</span>
                  </div>
                ))}
              </div>
            </div>

            <CheckoutButton reference={order.reference} amountLabel={amountLabel} />

            {/* The last hesitation before entering a card is what happens if this goes wrong. */}
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Damaged or lost in transit? We replace it or refund you in full — see{' '}
              <Link href="/returns" className="underline underline-offset-4 hover:text-foreground transition-colors">
                Returns &amp; Refunds
              </Link>
              .
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
