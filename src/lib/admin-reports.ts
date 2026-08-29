import 'server-only';
import type { RowDataPacket } from 'mysql2/promise';
import { query } from '@/lib/db';
import type { OrderStatus } from '@/lib/order-types';
import type { Granularity, ReportRange } from '@/lib/report-range';

/**
 * The five admin reports.
 *
 * Same discipline as admin-stats: the database groups and counts, Node does
 * not walk rows. The one deliberate exception is the turnaround percentiles —
 * see `getSpeedReport`.
 *
 * Every report is bounded by `range.from` (inclusive) and `range.toExclusive`,
 * both passed as parameters. No date is ever interpolated into SQL.
 */

export const REPORT_KEYS = ['sales', 'demand', 'funnel', 'speed', 'customers'] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

/** MySQL date formats per bucket width, and the label each produces. */
const BUCKET_FORMAT: Record<Granularity, string> = {
  day: '%Y-%m-%d',
  week: '%x-W%v',
  month: '%Y-%m',
};

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------

export interface SalesPeriod {
  period: string;
  orders: number;
  notes: number;
  revenue: number;
}

export interface SalesReport {
  periods: SalesPeriod[];
  totals: { orders: number; notes: number; revenue: number; averageOrder: number };
  previous: { orders: number; revenue: number };
  /** Percentage change against the previous equal-length range; null when it had none. */
  change: { orders: number | null; revenue: number | null };
  currency: string;
}

function percentChange(now: number, before: number): number | null {
  if (!before) return null;
  return Math.round(((now - before) / before) * 1000) / 10;
}

export async function getSalesReport(range: ReportRange): Promise<SalesReport> {
  const bucket = BUCKET_FORMAT[range.granularity];
  // Orders and notes are counted in separate queries and merged by period.
  // Joining items onto orders would repeat each order once per note, and no
  // amount of DISTINCT recovers the revenue total after that: two different
  // orders that happen to cost the same are indistinguishable to SUM(DISTINCT).
  const [periodRows, noteRows, totals, previous] = await Promise.all([
    query<(RowDataPacket & { period: string; orders: number; revenue: string })[]>(
      `SELECT DATE_FORMAT(paid_at, '${bucket}') AS period,
              COUNT(*) AS orders,
              SUM(price_paise) AS revenue
         FROM orders
        WHERE paid_at >= ? AND paid_at < ?
        GROUP BY period
        ORDER BY period`,
      [range.from, range.toExclusive]
    ),
    query<(RowDataPacket & { period: string; notes: number })[]>(
      `SELECT DATE_FORMAT(o.paid_at, '${bucket}') AS period, COUNT(*) AS notes
         FROM order_items i
         JOIN orders o ON o.id = i.order_id
        WHERE i.availability = 'available'
          AND o.paid_at >= ? AND o.paid_at < ?
        GROUP BY period`,
      [range.from, range.toExclusive]
    ),
    query<(RowDataPacket & { orders: number; notes: number; revenue: string; currency: string })[]>(
      `SELECT COUNT(*) AS orders,
              COALESCE(SUM(price_paise), 0) AS revenue,
              MIN(currency) AS currency,
              (SELECT COUNT(*) FROM order_items i
                 JOIN orders o2 ON o2.id = i.order_id
                WHERE i.availability = 'available'
                  AND o2.paid_at >= ? AND o2.paid_at < ?) AS notes
         FROM orders
        WHERE paid_at >= ? AND paid_at < ?`,
      [range.from, range.toExclusive, range.from, range.toExclusive]
    ),
    query<(RowDataPacket & { orders: number; revenue: string })[]>(
      `SELECT COUNT(*) AS orders, COALESCE(SUM(price_paise), 0) AS revenue
         FROM orders WHERE paid_at >= ? AND paid_at < ?`,
      [range.previous.from, range.previous.toExclusive]
    ),
  ]);

  const notesByPeriod = new Map(noteRows.map((row) => [row.period, Number(row.notes)]));
  const periods = periodRows.map((row) => ({
    period: row.period,
    orders: Number(row.orders),
    notes: notesByPeriod.get(row.period) ?? 0,
    revenue: Number(row.revenue),
  }));

  const total = totals[0];
  const orders = Number(total?.orders ?? 0);
  const revenue = Number(total?.revenue ?? 0);
  const prevOrders = Number(previous[0]?.orders ?? 0);
  const prevRevenue = Number(previous[0]?.revenue ?? 0);

  return {
    periods,
    totals: {
      orders,
      notes: Number(total?.notes ?? 0),
      revenue,
      averageOrder: orders ? Math.round(revenue / orders) : 0,
    },
    previous: { orders: prevOrders, revenue: prevRevenue },
    change: {
      orders: percentChange(orders, prevOrders),
      revenue: percentChange(revenue, prevRevenue),
    },
    currency: total?.currency ?? 'INR',
  };
}

// ---------------------------------------------------------------------------
// Demand and availability
// ---------------------------------------------------------------------------

export interface DemandGroup {
  key: string;
  requested: number;
  available: number;
  unavailable: number;
  pending: number;
  /** Share of *decided* notes that were available. Null while none are decided. */
  fillRate: number | null;
}

export interface MissingDate {
  noteDate: string;
  displayDate: string;
  requested: number;
  unavailable: number;
}

export interface DemandReport {
  byDecade: DemandGroup[];
  byDenomination: DemandGroup[];
  topMissing: MissingDate[];
  totals: DemandGroup;
}

/**
 * A fill rate over pending notes would read as failure for work not yet done,
 * so the denominator is decided notes only.
 */
function fillRate(available: number, unavailable: number): number | null {
  const decided = available + unavailable;
  return decided ? Math.round((available / decided) * 1000) / 10 : null;
}

const DEMAND_COLUMNS = `
  COUNT(*) AS requested,
  SUM(i.availability = 'available') AS available,
  SUM(i.availability = 'unavailable') AS unavailable,
  SUM(i.availability = 'pending') AS pending`;

interface DemandRow extends RowDataPacket {
  key: string | number | null;
  requested: number;
  available: number;
  unavailable: number;
  pending: number;
}

function mapDemand(row: DemandRow, fallback = 'Unspecified'): DemandGroup {
  const available = Number(row.available ?? 0);
  const unavailable = Number(row.unavailable ?? 0);
  return {
    key: row.key === null || row.key === '' ? fallback : String(row.key),
    requested: Number(row.requested ?? 0),
    available,
    unavailable,
    pending: Number(row.pending ?? 0),
    fillRate: fillRate(available, unavailable),
  };
}

export async function getDemandReport(range: ReportRange): Promise<DemandReport> {
  const [byDecade, byDenomination, topMissing, totals] = await Promise.all([
    query<DemandRow[]>(
      `SELECT CONCAT(FLOOR(YEAR(i.note_date) / 10) * 10, 's') AS \`key\`, ${DEMAND_COLUMNS}
         FROM order_items i
        WHERE i.created_at >= ? AND i.created_at < ?
        GROUP BY \`key\`
        ORDER BY \`key\``,
      [range.from, range.toExclusive]
    ),
    query<DemandRow[]>(
      `SELECT i.requested_denomination AS \`key\`, ${DEMAND_COLUMNS}
         FROM order_items i
        WHERE i.created_at >= ? AND i.created_at < ?
        GROUP BY \`key\`
        ORDER BY requested DESC`,
      [range.from, range.toExclusive]
    ),
    // The buying list: dates asked for that could not be supplied, commonest
    // first. Ordered by misses rather than requests — a date requested twice
    // and missed twice matters more than one requested ten times and filled.
    query<
      (RowDataPacket & {
        note_date: string;
        display_date: string;
        requested: number;
        unavailable: number;
      })[]
    >(
      `SELECT i.note_date, MIN(i.display_date) AS display_date,
              COUNT(*) AS requested,
              SUM(i.availability = 'unavailable') AS unavailable
         FROM order_items i
        WHERE i.created_at >= ? AND i.created_at < ?
        GROUP BY i.note_date
       HAVING unavailable > 0
        ORDER BY unavailable DESC, requested DESC
        LIMIT 25`,
      [range.from, range.toExclusive]
    ),
    query<DemandRow[]>(
      `SELECT 'All' AS \`key\`, ${DEMAND_COLUMNS}
         FROM order_items i WHERE i.created_at >= ? AND i.created_at < ?`,
      [range.from, range.toExclusive]
    ),
  ]);

  return {
    byDecade: byDecade.map((row) => mapDemand(row, 'Unknown')),
    byDenomination: byDenomination.map((row) => mapDemand(row, 'No preference')),
    topMissing: topMissing.map((row) => ({
      noteDate:
        typeof row.note_date === 'string'
          ? row.note_date.slice(0, 10)
          : new Date(row.note_date).toISOString().slice(0, 10),
      displayDate: row.display_date,
      requested: Number(row.requested),
      unavailable: Number(row.unavailable),
    })),
    totals: mapDemand(totals[0] ?? ({ key: 'All' } as DemandRow)),
  };
}

// ---------------------------------------------------------------------------
// Conversion funnel
// ---------------------------------------------------------------------------

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
  /** Share of the requests this cohort started with. */
  ofRequests: number | null;
}

export interface FunnelReport {
  stages: FunnelStage[];
  requests: number;
  /** Found and quoted, never paid for — the money left on the table. */
  confirmedNotPaid: number;
  declaredUnavailable: number;
}

/**
 * A cohort funnel: every order *created* in the range, and how far it got —
 * however long that took. Counting stages by event date instead would mix
 * cohorts and let a stage exceed the one above it.
 *
 * Each stage is "ever reached", so it includes the stages beyond it. An order
 * that jumped straight from pending to confirmed still counts as checked,
 * which keeps the funnel monotonic.
 */
export async function getFunnelReport(range: ReportRange): Promise<FunnelReport> {
  // The statuses are ORDER_STATUSES — a fixed internal vocabulary, never user
  // input — so they are written as literals against a column. That keeps the
  // only bound parameters in this query the two dates, where a mis-ordered
  // placeholder list would otherwise be easy to introduce and hard to see.
  const reached = (statuses: OrderStatus[]) =>
    `SUM(EXISTS (SELECT 1 FROM order_events e WHERE e.order_id = o.id AND e.status IN (${statuses
      .map((status) => `'${status}'`)
      .join(', ')})))`;

  const rows = await query<
    (RowDataPacket & {
      requests: number;
      checked: number;
      confirmed: number;
      paid: number;
      dispatched: number;
      unavailable: number;
      confirmed_not_paid: number;
    })[]
  >(
    `SELECT COUNT(*) AS requests,
            ${reached(['checking', 'confirmed', 'paid', 'shipped'])} AS checked,
            ${reached(['confirmed', 'paid', 'shipped'])} AS confirmed,
            ${reached(['paid', 'shipped'])} AS paid,
            ${reached(['shipped'])} AS dispatched,
            ${reached(['unavailable'])} AS unavailable,
            SUM(
              EXISTS (SELECT 1 FROM order_events e WHERE e.order_id = o.id
                       AND e.status IN ('confirmed', 'paid', 'shipped'))
              AND NOT EXISTS (SELECT 1 FROM order_events e WHERE e.order_id = o.id
                       AND e.status IN ('paid', 'shipped'))
            ) AS confirmed_not_paid
       FROM orders o
      WHERE o.created_at >= ? AND o.created_at < ?`,
    [range.from, range.toExclusive]
  );

  const row = rows[0];
  const requests = Number(row?.requests ?? 0);
  const share = (n: number) => (requests ? Math.round((n / requests) * 1000) / 10 : null);
  const stage = (key: string, label: string, count: number): FunnelStage => ({
    key,
    label,
    count,
    ofRequests: share(count),
  });

  return {
    stages: [
      stage('requests', 'Requests received', requests),
      stage('checked', 'Collection checked', Number(row?.checked ?? 0)),
      stage('confirmed', 'Confirmed available', Number(row?.confirmed ?? 0)),
      stage('paid', 'Paid', Number(row?.paid ?? 0)),
      stage('dispatched', 'Dispatched', Number(row?.dispatched ?? 0)),
    ],
    requests,
    confirmedNotPaid: Number(row?.confirmed_not_paid ?? 0),
    declaredUnavailable: Number(row?.unavailable ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Fulfilment speed
// ---------------------------------------------------------------------------

export interface SpeedStage {
  key: string;
  label: string;
  samples: number;
  medianHours: number | null;
  p90Hours: number | null;
}

export interface SpeedReport {
  stages: SpeedStage[];
  /** Hours the longest still-unanswered request has been waiting. */
  oldestWaitingHours: number | null;
  oldestWaitingReference: string | null;
}

/**
 * Percentiles are computed here, not in SQL.
 *
 * MariaDB has PERCENTILE_CONT and MySQL does not, and the syntax differs
 * between them; a report that works on the server and not on a developer's
 * machine is a report nobody can change safely. The query returns one row per
 * order in the range — a bounded set, already filtered by date — and the
 * sorting is a few hundred numbers.
 */
function percentile(sorted: number[], fraction: number): number | null {
  if (!sorted.length) return null;
  const index = Math.min(Math.floor(fraction * sorted.length), sorted.length - 1);
  return Math.round(sorted[index] * 10) / 10;
}

export async function getSpeedReport(range: ReportRange): Promise<SpeedReport> {
  const [rows, waiting] = await Promise.all([
    query<
      (RowDataPacket & {
        created_at: Date;
        confirmed_at: Date | null;
        paid_at: Date | null;
        shipped_at: Date | null;
      })[]
    >(
      `SELECT o.created_at,
              MIN(CASE WHEN e.status = 'confirmed' THEN e.created_at END) AS confirmed_at,
              MIN(CASE WHEN e.status = 'paid'      THEN e.created_at END) AS paid_at,
              MIN(CASE WHEN e.status = 'shipped'   THEN e.created_at END) AS shipped_at
         FROM orders o
         JOIN order_events e ON e.order_id = o.id
        WHERE o.created_at >= ? AND o.created_at < ?
        GROUP BY o.id, o.created_at`,
      [range.from, range.toExclusive]
    ),
    query<(RowDataPacket & { reference: string; hours: string })[]>(
      `SELECT reference, TIMESTAMPDIFF(MINUTE, created_at, UTC_TIMESTAMP()) / 60 AS hours
         FROM orders
        WHERE status IN ('pending','checking')
        ORDER BY created_at ASC
        LIMIT 1`
    ),
  ]);

  const hoursBetween = (a: Date | null, b: Date | null): number | null =>
    a && b ? (b.getTime() - a.getTime()) / 3_600_000 : null;

  const buckets: Record<string, number[]> = { confirm: [], pay: [], dispatch: [] };
  for (const row of rows) {
    const spans: [string, number | null][] = [
      ['confirm', hoursBetween(row.created_at, row.confirmed_at)],
      ['pay', hoursBetween(row.confirmed_at, row.paid_at)],
      ['dispatch', hoursBetween(row.paid_at, row.shipped_at)],
    ];
    for (const [key, value] of spans) {
      // A negative span means the events were written out of order; that is a
      // data problem, not a fast order, and averaging it in would hide it.
      if (value !== null && value >= 0) buckets[key].push(value);
    }
  }

  const stage = (key: string, label: string): SpeedStage => {
    const sorted = buckets[key].slice().sort((a, b) => a - b);
    return {
      key,
      label,
      samples: sorted.length,
      medianHours: percentile(sorted, 0.5),
      p90Hours: percentile(sorted, 0.9),
    };
  };

  return {
    stages: [
      stage('confirm', 'Request → confirmed'),
      stage('pay', 'Confirmed → paid'),
      stage('dispatch', 'Paid → dispatched'),
    ],
    oldestWaitingHours: waiting[0] ? Math.round(Number(waiting[0].hours) * 10) / 10 : null,
    oldestWaitingReference: waiting[0]?.reference ?? null,
  };
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export interface TopCustomer {
  name: string;
  email: string;
  orders: number;
  revenue: number;
  currency: string;
}

export interface CustomersReport {
  newAccounts: number;
  ordersFromNew: number;
  ordersFromReturning: number;
  repeatRate: number | null;
  topCustomers: TopCustomer[];
}

/**
 * "Returning" means the customer had an earlier order than this one, at any
 * time — not merely earlier within the range. A customer of two years who
 * orders again this week is returning, and a range boundary must not make
 * them look new.
 *
 * Customers are keyed by email rather than user_id: orders placed before
 * accounts existed, and guest orders, have no user_id but are the same person.
 */
export async function getCustomersReport(range: ReportRange): Promise<CustomersReport> {
  const [accounts, split, repeat, top] = await Promise.all([
    query<(RowDataPacket & { n: number })[]>(
      'SELECT COUNT(*) AS n FROM users WHERE created_at >= ? AND created_at < ?',
      [range.from, range.toExclusive]
    ),
    query<(RowDataPacket & { returning_orders: number; total: number })[]>(
      `SELECT COUNT(*) AS total,
              SUM(EXISTS (SELECT 1 FROM orders p
                           WHERE p.customer_email = o.customer_email
                             AND p.created_at < o.created_at)) AS returning_orders
         FROM orders o
        WHERE o.created_at >= ? AND o.created_at < ?`,
      [range.from, range.toExclusive]
    ),
    query<(RowDataPacket & { customers: number; repeaters: number })[]>(
      `SELECT COUNT(*) AS customers, SUM(orders > 1) AS repeaters FROM (
         SELECT customer_email, COUNT(*) AS orders FROM orders GROUP BY customer_email
       ) t`
    ),
    query<
      (RowDataPacket & {
        customer_name: string;
        customer_email: string;
        orders: number;
        revenue: string;
        currency: string;
      })[]
    >(
      `SELECT MAX(customer_name) AS customer_name, customer_email,
              COUNT(*) AS orders, SUM(price_paise) AS revenue, MIN(currency) AS currency
         FROM orders
        WHERE paid_at >= ? AND paid_at < ?
        GROUP BY customer_email
        ORDER BY revenue DESC
        LIMIT 10`,
      [range.from, range.toExclusive]
    ),
  ]);

  const total = Number(split[0]?.total ?? 0);
  const returningOrders = Number(split[0]?.returning_orders ?? 0);
  const customers = Number(repeat[0]?.customers ?? 0);

  return {
    newAccounts: Number(accounts[0]?.n ?? 0),
    ordersFromNew: total - returningOrders,
    ordersFromReturning: returningOrders,
    repeatRate: customers
      ? Math.round((Number(repeat[0]?.repeaters ?? 0) / customers) * 1000) / 10
      : null,
    topCustomers: top.map((row) => ({
      name: row.customer_name,
      email: row.customer_email,
      orders: Number(row.orders),
      revenue: Number(row.revenue),
      currency: row.currency ?? 'INR',
    })),
  };
}

export interface AllReports {
  sales: SalesReport;
  demand: DemandReport;
  funnel: FunnelReport;
  speed: SpeedReport;
  customers: CustomersReport;
}

export async function getAllReports(range: ReportRange): Promise<AllReports> {
  const [sales, demand, funnel, speed, customers] = await Promise.all([
    getSalesReport(range),
    getDemandReport(range),
    getFunnelReport(range),
    getSpeedReport(range),
    getCustomersReport(range),
  ]);
  return { sales, demand, funnel, speed, customers };
}
