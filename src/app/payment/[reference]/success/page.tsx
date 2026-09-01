import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Icon from '@/components/ui/AppIcon';
import { getOrderByReference, availableItems } from '@/lib/orders';
import { isValidReference, formatPrice } from '@/lib/validation';

/**
 * Rendering strategy: SSR (force-dynamic).
 *
 * Stripe sends the customer here after checkout. Note that this page only
 * *reports* status — it never marks an order paid. That is the webhook's job,
 * because a browser redirect can be forged, blocked, or simply closed. If the
 * webhook has not landed yet the page says "confirming", which resolves on a
 * refresh a second later.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PageProps {
  params: Promise<{ reference: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { reference } = await params;
  return {
    title: `Thank you — ${reference.toUpperCase()} — My Lucky Dates`,
    robots: { index: false, follow: false },
  };
}

export default async function PaymentSuccessPage({ params }: PageProps) {
  const { reference } = await params;
  if (!isValidReference(reference)) notFound();

  const order = await getOrderByReference(reference);
  if (!order) notFound();

  const settled = order.status === 'paid' || order.status === 'shipped';
  const notes = availableItems(order);

  return (
    <>
      <Header />
      <main className="min-h-screen bg-background pt-32 pb-24">
        <div className="max-w-2xl mx-auto px-6 md:px-12">
          <div className="card-warm p-10 md:p-14 text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-accent/0 via-accent to-accent/0" />

            <div className="w-20 h-20 rounded-full bg-accent/15 flex items-center justify-center mx-auto mb-6">
              <Icon name={settled ? 'HeartIcon' : 'ClockIcon'} size={36} className="text-accent" />
            </div>

            <h1
              className="font-sans font-extrabold text-foreground mb-3"
              style={{ fontSize: 'clamp(1.6rem, 4vw, 2.8rem)', letterSpacing: '-0.03em' }}
            >
              {settled ? 'Order confirmed.' : 'Confirming your payment…'}
            </h1>

            <p className="font-serif italic text-lg text-muted-foreground mb-2 leading-relaxed">
              {notes.length > 1 ? (
                <>
                  Your{' '}
                  <span className="text-primary font-semibold not-italic">
                    {notes.length} notes
                  </span>{' '}
                  {settled ? 'are on their way.' : 'are nearly yours.'}
                </>
              ) : (
                <>
                  Your note from{' '}
                  <span className="text-primary font-semibold not-italic font-mono">
                    {notes[0]?.displayDate}
                  </span>{' '}
                  {settled ? 'is on its way.' : 'is nearly yours.'}
                </>
              )}
            </p>

            <p className="text-sm text-muted-foreground mb-10 leading-relaxed">
              {settled
                ? `We've charged ${formatPrice(order.totalPaise, order.currency)} and emailed your receipt to ${order.customerEmail}.`
                : 'Stripe is still confirming with your bank. This usually takes a few seconds — refresh this page shortly, and we will email you either way.'}
            </p>

            <div className="bg-secondary/50 rounded-2xl p-6 text-left mb-8">
              <h2 className="font-sans font-bold text-foreground text-sm uppercase tracking-wide mb-4">
                What happens next
              </h2>
              <div className="flex flex-col gap-3">
                {[
                  { icon: 'EnvelopeIcon' as const, text: 'Confirmation email with your receipt.' },
                  {
                    icon: 'ArchiveBoxIcon' as const,
                    text: 'Note packaged in an archival sleeve and gift box within 1–2 working days.',
                  },
                  {
                    icon: 'TruckIcon' as const,
                    text: 'Dispatched with tracked delivery, arriving in 3–5 days.',
                  },
                ].map((item) => (
                  <div key={item.text} className="flex items-start gap-3">
                    <Icon name={item.icon} size={16} className="text-accent mt-0.5 shrink-0" />
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="inline-flex flex-col items-center gap-1 bg-secondary/60 border border-border rounded-xl px-6 py-4 mb-8">
              <span className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">
                Your reference
              </span>
              <span className="font-mono font-extrabold text-2xl text-foreground tracking-wider">
                {order.reference}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href={`/track-order/${order.reference}`}
                className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors"
              >
                <Icon name="MagnifyingGlassIcon" size={16} />
                Track my order
              </Link>
              <Link
                href="/"
                className="inline-flex items-center gap-2 text-primary font-semibold text-sm border-b border-primary/30 pb-0.5 hover:border-primary transition-colors"
              >
                <Icon name="ArrowLeftIcon" size={14} />
                Back to My Lucky Dates
              </Link>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
