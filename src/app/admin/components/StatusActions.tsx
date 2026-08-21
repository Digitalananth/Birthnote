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

      <div className="flex flex-wrap gap-2">
        {ACTIONS.map((action) => {
          // Confirming needs something priced to charge for; declining the
          // whole order needs every note to have actually been looked for.
          const blocked =
            (action.status === 'confirmed' && priced.length === 0) ||
            (action.status === 'unavailable' && !allMissing);

          const disabled =
            isPending ||
            active !== null ||
            action.status === order.status ||
            blocked ||
            (locked && action.status !== 'shipped');

          const title = blocked
            ? action.status === 'confirmed'
              ? 'Mark at least one note found and give it a price first.'
              : 'Only when every note has been marked not found.'
            : action.hint;

          return (
            <button
              key={action.status}
              type="button"
              title={title}
              disabled={disabled}
              onClick={() => submit(action.status)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${action.tone}`}
            >
              {active === action.status ? 'Working…' : action.label}
            </button>
          );
        })}
      </div>

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
