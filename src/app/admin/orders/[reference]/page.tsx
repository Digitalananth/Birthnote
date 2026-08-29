import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import StatusActions from '@/app/admin/components/StatusActions';
import HoldActions from '@/app/admin/components/HoldActions';
import ItemActions from '@/app/admin/components/ItemActions';
import { requireAdmin } from '@/lib/auth';
import { getOrderByReference, getOrderEvents } from '@/lib/orders';
import { isValidReference, formatPrice } from '@/lib/validation';
import { STATUS_CONFIG, formatDateTime } from '@/lib/order-status';

/** Rendering strategy: SSR — always the live record. */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PageProps {
  params: Promise<{ reference: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { reference } = await params;
  return {
    title: `${reference.toUpperCase()} — BirthNote admin`,
    robots: { index: false, follow: false },
  };
}

export default async function AdminOrderPage({ params }: PageProps) {
  const { reference } = await params;
  await requireAdmin(`/admin/orders/${reference}`);
  if (!isValidReference(reference)) notFound();

  const order = await getOrderByReference(reference);
  if (!order) notFound();

  const events = await getOrderEvents(order.id);
  const config = STATUS_CONFIG[order.status];

  return (
    <main className="min-h-screen bg-secondary/20 px-4 md:px-10 py-10">
      <div className="max-w-3xl mx-auto flex flex-col gap-6">
        <Link
          href="/admin/orders"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <Icon name="ArrowLeftIcon" size={12} />
          Back to queue
        </Link>

        {/* Summary */}
        <div className="card-warm p-8">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <p className="font-mono font-extrabold text-xl text-foreground mb-1">
                {order.reference}
              </p>
              <p className="text-sm text-muted-foreground">
                Requested {formatDateTime(order.createdAt)}
              </p>
            </div>
            <span
              className={`px-3 py-1.5 rounded-full text-xs font-semibold ${config.bg} ${config.color}`}
            >
              {config.label}
            </span>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
            {[
              ['Notes requested', String(order.items.length)],
              ['Customer', order.customerName],
              ['Email', order.customerEmail],
              ['Account', order.userId ? 'Registered customer' : 'Guest checkout'],
              [
                'WhatsApp',
                order.whatsappOptIn ? order.whatsapp : order.whatsapp ? 'Not opted in' : null,
              ],
              // Summed from the notes marked found and priced below — never
              // typed by hand, so the total and the breakdown cannot disagree.
              ['Total', formatPrice(order.pricePaise, order.currency)],
              ['Paid at', order.paidAt ? formatDateTime(order.paidAt) : null],
              ['Stripe session', order.stripeSessionId],
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

          {order.message && (
            <div className="mt-6 pt-6 border-t border-border">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                Customer message
              </p>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                {order.message}
              </p>
            </div>
          )}
        </div>

        {/* One control per requested note */}
        <div className="card-warm p-8">
          <h2 className="font-sans font-bold text-foreground text-sm uppercase tracking-wide mb-2">
            {order.items.length > 1 ? `The ${order.items.length} notes` : 'The note'}
          </h2>
          <p className="text-xs text-muted-foreground mb-5 leading-relaxed">
            Mark each one found or not found and give the found ones a price. The order total is the
            sum of what you price here.
          </p>
          <div className="flex flex-col gap-4">
            {order.items.map((item) => (
              <ItemActions key={item.id} order={order} item={item} />
            ))}
          </div>
        </div>

        {/* Fulfilment actions */}
        <div className="card-warm p-8">
          <h2 className="font-sans font-bold text-foreground text-sm uppercase tracking-wide mb-5">
            Update this order
          </h2>
          <StatusActions order={order} />
        </div>

        {/*
          The hold, shown only while there is one. A hold belongs to a
          confirmed, unpaid order — on anything else this panel would offer
          buttons that email a customer about a note they already own.
        */}
        {order.status === 'confirmed' && order.heldUntil && (
          <div className="card-warm p-8">
            <h2 className="font-sans font-bold text-foreground text-sm uppercase tracking-wide mb-5">
              The hold
            </h2>
            <HoldActions order={order} />
          </div>
        )}

        {/* Timeline */}
        <div className="card-warm p-8">
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
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      by {event.actor}
                    </span>
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

        <Link
          href={`/track-order/${order.reference}`}
          className="text-xs text-muted-foreground hover:text-foreground text-center"
        >
          View what the customer sees →
        </Link>
      </div>
    </main>
  );
}
