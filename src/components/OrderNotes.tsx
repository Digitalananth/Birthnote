import React from 'react';
import Icon from '@/components/ui/AppIcon';
import type { Order, OrderItem } from '@/lib/order-types';
import { formatPrice } from '@/lib/validation';

/**
 * The notes in an order, one row each.
 *
 * Shared by the tracking page, the payment page and the customer's account so
 * a bulk order reads the same wherever it appears — and so a single-note order
 * still reads like one line, not like a table of one.
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
  return (
    <ul className="flex flex-col divide-y divide-border">
      {order.items.map((item) => {
        const state = AVAILABILITY[item.availability];
        const details = [
          item.noteCountry,
          item.noteCondition,
          item.noteSerial && `Serial ${item.noteSerial}`,
        ]
          .filter(Boolean)
          .join(' · ');

        return (
          <li key={item.id} className="flex items-start gap-4 py-4 first:pt-0 last:pb-0">
            <Icon name={state.icon} size={18} className={`${state.color} mt-0.5 shrink-0`} />

            <div className="flex-1 min-w-0">
              <p className="font-mono font-bold text-foreground tracking-wide">
                {item.displayDate}
                {item.noteDenomination ? (
                  <span className="font-sans font-medium text-sm text-muted-foreground">
                    {' '}
                    · {item.noteDenomination}
                  </span>
                ) : item.requestedDenomination ? (
                  <span className="font-sans font-medium text-sm text-muted-foreground">
                    {' '}
                    · ₹{item.requestedDenomination} requested
                  </span>
                ) : null}
              </p>

              {item.giftFor && (
                <p className="text-xs text-muted-foreground mt-0.5">For {item.giftFor}</p>
              )}
              {item.giftRelationship && !item.giftFor && (
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
      })}
    </ul>
  );
}
