import { requireOwnerApi } from '@/lib/admin-api';
import { listInvoices } from '@/lib/invoices';
import { stateName } from '@/lib/india-gst';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** One CSV cell, quoted so a comma in an address cannot become a new column. */
function cell(value: string | number | null | undefined): string {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

const HEADERS = [
  'Invoice number',
  'Invoice date',
  'Order reference',
  'Customer',
  'Buyer GSTIN',
  'Place of supply',
  'Supply type',
  'Taxable value',
  'CGST',
  'SGST',
  'IGST',
  'Total',
];

/**
 * GET /api/admin/invoices/export — the issued invoices as CSV.
 *
 * Laid out the way a GST return wants them: one row per invoice, taxable value
 * and each tax head in its own column, amounts in rupees rather than paise so
 * the file opens in a spreadsheet and adds up without conversion.
 *
 * `from` and `to` are inclusive dates, because a return is filed for a period.
 */
export async function GET(request: Request) {
  const auth = await requireOwnerApi();
  if (auth.error) return auth.error;

  const url = new URL(request.url);
  const from = url.searchParams.get('from') || undefined;
  const to = url.searchParams.get('to') || undefined;

  const invoices = await listInvoices({ from, to, limit: 2000 });

  const rows = invoices.map((invoice) =>
    [
      invoice.number,
      invoice.issuedAt.slice(0, 10),
      invoice.orderReference,
      invoice.snapshot.buyer.name,
      invoice.snapshot.buyer.gstin ?? '',
      `${stateName(invoice.placeOfSupply)} (${invoice.placeOfSupply})`,
      invoice.interState ? 'Inter-state' : 'Intra-state',
      (invoice.snapshot.subtotalPaise / 100).toFixed(2),
      (invoice.snapshot.cgstPaise / 100).toFixed(2),
      (invoice.snapshot.sgstPaise / 100).toFixed(2),
      (invoice.snapshot.igstPaise / 100).toFixed(2),
      (invoice.totalPaise / 100).toFixed(2),
    ]
      .map(cell)
      .join(',')
  );

  const period = from || to ? `-${from ?? 'start'}-to-${to ?? 'today'}` : '';
  // The BOM is what makes Excel read the rupee sign and Indian names as UTF-8
  // rather than mojibake.
  const csv = `\uFEFF${HEADERS.map(cell).join(',')}\n${rows.join('\n')}\n`;

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="invoices${period}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
