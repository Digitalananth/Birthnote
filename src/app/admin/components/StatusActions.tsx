'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import { availableItems, type Order, type OrderStatus } from '@/lib/order-types';

/**
 * The fulfilment control for one order.
 *
 * Every status change here is the *only* way an order moves forward, and each
 * one triggers the matching customer email from the server. `router.refresh()`
 * re-renders the surrounding server component with fresh data rather than
 * duplicating order state in the client.
 */
const ACTIONS: Array<{
  status: OrderStatus;
  label: string;
  hint: string;
  needsNoteDetails?: boolean;
  needsTracking?: boolean;
  tone: string;
}> = [
  {
    status: 'checking',
    label: 'Start checking',
    hint: 'Marks the order as being searched. No email is sent.',
    tone: 'bg-secondary text-foreground hover:bg-secondary/80 border border-border',
  },
  {
    status: 'confirmed',
    label: 'Confirm available',
    hint: 'Emails the customer a payment link.',
    needsNoteDetails: true,
    tone: 'bg-green-700 text-white hover:bg-green-800',
  },
  {
    status: 'unavailable',
    label: 'Mark unavailable',
    hint: 'Emails the customer that we could not find the date.',
    tone: 'bg-red-600 text-white hover:bg-red-700',
  },
  {
    status: 'shipped',
    label: 'Mark dispatched',
    hint: 'Emails the customer their tracking number.',
    needsTracking: true,
    tone: 'bg-primary text-primary-foreground hover:bg-primary/90',
  },
];

export default function StatusActions({ order }: { order: Order }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [active, setActive] = useState<OrderStatus | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [fields, setFields] = useState({
    trackingNumber: order.trackingNumber ?? '',
    note: '',
  });

  const submit = async (status: OrderStatus) => {
    setError('');
    setMessage('');
    setActive(status);
    try {
      const response = await fetch(`/api/admin/orders/${order.reference}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, ...fields }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Update failed.');
      setMessage(
        payload.emailed
          ? 'Updated and the customer has been emailed.'
          : 'Updated. No email was sent (mail is disabled or failed — check the server log).'
      );
      startTransition(() => router.refresh());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Update failed.');
    } finally {
      setActive(null);
    }
  };

  const field = (name: keyof typeof fields, label: string, placeholder = '') => (
    <label className="flex flex-col gap-1 text-xs">
      <span className="font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <input
        value={fields[name]}
        placeholder={placeholder}
        onChange={(event) => setFields((prev) => ({ ...prev, [name]: event.target.value }))}
        className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
    </label>
  );

  const locked = order.status === 'paid' || order.status === 'shipped';

  // What the order-level actions are allowed to say, derived from the notes.
  const priced = availableItems(order).filter((item) => (item.pricePaise ?? 0) > 0);
  const undecided = order.items.filter((item) => item.availability === 'pending');
  const allMissing =
    order.items.length > 0 && order.items.every((item) => item.availability === 'unavailable');

  return (
    <div className="flex flex-col gap-5">
      {/*
        What was found for each note is set per note, above this control. All
        that is left at the order level is what applies to the whole parcel.
      */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {field('trackingNumber', 'Tracking number')}
        {field('note', 'Internal note', 'Shown on the customer timeline')}
      </div>

      {/*
        Why an action cannot be taken yet, in the admin's words.
        
        Computed for every action up front rather than inside the buttons,
        because a disabled button with no visible reason is the whole problem:
        on an order where some notes are found and some are not, three of these
        four are legitimately unavailable, and "it does nothing" is
        indistinguishable from "it is broken" until the page says which. A
        `title` tooltip does not count — it never appears on a touch screen and
        few people hover a dead button.
        
        The reasons sit *below* the row rather than beside each button: the row
        is how the four steps read as a sequence, and a caption on every one
        breaks it into four unrelated lines.
      */}
      {(() => {
        const reasonFor = (status: OrderStatus): string | null => {
          if (status === order.status) return 'the order is already at this stage';
          if (locked && status !== 'shipped') {
            return 'the order is paid for and can only move on to dispatch';
          }
          if (status === 'confirmed') {
            // Both conditions, in the order the admin meets them: find and
            // price something, then finish checking the rest. The email names
            // what was found *and* what was not, so a note still unchecked
            // would appear in neither list and never be mentioned again.
            if (priced.length === 0) {
              return undecided.length
                ? `mark a note found and give it a price first — ${undecided.length} of ${order.items.length} still to check`
                : 'no note is both found and priced, so there is nothing to charge for';
            }
            if (undecided.length) {
              return `${undecided.length} of ${order.items.length} notes still unchecked — mark each one found or not found, then confirm`;
            }
          }
          if (status === 'unavailable' && !allMissing) {
            return undecided.length
              ? `only once every note has been marked not found — ${undecided.length} still to check`
              : 'some notes were found, so decline those individually instead';
          }
          // Dispatch moves a *parcel*. Before payment there is no parcel, and
          // sending this would email a tracking number for something nobody
          // has paid for.
          if (status === 'shipped' && order.status !== 'paid') {
            return 'only once the customer has paid';
          }
          return null;
        };

        const reasons = ACTIONS.map((action) => ({ action, reason: reasonFor(action.status) }));

        return (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {reasons.map(({ action, reason }) => (
                <button
                  key={action.status}
                  type="button"
                  title={reason ? `${action.label} — ${reason}` : action.hint}
                  disabled={isPending || active !== null || reason !== null}
                  onClick={() => submit(action.status)}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${action.tone}`}
                >
                  {active === action.status ? 'Working…' : action.label}
                </button>
              ))}
            </div>

            {/*
              Only the blocked ones, and never the "already at this stage" one
              — that reason is plain from the status shown above, and printing
              it would put a line under every order.
            */}
            {reasons.some(({ action, reason }) => reason && action.status !== order.status) && (
              <ul className="flex flex-col gap-1">
                {reasons
                  .filter(({ action, reason }) => reason && action.status !== order.status)
                  .map(({ action, reason }) => (
                    <li key={action.status} className="text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground/70">{action.label}</span> —{' '}
                      {reason}
                    </li>
                  ))}
              </ul>
            )}
          </div>
        );
      })()}

      <p className="text-xs text-muted-foreground leading-relaxed">
        {undecided.length > 0 && !locked
          ? `${undecided.length} of ${order.items.length} notes still to check. `
          : ''}
        Payment status is set automatically by the Stripe webhook — it cannot be set by hand.
      </p>

      {message && (
        <p className="flex items-start gap-2 text-sm text-green-700">
          <Icon name="CheckCircleIcon" size={16} className="mt-0.5 shrink-0" />
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="flex items-start gap-2 text-sm text-red-600">
          <Icon name="ExclamationTriangleIcon" size={16} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
