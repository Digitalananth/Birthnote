import React from 'react';
import Icon from '@/components/ui/AppIcon';
import NotePhotos from '@/components/NotePhotos';
import {
  groupOrderItems,
  type Order,
  type OrderItem,
  type OrderItemGroup,
} from '@/lib/order-types';
import { formatPrice } from '@/lib/validation';

/**
 * The notes in an order, grouped back into the requests they came from.
 *
 * The form asks for a date, a recipient and every denomination wanted for that
 * date, and the order then stores one row per note. Listed flat, "10 August
 * 1994" repeated six times reads as six unrelated notes rather than the one
 * date the customer asked about — so each request becomes its own section.
 *
 * A section leads with the four things the customer told us — the name, who it
 * is for, the occasion and the date — set out as labelled fields rather than
 * run together in a sentence: on the tracking page this is the record of what
 * they asked for, and they are checking it, not reading it. The notes found
 * for that request sit underneath.
 *
 * Shared by the tracking page and the payment page so an order reads the same
 * wherever it appears.
 */
const AVAILABILITY: Record<
  OrderItem['availability'],
  { label: string; color: string; icon: 'ClockIcon' | 'CheckCircleIcon' | 'XCircleIcon' }
> = {
  pending: { label: 'Checking', color: 'text-muted-foreground', icon: 'ClockIcon' },
  available: { label: 'Found', color: 'text-green-700', icon: 'CheckCircleIcon' },
  unavailable: { label: 'Not found', color: 'text-red-600', icon: 'XCircleIcon' },
};

export default function OrderNotes({
  order,
  showPrices = false,
  showDetails = false,
}: {
  order: Order;
  /** Only worth showing once the admin has priced what they found. */
  showPrices?: boolean;
  /** The physical note's condition, serial and country. */
  showDetails?: boolean;
}) {
  const groups = groupOrderItems(order.items);

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group, index) => (
        <section
          key={group.key}
          aria-label={`Request ${index + 1}`}
          className="rounded-xl border border-border p-4 sm:p-5"
        >
          <RequestDetails
            group={group}
            order={order}
            showPrices={showPrices}
            index={index}
            total={groups.length}
          />
          <ul className="flex flex-col divide-y divide-border mt-4">
            {group.items.map((item) => (
              <NoteRow
                key={item.id}
                order={order}
                item={item}
                showPrices={showPrices}
                showDetails={showDetails}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * What was asked for, once, above the notes it produced.
 *
 * Every field is shown even when it is empty. An order placed before we asked
 * for the recipient's name has no name, and a dash saying so is clearer than a
 * field that quietly disappears and leaves someone wondering whether they
 * filled it in.
 *
 * The subtotal counts only notes that are both found and priced: a found note
 * the admin has not priced yet contributes nothing rather than a misleading
 * zero, and it is left out entirely until there is something to show.
 */
function RequestDetails({
  group,
  order,
  showPrices,
  index,
  total,
}: {
  group: OrderItemGroup;
  order: Order;
  showPrices: boolean;
  index: number;
  total: number;
}) {
  const subtotal = group.items.reduce(
    (sum, item) => sum + (item.availability === 'available' ? (item.pricePaise ?? 0) : 0),
    0
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pb-2 border-b-2 border-accent/40">
        <p className="text-[10px] uppercase tracking-widest font-bold text-primary">
          Request {index + 1}
          {total > 1 ? ` of ${total}` : ''} ·{' '}
          {group.items.length === 1 ? '1 note' : `${group.items.length} notes`}
        </p>
        {showPrices && subtotal > 0 && (
          <p className="text-sm font-semibold text-foreground">
            {formatPrice(subtotal, order.currency)}
          </p>
        )}
      </div>

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
        <Detail label="Name" value={group.giftName} />
        <Detail label="Who is it for" value={group.giftRelationship} />
        <Detail label="Occasion" value={group.giftFor} />
        <Detail label="Date" value={group.displayDate} mono />
      </dl>
    </div>
  );
}

function Detail({
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

/**
 * One note.
 *
 * The date and the recipient are the section's job, so a row carries only what
 * differs between the notes of one request: the denomination, its condition,
 * the photograph of the note itself, and what it costs.
 */
function NoteRow({
  order,
  item,
  showPrices,
  showDetails,
}: {
  order: Order;
  item: OrderItem;
  showPrices: boolean;
  showDetails: boolean;
}) {
  const state = AVAILABILITY[item.availability];
  const details = [
    item.noteCountry,
    item.noteCondition,
    item.noteSerial && `Serial ${item.noteSerial}`,
  ]
    .filter(Boolean)
    .join(' · ');

  const denomination = item.noteDenomination
    ? item.noteDenomination
    : item.requestedDenomination
      ? `₹${item.requestedDenomination}`
      : null;

  return (
    <li className="flex items-start gap-4 py-3 first:pt-0 last:pb-0">
      <Icon name={state.icon} size={18} className={`${state.color} mt-0.5 shrink-0`} />

      {/* The note itself, when the admin has photographed it. Beside the row
          rather than inside the text, so it reads as this note's picture. */}
      <NotePhotos
        reference={order.reference}
        photos={item.photos}
        label={`${item.displayDate}${denomination ? ` · ${denomination}` : ''}`}
      />

      <div className="flex-1 min-w-0">
        <p className="font-sans font-semibold text-foreground">
          {denomination ?? 'Any denomination'}
        </p>
        {showDetails && details && (
          <p className="text-xs text-muted-foreground mt-0.5">{details}</p>
        )}
      </div>

      <div className="text-right shrink-0">
        <p className={`text-xs font-semibold ${state.color}`}>{state.label}</p>
        {showPrices && item.availability === 'available' && item.pricePaise ? (
          <p className="text-sm font-semibold text-foreground mt-0.5">
            {formatPrice(item.pricePaise, order.currency)}
          </p>
        ) : null}
      </div>
    </li>
  );
}
