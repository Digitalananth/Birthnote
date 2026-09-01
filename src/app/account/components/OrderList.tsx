import React from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import { summariseOrder, type Order } from '@/lib/order-types';
import { STATUS_CONFIG, formatDateTime } from '@/lib/order-status';
import { formatPrice } from '@/lib/validation';

/**
 * The My Orders rows.
 *
 * Each links to /track-order/[reference] — the tracking page already renders
 * the full timeline and is reachable by reference anyway, so duplicating it
 * inside /account would only be a second copy to keep in step.
 */
export default function OrderList({ orders }: { orders: Order[] }) {
  if (!orders.length) {
    return (
      <div className="card-warm p-10 text-center">
        <div className="w-14 h-14 rounded-full bg-accent/15 flex items-center justify-center mx-auto mb-5">
          <Icon name="ArchiveBoxIcon" size={26} className="text-accent" />
        </div>
        <h2 className="font-sans font-bold text-foreground text-lg mb-2">No orders yet.</h2>
        <p className="text-sm text-muted-foreground leading-relaxed mb-6">
          Tell us a date that matters and we will search our collection for a banknote printed on
          it.
        </p>
        <Link
          href="/request-a-banknote"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-full text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          Find my date
          <Icon name="ArrowRightIcon" size={14} />
        </Link>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {orders.map((order) => {
        const status = STATUS_CONFIG[order.status];
        return (
          <li key={order.reference}>
            <Link
              href={`/track-order/${order.reference}`}
              className="card-warm p-6 flex flex-col sm:flex-row sm:items-center gap-4 hover:border-accent/40 transition-colors"
            >
              <div
                className={`w-11 h-11 rounded-full ${status.bg} flex items-center justify-center shrink-0`}
              >
                <Icon name={status.icon} size={20} className={status.color} />
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-mono font-bold text-foreground tracking-wide">
                  {summariseOrder(order)}
                  {order.items.length === 1 && order.items[0].requestedDenomination ? (
                    <span className="text-muted-foreground font-sans font-medium text-sm">
                      {' '}
                      · ₹{order.items[0].requestedDenomination} note
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {order.reference} · requested {formatDateTime(order.createdAt)}
                </p>
                {/* For a bulk order the dates matter more than any one gift note. */}
                {order.items.length > 1 ? (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {order.items.map((item) => item.displayDate).join(', ')}
                  </p>
                ) : (
                  order.items[0]?.giftRelationship && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      A gift for {order.items[0].giftRelationship.toLowerCase()}
                    </p>
                  )
                )}
              </div>

              <div className="sm:text-right shrink-0">
                <p className={`text-sm font-semibold ${status.color}`}>{status.label}</p>
                {(order.status === 'confirmed' ||
                  order.status === 'paid' ||
                  order.status === 'shipped') && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatPrice(order.totalPaise, order.currency)}
                  </p>
                )}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
