import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Icon from '@/components/ui/AppIcon';
import TrackLookupForm from '@/app/track-order/components/TrackLookupForm';

/**
 * Rendering strategy: SSG.
 *
 * This page is the same HTML for everyone — it holds a lookup box, nothing
 * customer-specific — so it is prerendered at build time and served straight
 * from disk. The order itself lives on /track-order/[reference], which is SSR.
 */
export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Track your order — My Lucky Dates',
  description:
    'Enter your My Lucky Dates reference number to see the status of your banknote request.',
  alternates: { canonical: '/track-order' },
};

export default function TrackOrderPage() {
  return (
    <>
      <Header />
      <main className="min-h-screen bg-background pt-28 pb-24">
        <div className="max-w-2xl mx-auto px-6 md:px-12">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-semibold uppercase tracking-widest mb-6">
              <Icon name="MagnifyingGlassIcon" size={12} />
              Order Tracking
            </div>
            <h1
              className="font-sans font-extrabold text-foreground mb-4"
              style={{
                fontSize: 'clamp(2rem, 5vw, 3.5rem)',
                letterSpacing: '-0.03em',
                lineHeight: 1,
              }}
            >
              Track your request
            </h1>
            <p className="font-serif italic text-lg text-muted-foreground leading-relaxed">
              Enter the reference number from your confirmation email.
            </p>
          </div>

          <div className="card-warm p-8 md:p-10">
            <TrackLookupForm />
          </div>

          <div className="mt-10 text-center">
            <p className="text-sm text-muted-foreground mb-4">
              Lost your reference number? Reply to your confirmation email and we&apos;ll find it.
            </p>
            <Link
              href="/request-a-banknote"
              className="inline-flex items-center gap-2 text-primary font-semibold text-sm border-b border-primary/30 pb-0.5 hover:border-primary transition-colors"
            >
              Request a banknote
              <Icon name="ArrowRightIcon" size={14} />
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
