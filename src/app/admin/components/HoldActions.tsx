'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import { HOLD_DAYS, type Order } from '@/lib/order-types';

/**
 * The hold on one confirmed order, and what to do about it.
 *
 * Nothing here is automatic. The panel says where the hold stands and what has
 * already been sent; the admin decides whether this customer gets a nudge,
 * more time, or to be told the hold is over. That judgement — is this person
 * worth chasing, is the note worth holding — is not one a timer should make.
 */
type HoldAction = 'remind' | 'lapse' | 'extend';

/**
 * Measured in hours, not days.
 *
 * A deadline twenty-three hours away is nearly gone; one twenty-five hours
 * away has a day on it. Flooring a day count collapses those two into the same
 * answer, and the difference is exactly what an admin deciding whether to
 * chase today needs to know.
 */
function describe(
  hoursLeft: number | null,
  lapsed: boolean
): { text: string; tone: string; suffix: 'until' | 'on' | null } {
  if (lapsed) return { text: 'The hold has ended', tone: 'text-red-600', suffix: null };
  if (hoursLeft === null) {
    return { text: 'No hold recorded', tone: 'text-muted-foreground', suffix: null };
  }
  if (hoursLeft < 0) return { text: 'The hold ran out', tone: 'text-red-600', suffix: 'on' };
  // Not "ends today": a deadline twenty hours away can easily fall tomorrow,
  // and a panel reading "today" beside a date reading tomorrow is worse than
  // saying nothing at all.
  if (hoursLeft < 24) {
    return { text: 'Less than a day left', tone: 'text-red-600', suffix: 'until' };
  }

  // Rounded, not floored: a hold set six days ago still has 5.99 days on it,
  // and calling that "5 days left" quietly loses a day the customer has.
  const days = Math.round(hoursLeft / 24);
  const tone = days <= 2 ? 'text-accent' : 'text-muted-foreground';
  return { text: `${days} day${days === 1 ? '' : 's'} left`, tone, suffix: 'until' };
}

export default function HoldActions({ order }: { order: Order }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [active, setActive] = useState<HoldAction | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Computed on the client so it stays right if the page sits open a while.
  const hoursLeft =
    order.heldUntil === null ? null : (Date.parse(order.heldUntil) - Date.now()) / 3_600_000;
  const lapsed = order.holdLapsedAt !== null;
  const state = describe(hoursLeft, lapsed);

  const run = async (action: HoldAction) => {
    setError('');
    setMessage('');
    setActive(action);
    try {
      const response = await fetch(`/api/admin/orders/${order.reference}/hold`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          // Sent so the server can refuse if somebody else has since sent one.
          expectedReminderCount: order.holdReminderCount,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'That did not work.');

      setMessage(
        action === 'extend'
          ? `Extended by ${HOLD_DAYS} days. No email was sent.`
          : payload.emailed
            ? 'Done, and the customer has been emailed.'
            : 'Done. No email was sent (mail is disabled or failed — check the server log).'
      );
      startTransition(() => router.refresh());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That did not work.');
    } finally {
      setActive(null);
    }
  };

  const busy = isPending || active !== null;
  const deadline = order.heldUntil
    ? new Intl.DateTimeFormat('en-IN', {
        day: 'numeric',
        month: 'long',
        timeZone: 'Asia/Kolkata',
      }).format(new Date(order.heldUntil))
    : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className={`text-sm font-semibold ${state.tone}`}>
          {state.text}
          {deadline && state.suffix && (
            <span className="text-muted-foreground font-normal">
              {' '}
              · {state.suffix} {deadline}
            </span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {order.holdReminderCount === 0
            ? 'No reminder sent'
            : `${order.holdReminderCount} reminder${order.holdReminderCount === 1 ? '' : 's'} sent`}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || lapsed}
          title={
            lapsed
              ? 'The hold has ended — extend it first if you want to chase this order'
              : 'Emails the customer that the hold is running out'
          }
          onClick={() => run('remind')}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-secondary text-foreground hover:bg-secondary/80 border border-border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Icon name="EnvelopeIcon" size={14} />
          {active === 'remind' ? 'Sending…' : 'Send reminder'}
        </button>

        <button
          type="button"
          disabled={busy}
          title={`Gives the customer another ${HOLD_DAYS} days from today. No email is sent.`}
          onClick={() => run('extend')}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-secondary text-foreground hover:bg-secondary/80 border border-border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Icon name="ArrowPathIcon" size={14} />
          {active === 'extend' ? 'Extending…' : `Extend ${HOLD_DAYS} days`}
        </button>

        <button
          type="button"
          disabled={busy || lapsed}
          title={
            lapsed
              ? 'Already marked as ended'
              : 'Emails the customer that the hold is over. The order stays payable.'
          }
          onClick={() => run('lapse')}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Icon name="XCircleIcon" size={14} />
          {active === 'lapse' ? 'Ending…' : 'End the hold'}
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        Ending a hold does not cancel the order — it stays confirmed and the customer can still pay.
        It only stops us promising the note is set aside.
      </p>

      {message && <p className="text-xs font-semibold text-green-700">{message}</p>}
      {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}
