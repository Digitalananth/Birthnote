import { NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2';
import { query } from '@/lib/db';
import { env } from '@/lib/env';
import { getSettings } from '@/lib/settings';
import { checkServiceability } from '@/lib/shiprocket';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';
import { recordError } from '@/server/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/shipping/serviceability?pincode=600001
 *
 * Whether a courier will carry a parcel to this PIN code, asked from the
 * delivery address form before the customer pays.
 *
 * Everything about this route is built around one rule: it is advisory. A
 * courier API that is down, slow, or rate-limited must not stop somebody
 * buying something. So every failure answers `{ known: false }` — not "not
 * serviceable" — and the form renders exactly as it did before when it sees
 * that. Confusing "we could not ask" with "the answer is no" would turn a
 * Shiprocket outage into a shop that refuses orders.
 */

/** Coverage changes on the scale of months, not days. */
const CACHE_DAYS = 7;
/** Enough for a customer correcting a typo; not enough to enumerate PIN codes. */
const RATE_LIMIT = 20;
const RATE_WINDOW_SECONDS = 60;

const PINCODE = /^[1-9][0-9]{5}$/;

interface CacheRow extends RowDataPacket {
  serviceable: number;
  etd: string | null;
  courier: string | null;
}

export async function GET(request: Request) {
  const pincode = (new URL(request.url).searchParams.get('pincode') ?? '').trim();
  // Checked before anything is spent on it — neither a Shiprocket call nor a
  // database round trip is worth making for a string that cannot be a PIN.
  if (!PINCODE.test(pincode)) {
    return NextResponse.json({ known: false }, { status: 400 });
  }

  if (!env.shiprocket.configured()) {
    return NextResponse.json({ known: false });
  }

  const { allowed } = await checkRateLimit(
    `serviceability:${clientIp(request.headers)}`,
    RATE_LIMIT,
    RATE_WINDOW_SECONDS
  );
  if (!allowed) return NextResponse.json({ known: false }, { status: 429 });

  try {
    const cached = await query<CacheRow[]>(
      `SELECT serviceable, etd, courier FROM pincode_serviceability
        WHERE pincode = ? AND checked_at > UTC_TIMESTAMP() - INTERVAL ? DAY
        LIMIT 1`,
      [pincode, CACHE_DAYS]
    );
    if (cached.length) {
      return NextResponse.json({
        known: true,
        serviceable: Boolean(cached[0].serviceable),
        etd: cached[0].etd,
        courier: cached[0].courier,
      });
    }

    const settings = await getSettings();
    // Set alongside the pickup address in Settings → Shipping, and filled in
    // from the address that was actually chosen. It used to be scraped out of
    // `seller_address` with a regex for the last six-digit number, which is
    // wrong for any address ending in a building or phone number — and wrong
    // silently, because the answer this route gives when it cannot ask is
    // indistinguishable from a real one.
    const pickup = settings.shiprocket_pickup_pincode.trim();
    if (!/^[1-9][0-9]{5}$/.test(pickup)) {
      // No pickup PIN to ask from. Not an error the customer can act on.
      return NextResponse.json({ known: false });
    }

    const result = await checkServiceability(
      pickup,
      pincode,
      Number(settings.parcel_weight_kg) || 0.1
    );

    await query(
      `INSERT INTO pincode_serviceability (pincode, serviceable, etd, courier, checked_at)
         VALUES (?, ?, ?, ?, UTC_TIMESTAMP())
       ON DUPLICATE KEY UPDATE
         serviceable = VALUES(serviceable), etd = VALUES(etd),
         courier = VALUES(courier), checked_at = VALUES(checked_at)`,
      [pincode, result.serviceable ? 1 : 0, result.etd, result.courier]
    );

    return NextResponse.json({ known: true, ...result });
  } catch (error) {
    // "We could not ask" — never "the answer is no".
    recordError('serviceability', error, pincode);
    return NextResponse.json({ known: false });
  }
}
