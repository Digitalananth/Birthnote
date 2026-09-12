import 'server-only';
import type { RowDataPacket } from 'mysql2/promise';
import { query } from '@/lib/db';
import { env } from '@/lib/env';
import {
  appendScanEvent,
  getOrderByReference,
  markOrderDelivered,
  saveShipmentStatus,
  type Order,
} from '@/lib/orders';
import { trackAwb } from '@/lib/shiprocket';
import { sendMail, deliveredEmail } from '@/lib/mail';
import { recordError, redact } from '@/server/errors';

/**
 * Where a parcel is, from either of the two places Shiprocket says so.
 *
 * The webhook is told; the tracking API is asked. Both end up in
 * `applyCourierUpdate`, so a scan heard about twice — once pushed, once
 * pulled — lands on the timeline once, and "delivered" closes the order the
 * same way whichever arrived first.
 */

/**
 * A scan's timestamp, as an instant.
 *
 * Shiprocket sends `YYYY-MM-DD HH:MM:SS` with no timezone on it, and means
 * IST. `new Date(...)` on that string uses the *server's* timezone, which is
 * IST on a developer's laptop in India and UTC on the host — so the same
 * payload would land correctly in development and five and a half hours early
 * in production, on a timeline nobody would think to check.
 *
 * A string that does carry an offset is trusted as-is, in case they ever
 * start sending one.
 */
const IST_OFFSET_MINUTES = 330;

export function parseScanDate(raw: string): Date | null {
  const value = raw.trim();
  if (!value) return null;

  const naive = value.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (naive) {
    const [, y, mo, d, h, mi, sec] = naive;
    const asUtc = Date.UTC(
      Number(y),
      Number(mo) - 1,
      Number(d),
      Number(h),
      Number(mi),
      Number(sec ?? '0')
    );
    return new Date(asUtc - IST_OFFSET_MINUTES * 60_000);
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export interface CourierUpdate {
  status: string;
  scans: { date: string; activity: string; location: string }[];
  courierName?: string;
  trackUrl?: string;
  etd?: string;
}

/**
 * Applies one report of where the parcel is. Returns how many scans were new.
 *
 * Only "delivered" changes our own status. Shiprocket's vocabulary is long,
 * differs between couriers and grows without notice; RTO and cancellation are
 * real states that deserve real handling, but inventing that handling now
 * would encode a guess about wording nobody has verified — so they are
 * recorded in `shipment_status` and left for a human to notice.
 */
export async function applyCourierUpdate(order: Order, update: CourierUpdate): Promise<number> {
  const status = update.status.trim();
  if (status) await saveShipmentStatus(order.id, status);

  // Only an https link is kept: it is rendered as a link on a public page.
  const trackUrl = /^https:\/\//i.test(update.trackUrl ?? '') ? update.trackUrl! : null;
  await query(
    `UPDATE orders SET
       track_url = COALESCE(?, track_url),
       courier_etd = COALESCE(?, courier_etd),
       courier_name = COALESCE(?, courier_name)
     WHERE id = ?`,
    [
      trackUrl ? trackUrl.slice(0, 500) : null,
      update.etd?.trim() ? update.etd.trim().slice(0, 60) : null,
      // A courier name is only filled in, never replaced: the one saved at AWB
      // assignment is Shiprocket's own and the scans sometimes abbreviate it.
      order.courierName ? null : update.courierName?.trim().slice(0, 120) || null,
      order.id,
    ]
  );

  /*
   * Every scan on the timeline, once. The scan's own timestamp is used as the
   * event time rather than now, so the timeline reads in the order things
   * happened rather than the order we were told about them.
   */
  let added = 0;
  for (const scan of update.scans) {
    const activity = scan.activity.trim();
    if (!activity) continue;
    const when = parseScanDate(scan.date);
    if (!when) continue;
    const location = scan.location.trim();
    const note = location ? `${activity} — ${location}` : activity;
    if (await appendScanEvent(order.id, note, when)) added += 1;
  }

  if (/^delivered$/i.test(status) && order.trackingNumber) {
    // Null when a redelivery already recorded it; only the winner emails.
    const delivered = await markOrderDelivered(order.trackingNumber);
    if (delivered) await sendMail(deliveredEmail(delivered));
  }
  return added;
}

/**
 * Reads the order's tracking from Shiprocket and applies it.
 *
 * Throws what Shiprocket said — the admin's refresh button shows it. The sync
 * time is written even on an empty history, so a parcel not yet scanned is not
 * re-asked on every page view.
 */
export async function syncTracking(order: Order): Promise<number> {
  const awb = order.trackingNumber;
  if (!awb) throw new Error('This order has no AWB yet.');
  try {
    const tracking = await trackAwb(awb);
    return await applyCourierUpdate(order, {
      status: tracking.currentStatus,
      scans: tracking.scans,
      courierName: tracking.courierName,
      trackUrl: tracking.trackUrl,
      etd: tracking.etd,
    });
  } finally {
    await query('UPDATE orders SET tracking_synced_at = UTC_TIMESTAMP() WHERE id = ?', [order.id]);
  }
}

/** How old a sync may be before a customer's page view asks again. */
const STALE_AFTER_MS = 30 * 60 * 1000;
/** How long a customer's page waits for Shiprocket before rendering anyway. */
const PAGE_WAIT_MS = 4000;

const globalForTracking = globalThis as unknown as { myLuckyDatesTrackingInFlight?: Set<number> };
const inFlight = (globalForTracking.myLuckyDatesTrackingInFlight ??= new Set<number>());

function needsSync(order: Order): boolean {
  if (order.status !== 'shipped' || !order.trackingNumber) return false;
  if (!env.shiprocket.configured()) return false;
  // A tracking number equal to the shipment ID is not an AWB; asking would
  // only record the same "not found" each time.
  if (order.trackingNumber === order.shiprocketShipmentId) return false;
  const last = order.trackingSyncedAt ? new Date(order.trackingSyncedAt).getTime() : 0;
  return Date.now() - last > STALE_AFTER_MS;
}

/**
 * Syncs in the background and never throws. Failures go to app_errors.
 * One sync per order per process at a time, so a customer refreshing the page
 * does not queue a Shiprocket call per refresh.
 */
export function syncTrackingQuietly(order: Order): Promise<void> {
  if (inFlight.has(order.id)) return Promise.resolve();
  inFlight.add(order.id);
  return syncTracking(order)
    .then(() => undefined)
    .catch((error) => recordError('shiprocket.track', error, order.reference))
    .finally(() => inFlight.delete(order.id));
}

/**
 * For the customer's tracking page: if the order's tracking is stale, refresh
 * it, waiting a few seconds at most. Returns the order as it now stands.
 *
 * The webhook is still the main source. This is what catches the updates it
 * missed — the ones sent before the AWB was saved, or while it was down — and
 * it is why a customer never sees a history older than half an hour.
 */
export async function refreshIfStale(order: Order): Promise<Order> {
  if (!needsSync(order)) return order;
  const sync = syncTrackingQuietly(order);
  const finished = await Promise.race([
    sync.then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), PAGE_WAIT_MS)),
  ]);
  if (!finished) return order;
  return (await getOrderByReference(order.reference)) ?? order;
}

/** The shortest gap between two customer-requested reads of one order. */
const CUSTOMER_MIN_GAP_MS = 2 * 60 * 1000;

/**
 * The customer's "Refresh" button. Reads Shiprocket unless the order was read
 * in the last two minutes, in which case what is saved is already current and
 * the page just reloads. The gap is what keeps a public button — anyone with
 * the reference can press it — from spending Shiprocket's rate limit.
 * Returns whether Shiprocket was actually asked.
 */
export async function refreshForCustomer(order: Order): Promise<boolean> {
  if (!order.trackingNumber || !env.shiprocket.configured()) return false;
  if (order.status !== 'shipped' && order.status !== 'delivered') return false;
  const last = order.trackingSyncedAt ? new Date(order.trackingSyncedAt).getTime() : 0;
  if (Date.now() - last < CUSTOMER_MIN_GAP_MS) return false;
  await syncTrackingQuietly(order);
  return true;
}

/* ------------------------------------------------------------------------- */

export type DeliveryOutcome =
  | 'accepted'
  | 'unmatched'
  | 'no_awb'
  | 'unauthorised'
  | 'invalid'
  | 'failed';

export interface WebhookDelivery {
  receivedAt: string;
  outcome: DeliveryOutcome;
  awb: string | null;
  courierStatus: string | null;
  scanCount: number;
  detail: string | null;
}

/** Records one webhook call, whatever became of it. Never throws. */
export async function recordWebhookDelivery(fields: {
  outcome: DeliveryOutcome;
  awb?: string | null;
  orderId?: number | null;
  courierStatus?: string | null;
  scanCount?: number;
  detail?: string | null;
}): Promise<void> {
  try {
    await query(
      `INSERT INTO courier_webhook_deliveries
         (outcome, awb, order_id, courier_status, scan_count, detail)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        fields.outcome,
        fields.awb ? fields.awb.slice(0, 64) : null,
        fields.orderId ?? null,
        fields.courierStatus ? fields.courierStatus.slice(0, 60) : null,
        fields.scanCount ?? 0,
        fields.detail ? redact(fields.detail).slice(0, 500) : null,
      ]
    );
  } catch (error) {
    recordError('courier-webhook.log', error);
  }
}

/**
 * The webhook calls that concern this order, newest first — matched to it, or
 * carrying its AWB and matched to nothing (which is what a call that arrived
 * before the AWB was saved looks like).
 */
export async function listWebhookDeliveries(order: Order, limit = 15): Promise<WebhookDelivery[]> {
  const rows = await query<
    (RowDataPacket & {
      received_at: Date;
      outcome: DeliveryOutcome;
      awb: string | null;
      courier_status: string | null;
      scan_count: number;
      detail: string | null;
    })[]
  >(
    `SELECT received_at, outcome, awb, courier_status, scan_count, detail
       FROM courier_webhook_deliveries
      WHERE order_id = ? OR (awb IS NOT NULL AND awb = ?)
      ORDER BY received_at DESC, id DESC
      LIMIT ${Math.max(1, Math.min(100, limit))}`,
    [order.id, order.trackingNumber ?? '']
  );
  return rows.map((row) => ({
    receivedAt: row.received_at.toISOString(),
    outcome: row.outcome,
    awb: row.awb,
    courierStatus: row.courier_status,
    scanCount: Number(row.scan_count ?? 0),
    detail: row.detail,
  }));
}

/** When any webhook call last arrived, for any order, and how it went. */
export async function lastWebhookDelivery(): Promise<{
  receivedAt: string;
  outcome: DeliveryOutcome;
} | null> {
  const rows = await query<(RowDataPacket & { received_at: Date; outcome: DeliveryOutcome })[]>(
    'SELECT received_at, outcome FROM courier_webhook_deliveries ORDER BY id DESC LIMIT 1'
  );
  return rows.length
    ? { receivedAt: rows[0].received_at.toISOString(), outcome: rows[0].outcome }
    : null;
}
