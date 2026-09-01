import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import InvoiceDocument from '@/components/InvoiceDocument';
import PrintButton from '@/app/invoice/components/PrintButton';
import { getOrderByReference } from '@/lib/orders';
import { getInvoiceForOrder } from '@/lib/invoices';
import { isValidReference } from '@/lib/validation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PageProps {
  params: Promise<{ reference: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { reference } = await params;
  return {
    title: `Invoice for ${reference.toUpperCase()} — My Lucky Dates`,
    robots: { index: false, follow: false },
  };
}

/**
 * The customer's copy of their tax invoice.
 *
 * Reachable by whoever holds the order reference, exactly as the tracking and
 * payment pages are — the reference is the capability, and requiring an
 * account here would lock guests out of their own invoice.
 *
 * There is nothing to see before payment: an invoice is raised when the money
 * arrives, so an unpaid order is told that rather than shown an empty one.
 */
export default async function InvoicePage({ params }: PageProps) {
  const { reference } = await params;
  if (!isValidReference(reference)) notFound();

  const order = await getOrderByReference(reference);
  if (!order) notFound();

  const invoice = await getInvoiceForOrder(order.id);

  if (!invoice) {
    return (
      <main className="min-h-screen bg-secondary/20 px-6 py-16">
        <div className="max-w-md mx-auto card-warm p-10 text-center">
          <div className="w-14 h-14 rounded-full bg-accent/15 flex items-center justify-center mx-auto mb-5">
            <Icon name="DocumentTextIcon" size={26} className="text-accent" />
          </div>
          <h1 className="font-sans font-extrabold text-xl text-foreground mb-2">No invoice yet.</h1>
          <p className="text-sm text-muted-foreground leading-relaxed mb-6">
            An invoice is raised once payment has gone through. We will email you a link to it as
            soon as it has.
          </p>
          <Link
            href={`/track-order/${order.reference}`}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <Icon name="MagnifyingGlassIcon" size={15} />
            Track this order
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-secondary/20 py-10 px-4 print:bg-white print:p-0">
      <div className="max-w-3xl mx-auto flex items-center justify-between mb-6 print:hidden">
        <Link
          href={`/track-order/${order.reference}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <Icon name="ArrowLeftIcon" size={12} />
          Back to your order
        </Link>
        <PrintButton />
      </div>

      <InvoiceDocument invoice={invoice.snapshot} />
    </main>
  );
}
