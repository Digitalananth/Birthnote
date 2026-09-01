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
import { groupOrderItems } from '@/lib/order-types';
import OrderTotals from '@/components/OrderTotals';
import InvoicePanel from '@/app/admin/components/InvoicePanel';
import { getInvoiceForOrder } from '@/lib/invoices';
import { listOptions } from '@/lib/master-options';
import { stateName } from '@/lib/india-gst';

/** Rendering strategy: SSR — always the live record. */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PageProps {
  params: Promise<{ reference: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { reference } = await params;
  return {
    title: `${reference.toUpperCase()} — My Lucky Dates admin`,
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
  const invoice = await getInvoiceForOrder(order.id);
  // The grades this shop uses, so every note is described the same way.
  const conditions = (await listOptions('note_condition'))
    .filter((option) => option.isActive)
    .map((option) => option.value);
  const groups = groupOrderItems(order.items);
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
              ['Total charged', formatPrice(order.totalPaise, order.currency)],
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

          {/* The money, broken up as the invoice breaks it up. */}
          {order.pricePaise > 0 && (
            <div className="mt-6 pt-6 border-t border-border max-w-sm">
              <OrderTotals order={order} />
            </div>
          )}

          {/* Where it is going, and therefore how it is taxed. */}
          {order.shipping && (
            <div className="mt-6 pt-6 border-t border-border">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                Delivery address
              </p>
              <address className="not-italic text-sm text-foreground leading-relaxed">
                {order.shipping.name}
                <br />
                {order.shipping.line1}
                {order.shipping.line2 && (
                  <>
                    <br />
                    {order.shipping.line2}
                  </>
                )}
                <br />
                {order.shipping.city} {order.shipping.pincode}
                <br />
                {stateName(order.shipping.stateCode)}
                {order.shipping.phone && (
                  <>
                    <br />
                    {order.shipping.phone}
                  </>
                )}
              </address>
              {order.buyerGstin && (
                <p className="text-xs text-muted-foreground mt-1">Buyer GSTIN {order.buyerGstin}</p>
              )}
            </div>
          )}

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

        {/*
          One card per request block, not one long list of notes.

          The form asks for a date, a recipient, and every denomination wanted
          for that date; the order then stores one row per note. Flattened, an
          order for two dates read as seven unrelated lines and the admin had to
          work out for themselves which belonged together. Each block gets its
          own card, numbered and headed by what was asked for, with its own
          tally — so "three of these four are found, and they come to ₹1,200" is
          readable without adding anything up.
        */}
        <div className="flex flex-col gap-6">
          <div>
            <h2 className="font-sans font-bold text-foreground text-sm uppercase tracking-wide">
              {groups.length > 1 ? `${groups.length} requests` : 'The request'} ·{' '}
              {order.items.length === 1 ? '1 note' : `${order.items.length} notes`}
            </h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Mark each note found or not found and give the found ones a price. The order total is
              the sum of what you price here.
            </p>
          </div>

          {groups.map((group, index) => {
            const found = group.items.filter((item) => item.availability === 'available');
            const missing = group.items.filter((item) => item.availability === 'unavailable');
            const waiting = group.items.length - found.length - missing.length;
            // Only what has actually been priced — a found note with no price
            // yet contributes nothing, which is the truth rather than a zero.
            const subtotal = found.reduce((sum, item) => sum + (item.pricePaise ?? 0), 0);

            return (
              <section key={group.key} className="card-warm overflow-hidden">
                <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-6 py-4 bg-secondary/30 border-b border-border">
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-widest font-bold text-primary mb-1">
                      Request {index + 1}
                      {groups.length > 1 ? ` of ${groups.length}` : ''} ·{' '}
                      {group.items.length === 1 ? '1 note' : `${group.items.length} notes`}
                    </p>
                    <p className="font-mono font-bold text-foreground tracking-wide">
                      {group.displayDate}
                    </p>
                    {(group.giftRelationship || group.giftFor) && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {group.giftRelationship && `For ${group.giftRelationship.toLowerCase()}`}
                        {group.giftFor && ` — ${group.giftFor}`}
                      </p>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <p className="flex flex-wrap justify-end gap-x-2 text-xs font-semibold">
                      {found.length > 0 && (
                        <span className="text-green-700">{found.length} found</span>
                      )}
                      {missing.length > 0 && (
                        <span className="text-red-600">{missing.length} not found</span>
                      )}
                      {waiting > 0 && (
                        <span className="text-muted-foreground">{waiting} to check</span>
                      )}
                    </p>
                    {subtotal > 0 && (
                      <p className="text-sm font-bold text-foreground mt-1">
                        {formatPrice(subtotal, order.currency)}
                      </p>
                    )}
                  </div>
                </header>

                <div className="flex flex-col gap-4 p-6">
                  {group.items.map((item) => (
                    <ItemActions key={item.id} order={order} item={item} conditions={conditions} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        {/* The invoice */}
        <div className="card-warm p-8">
          <h2 className="font-sans font-bold text-foreground text-sm uppercase tracking-wide mb-5">
            Tax invoice
          </h2>
          <InvoicePanel
            reference={order.reference}
            invoiceNumber={invoice?.number ?? null}
            canIssue={order.status === 'paid' || order.status === 'shipped'}
          />
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
