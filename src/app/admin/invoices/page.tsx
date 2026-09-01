import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import AdminNav from '@/app/admin/components/AdminNav';
import Icon from '@/components/ui/AppIcon';
import { requireOwner } from '@/lib/auth';
import { listInvoices } from '@/lib/invoices';
import { stateName } from '@/lib/india-gst';
import { formatPrice } from '@/lib/validation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Invoices — My Lucky Dates admin',
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ from?: string; to?: string }>;
}

/**
 * Every tax invoice raised, newest first, with the totals a return is filed
 * on.
 *
 * The CGST/SGST and IGST columns are kept apart rather than shown as one "tax"
 * figure, because that is the split GSTR-1 asks for and adding them together
 * here would only mean pulling them apart again later.
 */
export default async function AdminInvoicesPage({ searchParams }: PageProps) {
  const admin = await requireOwner('/admin/invoices');
  const { from, to } = await searchParams;
  const invoices = await listInvoices({ from, to });

  const totals = invoices.reduce(
    (sum, invoice) => ({
      taxable: sum.taxable + invoice.snapshot.subtotalPaise,
      cgst: sum.cgst + invoice.snapshot.cgstPaise,
      sgst: sum.sgst + invoice.snapshot.sgstPaise,
      igst: sum.igst + invoice.snapshot.igstPaise,
      total: sum.total + invoice.totalPaise,
    }),
    { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 }
  );

  const exportHref = `/api/admin/invoices/export${
    from || to
      ? `?${new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) })}`
      : ''
  }`;

  return (
    <main className="min-h-screen bg-secondary/20 px-4 md:px-10 py-10">
      <div className="max-w-5xl mx-auto">
        <AdminNav admin={admin} current="invoices" />

        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="font-sans font-extrabold text-2xl md:text-3xl text-foreground">
              Invoices
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {invoices.length} invoice{invoices.length === 1 ? '' : 's'}
              {from || to ? ' in this period' : ''}.
            </p>
          </div>

          {/* A plain GET form: the filter belongs in the URL so a period can be
              bookmarked and the export can be handed the same one. */}
          <form className="flex flex-wrap items-end gap-2" action="/admin/invoices">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                From
              </span>
              <input
                type="date"
                name="from"
                defaultValue={from}
                className="px-3 py-2 rounded-xl border border-border bg-background text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                To
              </span>
              <input
                type="date"
                name="to"
                defaultValue={to}
                className="px-3 py-2 rounded-xl border border-border bg-background text-sm"
              />
            </label>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-secondary text-foreground text-sm font-semibold hover:bg-secondary/70 transition-colors"
            >
              Filter
            </button>
            <a
              href={exportHref}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              <Icon name="ArrowDownTrayIcon" size={14} />
              CSV
            </a>
          </form>
        </div>

        {invoices.length === 0 ? (
          <div className="card-warm p-10 text-center">
            <p className="text-sm text-muted-foreground">
              No invoices in this period. One is raised automatically whenever an order is paid for.
            </p>
          </div>
        ) : (
          <div className="card-warm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-border">
                  {[
                    'Number',
                    'Date',
                    'Customer',
                    'Place of supply',
                    'Taxable',
                    'CGST',
                    'SGST',
                    'IGST',
                    'Total',
                  ].map((heading) => (
                    <th
                      key={heading}
                      className="px-4 py-3 text-[10px] uppercase tracking-wide font-bold text-muted-foreground whitespace-nowrap"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Link
                        href={`/invoice/${invoice.orderReference}`}
                        className="font-mono font-semibold text-primary hover:underline underline-offset-4"
                      >
                        {invoice.number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {invoice.issuedAt.slice(0, 10)}
                    </td>
                    <td className="px-4 py-3">{invoice.customerName}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {stateName(invoice.placeOfSupply)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {formatPrice(invoice.snapshot.subtotalPaise, 'INR')}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap text-muted-foreground">
                      {invoice.snapshot.cgstPaise
                        ? formatPrice(invoice.snapshot.cgstPaise, 'INR')
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap text-muted-foreground">
                      {invoice.snapshot.sgstPaise
                        ? formatPrice(invoice.snapshot.sgstPaise, 'INR')
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap text-muted-foreground">
                      {invoice.snapshot.igstPaise
                        ? formatPrice(invoice.snapshot.igstPaise, 'INR')
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap font-semibold">
                      {formatPrice(invoice.totalPaise, 'INR')}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border font-semibold">
                  <td className="px-4 py-3" colSpan={4}>
                    Total
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {formatPrice(totals.taxable, 'INR')}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {formatPrice(totals.cgst, 'INR')}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {formatPrice(totals.sgst, 'INR')}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {formatPrice(totals.igst, 'INR')}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {formatPrice(totals.total, 'INR')}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
