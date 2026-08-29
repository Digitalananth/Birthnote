import 'server-only';
import type { RowDataPacket } from 'mysql2/promise';
import { query } from '@/lib/db';
import { recentErrors, type RecordedError } from '@/server/errors';
import type { OrderStatus } from '@/lib/order-types';

/**
 * The numbers behind /admin.
 *
 * Every figure here is a GROUP BY in the database, never a row loop in Node:
 * the dashboard must cost the same when there are ten thousand orders as it
 * does today. `getDashboardStats` runs the lot in parallel — they share a
 * pool, and none of them depends on another's result.
 *
 * Dates are handled in the database's own clock (UTC_TIMESTAMP / CURDATE) so
 * a "last 30 days" window means the same thing whichever process asks.
 */

export interface DailyPoint {
  /** YYYY-MM-DD */
  date: string;
  created: number;
  paid: number;
}

export interface AttentionOrder {
  reference: string;
  customerName: string;
  status: OrderStatus;
  pricePaise: number;
  currency: string;
  /** Notes still awaiting an availability decision on this order. */
  pendingItems: number;
  createdAt: string;
}

export interface DashboardStats {
  revenue: { last7: number; last30: number; allTime: number; currency: string };
  paidOrders: { last7: number; last30: number };
  statusCounts: Record<OrderStatus, number>;
  totalOrders: number;
  daily: DailyPoint[];
  pendingItems: number;
  awaitingDispatch: number;
  newCustomers30: number;
  content: { draftPages: number; draftPosts: number };
  needsAvailability: AttentionOrder[];
  needsDispatch: AttentionOrder[];
  errors24h: number;
  latestErrors: RecordedError[];
}

/** The window every "last 30 days" figure on the dashboard shares. */
export const WINDOW_DAYS = 30;

interface CountRow extends RowDataPacket {
  n: number;
}

interface AttentionRow extends RowDataPacket {
  reference: string;
  customer_name: string;
  status: OrderStatus;
  price_paise: number;
  currency: string;
  pending_items: number;
  created_at: Date;
}

function mapAttention(row: AttentionRow): AttentionOrder {
  return {
    reference: row.reference,
    customerName: row.customer_name,
    status: row.status,
    pricePaise: row.price_paise,
    currency: row.currency,
    pendingItems: Number(row.pending_items ?? 0),
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * One row per day for the last WINDOW_DAYS, including days with no orders.
 *
 * MySQL has no generate_series, so the two aggregates are read as sparse maps
 * and the gaps are filled here. Filling in SQL would need a calendar table for
 * what is thirty iterations of a loop.
 */
function buildSeries(created: Map<string, number>, paid: Map<string, number>): DailyPoint[] {
  const points: DailyPoint[] = [];
  const today = new Date();
  for (let offset = WINDOW_DAYS - 1; offset >= 0; offset -= 1) {
    const day = new Date(today);
    day.setUTCDate(day.getUTCDate() - offset);
    const key = day.toISOString().slice(0, 10);
    points.push({ date: key, created: created.get(key) ?? 0, paid: paid.get(key) ?? 0 });
  }
  return points;
}

function toMap(rows: (RowDataPacket & { day: string; n: number })[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    // DATE columns come back as a string under this driver config, but a Date
    // under another; normalise rather than trust the shape.
    const key =
      typeof row.day === 'string'
        ? row.day.slice(0, 10)
        : new Date(row.day).toISOString().slice(0, 10);
    map.set(key, Number(row.n));
  }
  return map;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const [
    revenueRows,
    statusRows,
    createdRows,
    paidRows,
    pendingItemRows,
    dispatchRows,
    customerRows,
    contentRows,
    availabilityQueue,
    dispatchQueue,
    errorRows,
    latestErrors,
  ] = await Promise.all([
    // One pass over the paid orders for all three revenue windows: SUM with a
    // CASE is a single scan where three queries would be three.
    query<
      (RowDataPacket & {
        last7: string | null;
        last30: string | null;
        all_time: string | null;
        paid7: number;
        paid30: number;
        currency: string | null;
      })[]
    >(
      `SELECT
         SUM(CASE WHEN paid_at >= UTC_TIMESTAMP() - INTERVAL 7 DAY  THEN price_paise ELSE 0 END) AS last7,
         SUM(CASE WHEN paid_at >= UTC_TIMESTAMP() - INTERVAL 30 DAY THEN price_paise ELSE 0 END) AS last30,
         SUM(price_paise) AS all_time,
         SUM(CASE WHEN paid_at >= UTC_TIMESTAMP() - INTERVAL 7 DAY  THEN 1 ELSE 0 END) AS paid7,
         SUM(CASE WHEN paid_at >= UTC_TIMESTAMP() - INTERVAL 30 DAY THEN 1 ELSE 0 END) AS paid30,
         MIN(currency) AS currency
       FROM orders WHERE paid_at IS NOT NULL`
    ),
    query<(RowDataPacket & { status: OrderStatus; n: number })[]>(
      'SELECT status, COUNT(*) AS n FROM orders GROUP BY status'
    ),
    query<(RowDataPacket & { day: string; n: number })[]>(
      `SELECT DATE(created_at) AS day, COUNT(*) AS n FROM orders
        WHERE created_at >= UTC_TIMESTAMP() - INTERVAL ? DAY
        GROUP BY day`,
      [WINDOW_DAYS]
    ),
    query<(RowDataPacket & { day: string; n: number })[]>(
      `SELECT DATE(paid_at) AS day, COUNT(*) AS n FROM orders
        WHERE paid_at >= UTC_TIMESTAMP() - INTERVAL ? DAY
        GROUP BY day`,
      [WINDOW_DAYS]
    ),
    // Only notes on orders still being worked. A pending item under a
    // cancelled or dispatched order is history, not a job.
    query<CountRow[]>(
      `SELECT COUNT(*) AS n FROM order_items i
         JOIN orders o ON o.id = i.order_id
        WHERE i.availability = 'pending' AND o.status IN ('pending','checking')`
    ),
    query<CountRow[]>(
      `SELECT COUNT(*) AS n FROM orders
        WHERE status = 'paid' AND tracking_number IS NULL`
    ),
    query<CountRow[]>(
      `SELECT COUNT(*) AS n FROM users WHERE created_at >= UTC_TIMESTAMP() - INTERVAL ? DAY`,
      [WINDOW_DAYS]
    ),
    query<(RowDataPacket & { draft_pages: number; draft_posts: number })[]>(
      `SELECT
         (SELECT COUNT(*) FROM pages WHERE status = 'draft')      AS draft_pages,
         (SELECT COUNT(*) FROM blog_posts WHERE status = 'draft') AS draft_posts`
    ),
    query<AttentionRow[]>(
      `SELECT o.reference, o.customer_name, o.status, o.price_paise, o.currency, o.created_at,
              COUNT(i.id) AS pending_items
         FROM orders o
         JOIN order_items i ON i.order_id = o.id AND i.availability = 'pending'
        WHERE o.status IN ('pending','checking')
        GROUP BY o.id
        ORDER BY o.created_at ASC
        LIMIT 5`
    ),
    query<AttentionRow[]>(
      `SELECT reference, customer_name, status, price_paise, currency, created_at,
              0 AS pending_items
         FROM orders
        WHERE status = 'paid' AND tracking_number IS NULL
        ORDER BY paid_at ASC
        LIMIT 5`
    ),
    query<CountRow[]>(
      'SELECT COUNT(*) AS n FROM app_errors WHERE created_at >= UTC_TIMESTAMP() - INTERVAL 1 DAY'
    ),
    recentErrors(5),
  ]);

  const revenue = revenueRows[0];
  const statusCounts = {} as Record<OrderStatus, number>;
  let totalOrders = 0;
  for (const row of statusRows) {
    statusCounts[row.status] = Number(row.n);
    totalOrders += Number(row.n);
  }

  return {
    revenue: {
      // SUM returns a DECIMAL string in mysql2, and NULL when nothing matched.
      last7: Number(revenue?.last7 ?? 0),
      last30: Number(revenue?.last30 ?? 0),
      allTime: Number(revenue?.all_time ?? 0),
      currency: revenue?.currency ?? 'INR',
    },
    paidOrders: { last7: Number(revenue?.paid7 ?? 0), last30: Number(revenue?.paid30 ?? 0) },
    statusCounts,
    totalOrders,
    daily: buildSeries(toMap(createdRows), toMap(paidRows)),
    pendingItems: Number(pendingItemRows[0]?.n ?? 0),
    awaitingDispatch: Number(dispatchRows[0]?.n ?? 0),
    newCustomers30: Number(customerRows[0]?.n ?? 0),
    content: {
      draftPages: Number(contentRows[0]?.draft_pages ?? 0),
      draftPosts: Number(contentRows[0]?.draft_posts ?? 0),
    },
    needsAvailability: availabilityQueue.map(mapAttention),
    needsDispatch: dispatchQueue.map(mapAttention),
    errors24h: Number(errorRows[0]?.n ?? 0),
    latestErrors,
  };
}
