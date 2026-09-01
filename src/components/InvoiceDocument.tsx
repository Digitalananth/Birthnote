import React from 'react';
import type { InvoiceSnapshot } from '@/lib/invoice-types';

/**
 * The tax invoice itself.
 *
 * Renders nothing but the stored snapshot — no settings are read here, so a
 * document printed a year from now is the document that was issued. It is
 * plain HTML with print styles rather than a generated PDF: the browser's own
 * "Save as PDF" produces a better file than a server-side renderer would, it
 * needs no fonts shipped or headless browser running, and the page is legible
 * on a phone, which a PDF is not.
 *
 * The layout follows what Rule 46 of the CGST Rules expects on the face of an
 * invoice: both parties with their GSTINs, the place of supply, HSN/SAC per
 * line, the rate and amount of each tax component, and the total in words.
 */
function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function InvoiceDocument({ invoice }: { invoice: InvoiceSnapshot }) {
  const taxColumns = invoice.interState ? 1 : 2;

  return (
    <article className="invoice-sheet bg-white text-[#1a1a1a] mx-auto max-w-3xl p-8 md:p-12 rounded-2xl border border-black/10 print:border-0 print:rounded-none print:p-0 print:max-w-none">
      <header className="flex flex-wrap items-start justify-between gap-6 pb-6 border-b-2 border-black/80">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] font-bold">Tax Invoice</p>
          <h1 className="text-xl font-extrabold mt-1">{invoice.seller.name}</h1>
          {invoice.seller.legalName && invoice.seller.legalName !== invoice.seller.name && (
            <p className="text-xs text-black/60">{invoice.seller.legalName}</p>
          )}
          <div className="text-xs leading-relaxed mt-2 text-black/70">
            {invoice.seller.address.map((line) => (
              <div key={line}>{line}</div>
            ))}
            <div>{invoice.seller.stateName}</div>
            {invoice.seller.email && <div>{invoice.seller.email}</div>}
            {invoice.seller.phone && <div>{invoice.seller.phone}</div>}
          </div>
          <p className="text-xs font-semibold mt-2">GSTIN: {invoice.seller.gstin}</p>
        </div>

        <dl className="text-xs text-right">
          <dt className="text-black/50 uppercase tracking-wide">Invoice number</dt>
          <dd className="font-mono font-bold text-sm mb-2">{invoice.number}</dd>
          <dt className="text-black/50 uppercase tracking-wide">Date</dt>
          <dd className="font-semibold mb-2">{formatDate(invoice.issuedAt)}</dd>
          <dt className="text-black/50 uppercase tracking-wide">Order</dt>
          <dd className="font-mono font-semibold">{invoice.orderReference}</dd>
        </dl>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-6 py-6 border-b border-black/20">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-black/50 font-bold mb-1">
            Billed and shipped to
          </p>
          <p className="font-semibold text-sm">{invoice.buyer.name}</p>
          <div className="text-xs leading-relaxed text-black/70 mt-1">
            {invoice.buyer.address.map((line) => (
              <div key={line}>{line}</div>
            ))}
            {invoice.buyer.email && <div>{invoice.buyer.email}</div>}
          </div>
          {invoice.buyer.gstin && (
            <p className="text-xs font-semibold mt-1">GSTIN: {invoice.buyer.gstin}</p>
          )}
        </div>
        <div className="sm:text-right">
          <p className="text-[10px] uppercase tracking-widest text-black/50 font-bold mb-1">
            Place of supply
          </p>
          <p className="font-semibold text-sm">
            {invoice.placeOfSupply.name} ({invoice.placeOfSupply.code})
          </p>
          <p className="text-xs text-black/60 mt-1">
            {invoice.interState
              ? 'Inter-state supply — IGST'
              : 'Intra-state supply — CGST and SGST'}
          </p>
        </div>
      </section>

      {/* A table is the right element here: this is tabular data, and a tax
          officer reading it expects columns that line up. */}
      <div className="overflow-x-auto py-6">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-left border-b border-black/40">
              <th className="py-2 pr-2 font-bold">Description</th>
              <th className="py-2 px-2 font-bold">HSN/SAC</th>
              <th className="py-2 px-2 font-bold text-right">Taxable</th>
              <th className="py-2 px-2 font-bold text-right">Rate</th>
              {invoice.interState ? (
                <th className="py-2 px-2 font-bold text-right">IGST</th>
              ) : (
                <>
                  <th className="py-2 px-2 font-bold text-right">CGST</th>
                  <th className="py-2 px-2 font-bold text-right">SGST</th>
                </>
              )}
              <th className="py-2 pl-2 font-bold text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line, index) => (
              <tr
                key={`${line.description}-${index}`}
                className="border-b border-black/10 align-top"
              >
                <td className="py-2 pr-2">{line.description}</td>
                <td className="py-2 px-2 font-mono">{line.code}</td>
                <td className="py-2 px-2 text-right">{rupees(line.taxablePaise)}</td>
                <td className="py-2 px-2 text-right">{line.ratePercent}%</td>
                {invoice.interState ? (
                  <td className="py-2 px-2 text-right">{rupees(line.igstPaise)}</td>
                ) : (
                  <>
                    <td className="py-2 px-2 text-right">{rupees(line.cgstPaise)}</td>
                    <td className="py-2 px-2 text-right">{rupees(line.sgstPaise)}</td>
                  </>
                )}
                <td className="py-2 pl-2 text-right font-semibold">{rupees(line.totalPaise)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3 + taxColumns} className="py-2 text-right text-black/60">
                Taxable value
              </td>
              <td colSpan={2} className="py-2 pl-2 text-right">
                {rupees(invoice.subtotalPaise)}
              </td>
            </tr>
            {invoice.interState ? (
              <tr>
                <td colSpan={3 + taxColumns} className="py-1 text-right text-black/60">
                  IGST
                </td>
                <td colSpan={2} className="py-1 pl-2 text-right">
                  {rupees(invoice.igstPaise)}
                </td>
              </tr>
            ) : (
              <>
                <tr>
                  <td colSpan={3 + taxColumns} className="py-1 text-right text-black/60">
                    CGST
                  </td>
                  <td colSpan={2} className="py-1 pl-2 text-right">
                    {rupees(invoice.cgstPaise)}
                  </td>
                </tr>
                <tr>
                  <td colSpan={3 + taxColumns} className="py-1 text-right text-black/60">
                    SGST
                  </td>
                  <td colSpan={2} className="py-1 pl-2 text-right">
                    {rupees(invoice.sgstPaise)}
                  </td>
                </tr>
              </>
            )}
            <tr className="border-t-2 border-black/80">
              <td colSpan={3 + taxColumns} className="py-2 text-right font-bold">
                Total
              </td>
              <td colSpan={2} className="py-2 pl-2 text-right font-bold text-sm">
                {rupees(invoice.totalPaise)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <section className="py-4 border-t border-black/20 text-xs">
        <p className="mb-3">
          <span className="text-black/50 uppercase tracking-wide">Amount in words: </span>
          <span className="font-semibold">{invoice.totalInWords}</span>
        </p>
        {invoice.paidAt && (
          <p className="text-black/60">
            Paid in full on {formatDate(invoice.paidAt)}. This is a receipt as well as an invoice.
          </p>
        )}
      </section>

      {invoice.terms && (
        <section className="pt-4 border-t border-black/20 text-[11px] text-black/60 leading-relaxed whitespace-pre-wrap">
          {invoice.terms}
        </section>
      )}

      <footer className="pt-6 mt-4 text-[11px] text-black/50 flex flex-wrap justify-between gap-4">
        <p>Computer-generated invoice. No signature required.</p>
        <p>{invoice.number}</p>
      </footer>
    </article>
  );
}
