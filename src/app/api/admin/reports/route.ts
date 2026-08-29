import { getCurrentAdmin } from '@/lib/auth';
import { resolveRange } from '@/lib/report-range';
import {
  getSalesReport,
  getDemandReport,
  getFunnelReport,
  getSpeedReport,
  getCustomersReport,
  REPORT_KEYS,
  type ReportKey,
} from '@/lib/admin-reports';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * One CSV cell.
 *
 * Quotes everything and doubles inner quotes, rather than quoting only when a
 * comma appears: a customer name with a comma, a quote or a newline in it must
 * not shift every later column by one. The leading-character guard stops a
 * spreadsheet treating a value like "=1+1" or "+91…" as a formula — the cell
 * is data we did not write, and this is where it gets executed otherwise.
 */
function cell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const text = String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

function csv(headers: string[], rows: unknown[][]): string {
  return [headers.map(cell).join(','), ...rows.map((row) => row.map(cell).join(','))].join('\r\n');
}

/** Paise are stored as integers; a spreadsheet wants rupees. */
const money = (paise: number) => (paise / 100).toFixed(2);

/**
 * GET /api/admin/reports?report=sales&preset=30d — the on-screen report as CSV.
 *
 * Owner-only, matching the page: these are the business's figures, and staff
 * see the queue.
 */
export async function GET(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return new Response('Not authenticated.', { status: 401 });
  }
  if (admin.role !== 'owner') {
    return new Response('Not authorised.', { status: 403 });
  }

  const url = new URL(request.url);
  const report = url.searchParams.get('report') ?? '';
  if (!REPORT_KEYS.includes(report as ReportKey)) {
    return new Response(`Unknown report. Expected one of: ${REPORT_KEYS.join(', ')}.`, {
      status: 400,
    });
  }

  const range = resolveRange({
    preset: url.searchParams.get('preset') ?? undefined,
    from: url.searchParams.get('from') ?? undefined,
    to: url.searchParams.get('to') ?? undefined,
  });

  let body: string;
  switch (report as ReportKey) {
    case 'sales': {
      const data = await getSalesReport(range);
      body = csv(
        ['Period', 'Orders', 'Notes sold', `Revenue (${data.currency})`],
        data.periods.map((p) => [p.period, p.orders, p.notes, money(p.revenue)])
      );
      break;
    }
    case 'demand': {
      const data = await getDemandReport(range);
      body = csv(
        ['Group', 'Value', 'Requested', 'Available', 'Unavailable', 'Pending', 'Fill rate %'],
        [
          ...data.byDecade.map((g) => [
            'Decade',
            g.key,
            g.requested,
            g.available,
            g.unavailable,
            g.pending,
            g.fillRate ?? '',
          ]),
          ...data.byDenomination.map((g) => [
            'Denomination',
            g.key,
            g.requested,
            g.available,
            g.unavailable,
            g.pending,
            g.fillRate ?? '',
          ]),
          ...data.topMissing.map((d) => [
            'Missing date',
            d.displayDate,
            d.requested,
            '',
            d.unavailable,
            '',
            '',
          ]),
        ]
      );
      break;
    }
    case 'funnel': {
      const data = await getFunnelReport(range);
      body = csv(
        ['Stage', 'Orders', '% of requests'],
        [
          ...data.stages.map((s) => [s.label, s.count, s.ofRequests ?? '']),
          ['Confirmed but never paid', data.confirmedNotPaid, ''],
          ['Declared unavailable', data.declaredUnavailable, ''],
        ]
      );
      break;
    }
    case 'speed': {
      const data = await getSpeedReport(range);
      body = csv(
        ['Stage', 'Orders measured', 'Median hours', '90th percentile hours'],
        data.stages.map((s) => [s.label, s.samples, s.medianHours ?? '', s.p90Hours ?? ''])
      );
      break;
    }
    case 'customers': {
      const data = await getCustomersReport(range);
      body = csv(
        ['Name', 'Email', 'Paid orders', 'Revenue'],
        data.topCustomers.map((c) => [c.name, c.email, c.orders, money(c.revenue)])
      );
      break;
    }
  }

  const filename = `birthnote-${report}-${range.from}-to-${range.to}.csv`;
  return new Response(`\uFEFF${body}`, {
    headers: {
      // The BOM is what makes Excel read UTF-8 rather than mangling ₹ and any
      // non-ASCII name.
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
