import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { getOrderByAwb } from '@/lib/orders';
import { applyCourierUpdate, recordWebhookDelivery } from '@/lib/tracking';
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
 * choice made here, and it is why the only status acted on is the one that
 * closes an order it can already see is shipped.
 *
 * Every call is written to `courier_webhook_deliveries`, refused ones
 * included, and shown on the admin order page. The response to the caller is
 * unchanged by that — a refused caller still learns nothing — but whether
 * Shiprocket is calling at all, and what became of it, is now answerable.
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
  courier_name?: string;
  etd?: string;
  scans?: Scan[];
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
  // Shiprocket to retry a request that can never be accepted. The log row
  // does say which, because the admin reading it is not the caller.
  if (!env.shiprocket.webhookEnabled() || !provided || !tokenMatches(provided)) {
    await recordWebhookDelivery({
      outcome: 'unauthorised',
      detail: !env.shiprocket.webhookEnabled()
        ? 'SHIPROCKET_WEBHOOK_TOKEN is not set on the server.'
        : !provided
          ? 'No x-api-key header.'
          : 'x-api-key does not match SHIPROCKET_WEBHOOK_TOKEN.',
    });
    return NextResponse.json({ error: 'Not authorised.' }, { status: 401 });
  }

  let body: ShiprocketWebhookBody;
  try {
    body = (await request.json()) as ShiprocketWebhookBody;
  } catch {
    await recordWebhookDelivery({ outcome: 'invalid', detail: 'Body is not JSON.' });
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const awb = body.awb == null ? '' : String(body.awb).trim();
  const status = String(body.current_status ?? body.shipment_status ?? '').trim();
  const scans = (body.scans ?? []).map((scan) => ({
    date: String(scan.date ?? ''),
    activity: String(scan.activity ?? scan['sr-status-label'] ?? ''),
    location: String(scan.location ?? ''),
  }));

  if (!awb) {
    // Acknowledged rather than refused: a payload with no AWB will never
    // become one, and a 4xx only buys retries of the same thing.
    await recordWebhookDelivery({ outcome: 'no_awb', courierStatus: status });
    return NextResponse.json({ received: true, matched: false });
  }

  try {
    const order = await getOrderByAwb(awb);
    if (!order) {
      // Not ours, or ours and not yet saved. Either way there is nothing to
      // retry. The tracking API sync picks up what this call carried once
      // the AWB is on the order, so nothing is lost by acknowledging it.
      await recordWebhookDelivery({
        outcome: 'unmatched',
        awb,
        courierStatus: status,
        scanCount: scans.length,
        detail: 'No order has this AWB as its tracking number.',
      });
      return NextResponse.json({ received: true, matched: false });
    }

    const added = await applyCourierUpdate(order, {
      status,
      scans,
      courierName: body.courier_name,
      etd: body.etd,
    });
    await recordWebhookDelivery({
      outcome: 'accepted',
      awb,
      orderId: order.id,
      courierStatus: status,
      scanCount: scans.length,
      detail: `${added} new scan${added === 1 ? '' : 's'} added to the timeline.`,
    });
  } catch (error) {
    // A 500 makes Shiprocket retry, which is what we want for a transient
    // database error.
    recordError('shiprocket-webhook', error, awb);
    await recordWebhookDelivery({
      outcome: 'failed',
      awb,
      courierStatus: status,
      scanCount: scans.length,
      detail: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Handler failed.' }, { status: 500 });
  }

  return NextResponse.json({ received: true, matched: true });
}
