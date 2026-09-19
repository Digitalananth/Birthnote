import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';
import { recordError } from '@/server/errors';
import { recordSweep } from '@/server/sweep-state';
import { nudgeAbandonedCheckouts } from '@/server/checkout-reminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The abandoned-checkout reminder on demand, over HTTP.
 *
 * The same job normally runs off ordinary traffic — see
 * src/server/background-sweep.ts — so this endpoint is not required for the
 * app to keep itself straight. It stays for the times you want to force a run
 * now, or to point a real cron at it if the site is ever too quiet to rely on
 * passing visitors.
 *
 * It does not ask PayU about unpaid orders; that is the admin's per-order
 * payment check. Chasing an unpaid hold is likewise an admin's call — see
 * src/lib/holds.ts.
 *
 * Each reminder is claimed before it is sent, so running twice, or two
 * workers running at once, cannot email the customer twice.
 */

/**
 * Compares the presented token with the configured one in constant time.
 *
 * A plain `===` leaks the secret one character at a time to anyone able to
 * measure the response, which over enough requests is a real attack on a
 * long-lived shared secret.
 */
function authorised(request: Request): boolean {
  if (!env.cron.enabled()) return false;
  const header = request.headers.get('authorization') ?? '';
  const presented = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!presented) return false;

  const expected = env.cron.secret();
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, which would itself leak the
  // length; compare a known-equal pair and fail separately.
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!authorised(request)) {
    // Deliberately identical whether the secret is wrong or simply unset: an
    // unauthenticated caller learns nothing about which.
    return NextResponse.json({ error: 'Not authorised.' }, { status: 401 });
  }

  let nudged: string[] = [];
  if (env.payu.configured()) {
    try {
      nudged = await nudgeAbandonedCheckouts();
    } catch (error) {
      recordError('cron-sweep', error);
    }
  }

  const at = recordSweep();

  return NextResponse.json({
    ok: true,
    at,
    nudged,
  });
}

/**
 * GET is the same sweep, so a cron that cannot easily send POST still works.
 * The secret is required either way.
 */
export const GET = POST;
