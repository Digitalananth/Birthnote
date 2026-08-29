import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';
import { recordError } from '@/server/errors';
import { recordSweep } from '@/server/sweep-state';
import { reconcilePayments, type ReconcileResult } from '@/server/reconcile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Reconciliation on demand, over HTTP.
 *
 * The same job normally runs off ordinary traffic — see
 * src/server/background-sweep.ts — so this endpoint is not required for the
 * app to keep itself straight. It stays for the times you want to force a run
 * now, or to point a real cron at it if the site is ever too quiet to rely on
 * passing visitors.
 *
 * It deliberately sends nothing to a customer on its own initiative. Chasing
 * an unpaid hold is a judgement call an admin makes from the order queue — see
 * src/lib/holds.ts.
 *
 * `markOrderPaid` is idempotent, so running twice, or two workers running at
 * once, cannot pay an order twice or email the customer twice.
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

  let reconciled: ReconcileResult = { recovered: [], checked: 0 };
  if (env.stripe.configured()) {
    try {
      reconciled = await reconcilePayments();
    } catch (error) {
      recordError('cron-reconcile', error);
    }
  }

  const at = recordSweep();

  return NextResponse.json({
    ok: true,
    at,
    recovered: reconciled.recovered,
    sessionsChecked: reconciled.checked,
  });
}

/**
 * GET is the same sweep, so a cron that cannot easily send POST still works.
 * The secret is required either way.
 */
export const GET = POST;
