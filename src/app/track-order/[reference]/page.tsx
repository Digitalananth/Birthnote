import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Icon from '@/components/ui/AppIcon';
import { getOrderByReference, getOrderEvents } from '@/lib/orders';
import { isValidReference, formatPrice } from '@/lib/validation';
import {
  STATUS_CONFIG,
  PROGRESS_STEPS,
  progressIndex,
  formatDateTime,
} from '@/lib/order-status';

/**
 * Rendering strategy: SSR (force-dynamic).
 *
 * Order status changes the moment we update it in the admin panel, and a
 * customer refreshing this page expects the truth — so it is rendered per
 * request and never cached. `noStore` also keeps it out of any CDN in front
 * of the app.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PageProps {
  params: Promise<{ reference: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { reference } = await params;
  return {
    title: `Order ${reference.toUpperCase()} — BirthNote`,
    // Order pages are reachable by anyone holding the reference, so keep them
    // out of search indexes.
    robots: { index: false, follow: false },
  };
}

export default async function TrackedOrderPage({ params }: PageProps) {
  const { reference } = await params;
  if (!isValidReference(reference)) notFound();

  const order = await getOrderByReference(reference);
  if (!order) notFound();

  const events = await getOrderEvents(order.id);
  const status = STATUS_CONFIG[order.status];
  const currentStep = progressIndex(order.status);
  const stopped = order.status === 'unavailable';

  return (
    <>
      <Header />
      <main className="min-h-screen bg-background pt-28 pb-24">
        <div className="max-w-2xl mx-auto px-6 md:px-12">
          {/* Reference header */}
          <div className="text-center mb-10">
            <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-2">
              Reference
            </p>
            <p className="font-mono font-extrabold text-2xl md:text-3xl text-foreground tracking-wider mb-3">
              {order.reference}
            </p>
            <p className="font-serif italic text-lg text-muted-foreground">
              A banknote from{' '}
              <span className="text-primary font-semibold not-italic font-mono">
                {order.displayDate}
              </span>
            </p>
          </div>

          {/* Current status */}
          <div className={`card-warm p-8 mb-8 border ${status.border}`}>
            <div className="flex items-start gap-4">
              <div className={`w-12 h-12 rounded-full ${status.bg} flex items-center justify-center shrink-0`}>
                <Icon name={status.icon} size={22} className={status.color} />
              </div>
              <div>
                <h1 className={`font-sans font-extrabold text-xl mb-1 ${status.color}`}>
                  {status.label}
                </h1>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {status.description}
                </p>
              </div>
            </div>

            {/* Progress bar — hidden once an order has stopped */}
            {!stopped && (
              <div className="flex items-center mt-8">
                {PROGRESS_STEPS.map((step, index) => (
                  <React.Fragment key={step.key}>
                    <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-full border-2 flex items-center justify-center transition-colors ${
                          index <= currentStep
                            ? 'bg-accent border-accent text-foreground'
                            : 'bg-background border-border text-muted-foreground'
                        }`}
                      >
                        {index < currentStep ? (
                          <Icon name="CheckCircleIcon" size={16} />
                        ) : (
                          <span className="text-xs font-bold">{index + 1}</span>
                        )}
                      </div>
                      <p
                        className={`text-[11px] font-medium text-center leading-tight truncate w-full ${
                          index <= currentStep ? 'text-foreground' : 'text-muted-foreground'
                        }`}
                      >
                        {step.label}
                      </p>
                    </div>
                    {index < PROGRESS_STEPS.length - 1 && (
                      <div
                        className={`h-0.5 flex-1 mb-6 ${
                          index < currentStep ? 'bg-accent' : 'bg-border'
                        }`}
                      />
                    )}
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>

          {/* Payment call to action */}
          {order.status === 'confirmed' && (
            <div className="card-warm p-8 mb-8 text-center">
              <p className="text-sm text-muted-foreground mb-1">Total including tracked delivery</p>
              <p className="font-sans font-extrabold text-3xl text-foreground mb-6">
                {formatPrice(order.pricePence, order.currency)}
              </p>
              <Link
                href={`/payment/${order.reference}`}
                className="inline-flex items-center gap-2 px-7 py-3.5 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 transition-colors"
              >
                <Icon name="CreditCardIcon" size={16} />
                Complete your order
              </Link>
            </div>
          )}

          {/* What we found */}
          {order.noteDenomination && (
            <div className="card-warm p-6 mb-8">
              <h2 className="font-sans font-bold text-foreground text-sm uppercase tracking-wide mb-4">
                Your note
              </h2>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                {[
                  ['Denomination', order.noteDenomination],
                  ['Country', order.noteCountry],
                  ['Condition', order.noteCondition],
                  ['Serial prefix', order.noteSerial],
                  ['Tracking number', order.trackingNumber],
                ]
                  .filter(([, value]) => Boolean(value))
                  .map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">
                        {label}
                      </dt>
                      <dd className="text-foreground font-medium">{value}</dd>
                    </div>
                  ))}
              </dl>
            </div>
          )}

          {/* Timeline */}
          <div className="card-warm p-6 mb-10">
            <h2 className="font-sans font-bold text-foreground text-sm uppercase tracking-wide mb-5">
              History
            </h2>
            <ol className="flex flex-col gap-4">
              {events.map((event, index) => (
                <li key={`${event.createdAt}-${index}`} className="flex items-start gap-3">
                  <span className="w-2 h-2 rounded-full bg-accent mt-1.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {STATUS_CONFIG[event.status as keyof typeof STATUS_CONFIG]?.label ??
                        event.status}
                    </p>
                    {event.note && (
                      <p className="text-sm text-muted-foreground leading-relaxed">{event.note}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDateTime(event.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="text-center">
            <Link
              href="/track-order"
              className="inline-flex items-center gap-2 text-primary font-semibold text-sm border-b border-primary/30 pb-0.5 hover:border-primary transition-colors"
            >
              <Icon name="ArrowLeftIcon" size={14} />
              Track a different order
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
