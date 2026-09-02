'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import ItemPhotos from '@/app/admin/components/ItemPhotos';
import type { Order, OrderItem, ItemAvailability } from '@/lib/order-types';
import { formatPrice } from '@/lib/validation';

/**
 * The fulfilment control for one note within an order.
 *
 * Availability and price are per note, so finding four dates out of five costs
 * the customer only the one that is missing. The order total is recomputed
 * server-side from these rows — nobody types a total anywhere.
 */
export default function ItemActions({
  order,
  item,
  conditions,
}: {
  order: Order;
  item: OrderItem;
  /**
   * The grades on offer, from master data. Empty is survivable — the field
   * falls back to free text rather than becoming impossible to fill in.
   */
  conditions: string[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState({
    // Prefilled from what the customer asked for, so the common case is one
    // click rather than retyping the denomination they already told us.
    noteDenomination:
      item.noteDenomination ?? (item.requestedDenomination ? `₹${item.requestedDenomination}` : ''),
    // Not on the form: we sell Indian notes only, so a text box that always
    // says "India" is a spelling risk and nothing else. It is still stored,
    // because the invoice and the customer's order both name the country —
    // put the field back here if that ever stops being true.
    noteCountry: item.noteCountry ?? 'India',
    noteCondition: item.noteCondition ?? '',
    noteSerial: item.noteSerial ?? '',
    rupees: item.pricePaise ? String(item.pricePaise / 100) : '',
  });

  const locked = order.status === 'paid' || order.status === 'shipped';

  const save = async (availability?: ItemAvailability) => {
    setError('');
    setBusy(true);
    try {
      const rupees = Number.parseFloat(fields.rupees);
      const response = await fetch(`/api/admin/orders/${order.reference}/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          availability,
          noteDenomination: fields.noteDenomination,
          noteCountry: fields.noteCountry,
          noteCondition: fields.noteCondition,
          noteSerial: fields.noteSerial,
          // Rupees in the form, paise in the database — the conversion
          // happens here so the admin never types a minor unit.
          pricePaise: Number.isFinite(rupees) && rupees > 0 ? Math.round(rupees * 100) : null,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Update failed.');
      startTransition(() => router.refresh());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Update failed.');
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    'px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60';

  const field = (name: keyof typeof fields, label: string, placeholder = '') => (
    <label className="flex flex-col gap-1 text-xs">
      <span className="font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <input
        value={fields[name]}
        placeholder={placeholder}
        disabled={locked}
        onChange={(event) => setFields((prev) => ({ ...prev, [name]: event.target.value }))}
        className={inputClass}
      />
    </label>
  );

  /**
   * Condition, chosen from the master list rather than typed.
   *
   * A note already recorded with a grade that has since been removed from the
   * list keeps it, as an extra option: the alternative is a dropdown that
   * silently rewrites what a sold note was described as the moment it opens.
   */
  const conditionField = () => {
    const current = fields.noteCondition.trim();
    const options =
      conditions.includes(current) || !current ? conditions : [current, ...conditions];

    return (
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-semibold uppercase tracking-wide text-muted-foreground">
          Condition
        </span>
        <select
          value={current}
          disabled={locked}
          onChange={(event) =>
            setFields((prev) => ({ ...prev, noteCondition: event.target.value }))
          }
          className={inputClass}
        >
          <option value="">Not graded yet</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        {conditions.length === 0 && (
          <span className="text-[11px] text-muted-foreground">
            No conditions in master data yet — add them under Master data.
          </span>
        )}
      </label>
    );
  };

  const state = {
    pending: { label: 'Not checked yet', color: 'text-muted-foreground' },
    available: { label: 'Found', color: 'text-green-700' },
    unavailable: { label: 'Not found', color: 'text-red-600' },
  }[item.availability];

  return (
    <div className="border border-border rounded-xl p-5 flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="font-mono font-bold text-foreground tracking-wide">
            {item.displayDate}
            {item.requestedDenomination && (
              <span className="font-sans font-medium text-sm text-muted-foreground">
                {' '}
                · ₹{item.requestedDenomination} asked for
              </span>
            )}
          </p>
        </div>
        <p className={`text-xs font-semibold ${state.color}`}>
          {state.label}
          {item.pricePaise ? ` · ${formatPrice(item.pricePaise, order.currency)}` : ''}
        </p>
      </div>

      {!locked && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {field('noteDenomination', 'Denomination', '₹10 Reserve Bank of India Note')}
            {conditionField()}
            {field('noteSerial', 'Serial number', '9AB 123456')}
            {field('rupees', 'Price for this note (₹)', '2499')}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || isPending}
              onClick={() => save('available')}
              className="px-3.5 py-2 rounded-lg bg-green-700 text-white text-xs font-semibold hover:bg-green-800 transition-colors disabled:opacity-40"
            >
              {busy ? 'Saving…' : 'Found — save'}
            </button>
            <button
              type="button"
              disabled={busy || isPending}
              onClick={() => save('unavailable')}
              className="px-3.5 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition-colors disabled:opacity-40"
            >
              Not found
            </button>
            {item.availability !== 'pending' && (
              <button
                type="button"
                disabled={busy || isPending}
                onClick={() => save('pending')}
                className="px-3.5 py-2 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
              >
                Reset
              </button>
            )}
          </div>
        </>
      )}

      {/* The photograph of the note, kept out of the field grid because it
          saves on its own — a picture is added the moment the note is in hand,
          which is not always the moment it gets priced. Hidden only for a note
          we know we do not have, and then only while it has no photos. */}
      {(item.availability !== 'unavailable' || item.photos.length > 0) && (
        <ItemPhotos
          reference={order.reference}
          itemId={item.id}
          label={`${item.displayDate}${fields.noteDenomination ? ` · ${fields.noteDenomination}` : ''}`}
          photos={item.photos}
          locked={locked}
        />
      )}

      {locked && (
        <p className="text-xs text-muted-foreground">
          Paid for — the notes on this order can no longer be changed.
        </p>
      )}

      {error && (
        <p role="alert" className="flex items-start gap-2 text-xs text-red-600">
          <Icon name="ExclamationTriangleIcon" size={14} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
