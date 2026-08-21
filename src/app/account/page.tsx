import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import OrderList from '@/app/account/components/OrderList';
import { requireUser } from '@/lib/session';
import { listOrdersForUser, summariseOrder } from '@/lib/orders';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'My account — BirthNote',
  robots: { index: false, follow: false },
};

export default async function AccountPage() {
  const user = await requireUser('/account');
  const orders = await listOrdersForUser(user.id);

  // Anything the customer needs to act on, surfaced above the list.
  const awaitingPayment = orders.filter((order) => order.status === 'confirmed');
  const recent = orders.slice(0, 3);

  return (
    <div className="flex flex-col gap-8">
      {awaitingPayment.length > 0 && (
        <div className="card-warm p-6 border border-green-200 bg-green-50/50">
          <div className="flex items-start gap-4">
            <Icon name="CheckCircleIcon" size={22} className="text-green-700 mt-0.5 shrink-0" />
            <div>
              <h2 className="font-sans font-bold text-foreground mb-1">
                {awaitingPayment.length === 1
                  ? 'One of your dates is available.'
                  : `${awaitingPayment.length} of your dates are available.`}
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                We are holding {awaitingPayment.length === 1 ? 'it' : 'them'} for 7 days.
              </p>
              <div className="flex flex-wrap gap-3">
                {awaitingPayment.map((order) => (
                  <Link
                    key={order.reference}
                    href={`/payment/${order.reference}`}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-full text-sm font-semibold hover:bg-primary/90 transition-colors"
                  >
                    <Icon name="CreditCardIcon" size={14} />
                    Pay for {summariseOrder(order)}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-sans font-bold text-foreground text-sm uppercase tracking-wide">
            Recent orders
          </h2>
          {orders.length > recent.length && (
            <Link href="/account/orders" className="text-sm text-primary underline">
              See all {orders.length}
            </Link>
          )}
        </div>
        <OrderList orders={recent} />
      </div>
    </div>
  );
}
