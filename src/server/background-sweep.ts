import 'server-only';
import { env } from '@/lib/env';
import { recordError } from '@/server/errors';
import { recordSweep, lastSweepAt } from '@/server/sweep-state';
import { reconcilePayments } from '@/server/reconcile';

/**
 * Reconciliation that hitches a ride on ordinary traffic.
 *
 * There is no scheduler in this app and no cron on the hosting. Rather than
 * add either, the one job that has to run unattended runs off the back of
 * requests that were happening anyway — the same trick `pruneExpiredSessions`
 * already plays on OTP verification.
 *
 * That is enough because of what the job is. Asking Stripe about a payment it
 * completed and never told us about is not time-critical: an hour late costs
 * nothing, and a site with no visitors has no payments to reconcile either.
 * A hold running out is time-critical, which is exactly why chasing one is an
 * admin's button and not this.
 *
 * Never awaited by its caller and never throws. A page must not render slower,
 * or fail, because a background errand went wrong.
 */

/** At most one run per window, per process. */
const INTERVAL_MS = 15 * 60 * 1000;

const globalForBackground = globalThis as unknown as { birthnoteSweepClaimedAt?: number };

export function maybeSweep(): void {
  // Nothing to reconcile against without Stripe configured.
  if (!env.stripe.configured()) return;

  const now = Date.now();
  const claimedAt = globalForBackground.birthnoteSweepClaimedAt ?? 0;
  if (now - claimedAt < INTERVAL_MS) return;

  /*
   * The slot is claimed *before* any awaiting, not after the run finishes.
   *
   * Node handles requests concurrently: if the claim were written at the end,
   * every request arriving during a slow Stripe round trip would pass the
   * check and start its own run. Writing it first means the second request
   * sees the claim and leaves. Several worker processes each keep their own
   * clock and so may each run once per window — harmless, because
   * `markOrderPaid` is idempotent and only the winner emails.
   */
  globalForBackground.birthnoteSweepClaimedAt = now;

  void (async () => {
    try {
      await reconcilePayments();
      recordSweep();
    } catch (error) {
      recordError('background-sweep', error);
      // Leave the claim in place: a failing Stripe should be retried on the
      // next window, not on the very next page view.
    }
  })();
}

export { lastSweepAt };
