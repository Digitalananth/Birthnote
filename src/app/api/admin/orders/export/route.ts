import { requireAdminApi } from '@/lib/admin-api';
import { listOrders, ORDER_STATUSES, type OrderStatus } from '@/lib/orders';
import { stateName } from '@/lib/india-gst';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** One CSV cell, quoted so a comma in an address cannot become a new column. */
function cell(value: string | number | null | undefined): string {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

const HEADERS = [
  'Reference',
  'Placed at',
  'Status',
  'Customer',
  'Email',
  'WhatsApp',
  'Notes',
  'Dates',
  'Goods',
  'Delivery',
  'Tax',
  'Total',
  'Currency',
  'Paid at',
  'Ship to',
  'City',
  'State',
  'Pincode',
  'Phone',
  'Courier',
  'AWB',
  'Shipment status',
  'Delivered at',
];

/**
 * GET /api/admin/orders/export — the order queue as CSV.
 *
 * Takes the same filters as the queue page and is linked from it, so what the
 * admin is looking at is exactly what downloads: filter first, then export.
 * Amounts are in rupees rather than paise, so the file adds up in a
 * spreadsheet without conversion.
 */
export async function GET(request: Request) {
  const auth = await requireAdminApi();
  if (auth.error) return auth.error;

  const url = new URL(request.url);
  const from = url.searchParams.get('from') || undefined;
  const to = url.searchParams.get('to') || undefined;
  const search = url.searchParams.get('q')?.trim() || undefined;
  const holdParam = url.searchParams.get('hold');
  const hold = holdParam === 'soon' || holdParam === 'lapsed' ? holdParam : undefined;
  const statusParam = url.searchParams.get('status');
  const status = ORDER_STATUSES.includes(statusParam as OrderStatus)
    ? (statusParam as OrderStatus)
    : undefined;

  // Deliberately not paged: an export of one screen of orders would be no use.
  // 200 is what `listOrders` will hand back at most, so the file is bounded.
  const { orders } = await listOrders({ status, hold, search, from, to, limit: 200 });

  const rows = orders.map((order) =>
    [
      order.reference,
      order.createdAt.slice(0, 19).replace('T', ' '),
      order.status,
      order.customerName,
      order.customerEmail,
      order.whatsapp ?? '',
      order.items.length,
      order.items.map((item) => item.displayDate).join(' | '),
      (order.pricePaise / 100).toFixed(2),
      (order.shippingPaise / 100).toFixed(2),
      (order.taxPaise / 100).toFixed(2),
      (order.totalPaise / 100).toFixed(2),
      order.currency,
      order.paidAt ? order.paidAt.slice(0, 19).replace('T', ' ') : '',
      order.shipping ? [order.shipping.line1, order.shipping.line2].filter(Boolean).join(', ') : '',
      order.shipping?.city ?? '',
      order.shipping ? `${stateName(order.shipping.stateCode)} (${order.shipping.stateCode})` : '',
      order.shipping?.pincode ?? '',
      order.shipping?.phone ?? '',
      order.courierName ?? '',
      order.trackingNumber ?? '',
      order.shipmentStatus ?? '',
      order.deliveredAt ? order.deliveredAt.slice(0, 19).replace('T', ' ') : '',
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
      'Content-Disposition': `attachment; filename="orders${period}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
