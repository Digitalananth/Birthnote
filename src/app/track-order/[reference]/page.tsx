import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Icon from '@/components/ui/AppIcon';
import OrderNotes from '@/components/OrderNotes';
import OrderTotals from '@/components/OrderTotals';
import { getOrderByReference, getOrderEvents, summariseOrder, type OrderEvent } from '@/lib/orders';
import { isValidReference, formatPrice } from '@/lib/validation';
import { maybeSweep } from '@/server/background-sweep';
import { STATUS_CONFIG, PROGRESS_STEPS, progressIndex, formatDateTime } from '@/lib/order-status';
import { groupOrderItems } from '@/lib/order-types';
import { getInvoiceForOrder } from '@/lib/invoices';
import { refreshIfStale } from '@/lib/tracking';

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
    title: `Order ${reference.toUpperCase()} — My Lucky Dates`,
    // Order pages are reachable by anyone holding the reference, so keep them
    // out of search indexes.
    robots: { index: false, follow: false },
  };
}

/** A scan written by the courier sync, as opposed to a step in our pipeline. */
function isScan(event: OrderEvent): boolean {
  return event.actor === 'shiprocket' && event.status === 'shipped';
}

/** "11 Sep" and "07:05 PM", in India time whatever the server's zone. */
function scanDay(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(iso));
}
function scanTime(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  })
    .format(new Date(iso))
    .toUpperCase();
}

export default async function TrackedOrderPage({ params }: PageProps) {
  // A customer checking their order is the likeliest person to be affected by
  // a payment we never heard about. Fire-and-forget: it does not delay this
  // page, and at most one run happens per window.
  maybeSweep();

  const { reference } = await params;
  if (!isValidReference(reference)) notFound();

  const found = await getOrderByReference(reference);
  if (!found) notFound();
  // A shipped order whose tracking is over half an hour old is re-read from
  // Shiprocket first, waiting a few seconds at most — so the courier card and
  // the history below are current even when a webhook was missed.
  const order = await refreshIfStale(found);
  const showCourier =
    (order.status === 'shipped' || order.status === 'delivered') && Boolean(order.trackingNumber);

  const allEvents = await getOrderEvents(order.id);
  // Courier scans get their own timeline in the Delivery card; History keeps
  // the order's own steps, so nothing is listed twice.
  const events = allEvents.filter((event) => !isScan(event));
  const scans = allEvents
    .filter(isScan)
    .map((event) => {
      // Stored as "ACTIVITY — LOCATION"; the location is after the last dash.
      const note = event.note ?? '';
      const cut = note.lastIndexOf(' — ');
      return {
        activity: cut >= 0 ? note.slice(0, cut) : note,
        location: cut >= 0 ? note.slice(cut + 3) : '',
        at: event.createdAt,
      };
    })
    .reverse();
  const invoice = await getInvoiceForOrder(order.id);
  const status = STATUS_CONFIG[order.status];
  const currentStep = progressIndex(order.status);
  const stopped = order.status === 'unavailable';
  const requestCount = groupOrderItems(order.items).length;

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
              {order.items.length > 1 ? (
                <>
                  <span className="text-primary font-semibold not-italic">
                    {order.items.length} banknotes
                  </span>{' '}
                  in one order
                </>
              ) : (
                <>
                  A banknote from{' '}
                  <span className="text-primary font-semibold not-italic font-mono">
                    {summariseOrder(order)}
                  </span>
                </>
              )}
            </p>
          </div>

          {/* Current status */}
          <div className={`card-warm p-8 mb-8 border ${status.border}`}>
            <div className="flex items-start gap-4">
              <div
                className={`w-12 h-12 rounded-full ${status.bg} flex items-center justify-center shrink-0`}
              >
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

          {/* Where the parcel is, in the courier's words */}
          {showCourier && (
            <div className="card-warm p-6 mb-8">
              <h2 className="font-sans font-bold text-foreground text-sm uppercase tracking-wide mb-4">
                Delivery
              </h2>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
                {[
                  ['Courier', order.courierName],
                  ['Tracking ID', order.trackingNumber],
                  ['Latest update', order.shipmentStatus],
                  [
                    order.status === 'delivered' ? 'Delivered on' : 'Expected by',
                    order.status === 'delivered'
                      ? order.deliveredAt
                        ? formatDateTime(order.deliveredAt)
                        : null
                      : order.courierEtd,
                  ],
                ]
                  .filter(([, value]) => Boolean(value))
                  .map(([label, value]) => (
                    <div key={label as string}>
                      <dt className="text-xs uppercase tracking-wide text-muted-foreground mb-0.5">
                        {label}
                      </dt>
                      <dd className="text-foreground font-medium break-words">{value}</dd>
                    </div>
                  ))}
              </dl>
              {/* Every courier scan, newest first */}
              {scans.length > 0 ? (
                <ol className="mt-6 pt-6 border-t border-border flex flex-col">
                  {scans.map((scan, index) => (
                    <li key={`${scan.at}-${index}`} className="flex gap-4">
                      <div className="w-16 shrink-0 text-right">
                        <p className="text-sm font-semibold text-foreground">{scanDay(scan.at)}</p>
                        <p className="text-xs text-muted-foreground">{scanTime(scan.at)}</p>
                      </div>
                      <div className="flex flex-col items-center">
                        <span
                          className={`w-3 h-3 rounded-full mt-1 shrink-0 ${
                            index === 0 ? 'bg-primary' : 'bg-border'
                          }`}
                        />
                        {index < scans.length - 1 && <span className="w-px flex-1 bg-border" />}
                      </div>
                      <div className="pb-6 min-w-0">
                        <p className="text-sm text-foreground">
                          <span className="text-muted-foreground">Activity: </span>
                          <span className="font-semibold">{scan.activity}</span>
                        </p>
                        {scan.location && (
                          <p className="text-sm text-foreground">
                            <span className="text-muted-foreground">Location: </span>
                            {scan.location}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-xs text-muted-foreground mt-4">
                  The courier&apos;s scans will appear here as the parcel moves.
                </p>
              )}
            </div>
          )}

          {/* Payment call to action */}
          {order.status === 'confirmed' && (
            <div className="card-warm p-8 mb-8 text-center">
              <p className="text-sm text-muted-foreground mb-1">
                Total including tracked delivery anywhere in India
              </p>
              <p className="font-sans font-extrabold text-3xl text-foreground mb-6">
                {formatPrice(order.totalPaise, order.currency)}
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

          {/* The notes in this order */}
          <div className="card-warm p-6 mb-8">
            <h2 className="font-sans font-bold text-foreground text-sm uppercase tracking-wide mb-4">
              {order.items.length > 1 ? `Your ${order.items.length} notes` : 'Your note'}
              {requestCount > 1 && (
                <span className="font-normal normal-case tracking-normal text-muted-foreground">
                  {' '}
                  · {requestCount} dates
                </span>
              )}
            </h2>
            <OrderNotes
              order={order}
              showDetails
              showPrices={order.status !== 'pending' && order.status !== 'checking'}
            />

            {/* The breakup, once there is one to show. Before the admin has
                priced anything there is nothing here but zeroes. */}
            {order.pricePaise > 0 && (
              <div className="mt-5 pt-5 border-t border-border">
                <OrderTotals order={order} />
              </div>
            )}
          </div>

          {/* The invoice, once it exists. Raised on payment, so an unpaid
              order has none and is not offered a link to one. */}
          {invoice && (
            <div className="card-warm p-6 mb-8 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="font-sans font-bold text-foreground text-sm uppercase tracking-wide">
                  Tax invoice
                </h2>
                <p className="font-mono text-sm text-muted-foreground mt-1">{invoice.number}</p>
              </div>
              <Link
                href={`/invoice/${order.reference}`}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                <Icon name="DocumentTextIcon" size={15} />
                View invoice
              </Link>
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
