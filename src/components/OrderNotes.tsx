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
 * date the customer asked about — so each block gets a heading and its notes
 * sit under it as denominations.
 *
 * A single-note order skips all of that and stays one line, as it should.
 *
 * Shared by the tracking page, the payment page and the customer's account so
 * a bulk order reads the same wherever it appears.
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

  // One note is one line. A heading above a single row would be ceremony
  // around nothing, and it is the commonest order there is.
  if (order.items.length === 1) {
    return (
      <ul className="flex flex-col divide-y divide-border">
        <NoteRow
          order={order}
          item={order.items[0]}
          showPrices={showPrices}
          showDetails={showDetails}
          withDate
        />
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <div key={group.key}>
          <GroupHeading group={group} order={order} showPrices={showPrices} />
          <ul className="flex flex-col divide-y divide-border">
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
        </div>
      ))}
    </div>
  );
}

/**
 * What was asked for, once, above the notes it produced.
 *
 * The subtotal counts only notes that are both found and priced — a found note
 * the admin has not priced yet contributes nothing rather than a misleading
 * zero, and it is left out entirely until there is something to show.
 */
function GroupHeading({
  group,
  order,
  showPrices,
}: {
  group: OrderItemGroup;
  order: Order;
  showPrices: boolean;
}) {
  const subtotal = group.items.reduce(
    (sum, item) => sum + (item.availability === 'available' ? (item.pricePaise ?? 0) : 0),
    0
  );

  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pb-2 mb-1 border-b-2 border-accent/40">
      <div className="min-w-0">
        <p className="font-mono font-bold text-foreground tracking-wide">{group.displayDate}</p>
        {(group.giftFor || group.giftRelationship) && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {group.giftFor
              ? `For ${group.giftFor}`
              : `A gift for ${group.giftRelationship!.toLowerCase()}`}
          </p>
        )}
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs font-semibold text-muted-foreground">
          {group.items.length === 1 ? '1 note' : `${group.items.length} notes`}
        </p>
        {showPrices && subtotal > 0 && (
          <p className="text-sm font-semibold text-foreground mt-0.5">
            {formatPrice(subtotal, order.currency)}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * One note.
 *
 * Under a heading it leads with the denomination, because the date is already
 * overhead and repeating it six times is the noise this grouping removes.
 * `withDate` puts the date back for the single-note order, which has no
 * heading to carry it.
 */
function NoteRow({
  order,
  item,
  showPrices,
  showDetails,
  withDate = false,
}: {
  order: Order;
  item: OrderItem;
  showPrices: boolean;
  showDetails: boolean;
  withDate?: boolean;
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
      ? `₹${item.requestedDenomination}${withDate ? ' requested' : ''}`
      : null;

  return (
    <li className="flex items-start gap-4 py-3 first:pt-0 last:pb-0">
      <Icon name={state.icon} size={18} className={`${state.color} mt-0.5 shrink-0`} />

      {/* The note itself, when the admin has photographed it. Beside the row
          rather than inside the text, so it reads as this note's picture. */}
      <NotePhotos
        reference={order.reference}
        photos={item.photos}
        label={`${item.displayDate}${item.noteDenomination ? ` · ${item.noteDenomination}` : ''}`}
      />

      <div className="flex-1 min-w-0">
        {withDate ? (
          <p className="font-mono font-bold text-foreground tracking-wide">
            {item.displayDate}
            {denomination && (
              <span className="font-sans font-medium text-sm text-muted-foreground">
                {' '}
                · {denomination}
              </span>
            )}
          </p>
        ) : (
          <p className="font-sans font-semibold text-foreground">
            {denomination ?? 'Any denomination'}
          </p>
        )}

        {withDate && item.giftFor && (
          <p className="text-xs text-muted-foreground mt-0.5">For {item.giftFor}</p>
        )}
        {withDate && item.giftRelationship && !item.giftFor && (
          <p className="text-xs text-muted-foreground mt-0.5">
            A gift for {item.giftRelationship.toLowerCase()}
          </p>
        )}
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
