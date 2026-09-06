import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import {
  getOrderByAwb,
  markOrderDelivered,
  saveShipmentStatus,
  appendScanEvent,
} from '@/lib/orders';
import { sendMail, deliveredEmail } from '@/lib/mail';
import { env } from '@/lib/env';
import { recordError } from '@/server/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/webhooks/courier
 *
 * Where the parcel is, according to the courier.
 *
 * Configure it at Shiprocket → Settings → API → Webhooks, pointing at
 * https://your-domain/api/webhooks/courier, with the token you set there
 * copied into SHIPROCKET_WEBHOOK_TOKEN.
 *
 * The path says `courier` rather than `shiprocket` because Shiprocket's own
 * form rejects any URL containing `shiprocket`, `kartrocket`, `sr` or `kr`
 * — it refuses to save one, so the obvious name is the one name that cannot
 * be used. Do not "fix" this back.
 *
 * Worth being clear about what that token proves: Shiprocket sends it back as
 * a plain `x-api-key` header, not as a signature over the body. So this
 * authenticates the *caller* and says nothing about the payload — anyone
 * holding the token can claim anything. That is Shiprocket's design, not a
 * choice made here, and it is why the only status this route acts on is the
 * one that closes an order it can already see is shipped.
 */

interface Scan {
  date?: string;
  activity?: string;
  location?: string;
  'sr-status-label'?: string;
}

interface ShiprocketWebhookBody {
  awb?: string | number;
  current_status?: string;
  shipment_status?: string;
  order_id?: string;
  scans?: Scan[];
}

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

function parseScanDate(raw: string): Date | null {
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

/** Constant-time compare, so the token cannot be guessed a byte at a time. */
function tokenMatches(provided: string): boolean {
  const expected = Buffer.from(env.shiprocket.webhookToken(), 'utf8');
  const actual = Buffer.from(provided, 'utf8');
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export async function POST(request: Request) {
  const provided = request.headers.get('x-api-key');
  // Deliberately one answer for three cases — no header, wrong token, and no
  // token configured at all. A caller learns nothing about which, and an
  // unconfigured endpoint refuses rather than erroring: a 500 here would tell
  // Shiprocket to retry a request that can never be accepted.
  if (!env.shiprocket.webhookEnabled() || !provided || !tokenMatches(provided)) {
    return NextResponse.json({ error: 'Not authorised.' }, { status: 401 });
  }

  let body: ShiprocketWebhookBody;
  try {
    body = (await request.json()) as ShiprocketWebhookBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const awb = body.awb == null ? '' : String(body.awb).trim();
  if (!awb) {
    // Acknowledged rather than refused: a payload with no AWB will never
    // become one, and a 4xx only buys retries of the same thing.
    return NextResponse.json({ received: true, matched: false });
  }

  try {
    const order = await getOrderByAwb(awb);
    if (!order) {
      // Not ours, or ours and not yet saved. Either way there is nothing to
      // retry — say so plainly rather than making Shiprocket keep trying.
      return NextResponse.json({ received: true, matched: false });
    }

    const status = String(body.current_status ?? body.shipment_status ?? '').trim();
    if (status) await saveShipmentStatus(order.id, status);

    /*
     * Every scan on the timeline, once.
     *
     * Shiprocket redelivers whole payloads — scans included — so without the
     * duplicate check in `appendScanEvent` the customer would see "Reached
     * Chennai hub" three times. The scan's own timestamp is used as the event
     * time rather than now, so the timeline reads in the order things
     * happened rather than the order we were told about them.
     */
    for (const scan of body.scans ?? []) {
      const activity = String(scan.activity ?? scan['sr-status-label'] ?? '').trim();
      if (!activity) continue;
      const when = scan.date ? parseScanDate(String(scan.date)) : null;
      if (!when) continue;
      const location = String(scan.location ?? '').trim();
      await appendScanEvent(order.id, location ? `${activity} — ${location}` : activity, when);
    }

    /*
     * Only one of their strings changes our status.
     *
     * Shiprocket's vocabulary is long, differs between couriers and grows
     * without notice. RTO and cancellation are real states that deserve real
     * handling, but inventing that handling now would encode a guess about
     * wording nobody has verified — so they are recorded in `shipment_status`
     * and left for a human to notice.
     */
    if (/^delivered$/i.test(status)) {
      // Null when a redelivery already recorded it; only the winner emails.
      const delivered = await markOrderDelivered(awb);
      if (delivered) await sendMail(deliveredEmail(delivered));
    }
  } catch (error) {
    // A 500 makes Shiprocket retry, which is what we want for a transient
    // database error.
    recordError('shiprocket-webhook', error, awb);
    return NextResponse.json({ error: 'Handler failed.' }, { status: 500 });
  }

  return NextResponse.json({ received: true, matched: true });
}
