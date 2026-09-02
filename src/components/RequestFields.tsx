import React from 'react';
import type { OrderItemGroup } from '@/lib/order-types';

/**
 * What the customer asked for, as labelled fields: name, relationship,
 * occasion, date.
 *
 * Shared by the tracking page and the admin's order page so the four facts are
 * laid out identically on both. When an admin is reading a request back to a
 * customer on the phone, the two of them should be looking at the same thing
 * in the same order.
 *
 * Every field is rendered even when it is empty. An order placed before we
 * asked for the recipient's name has none, and a dash saying so is clearer
 * than a field that quietly disappears.
 */
export default function RequestFields({ group }: { group: OrderItemGroup }) {
  return (
    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
      <Field label="Name" value={group.giftName} />
      <Field label="Who is it for" value={group.giftRelationship} />
      <Field label="Occasion" value={group.giftFor} />
      <Field label="Date" value={group.displayDate} mono />
    </dl>
  );
}

function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
        {label}
      </dt>
      <dd
        className={`mt-0.5 text-sm font-semibold break-words ${
          value ? 'text-foreground' : 'text-muted-foreground/60'
        } ${mono ? 'font-mono tracking-wide' : ''}`}
      >
        {value || '—'}
      </dd>
    </div>
  );
}
