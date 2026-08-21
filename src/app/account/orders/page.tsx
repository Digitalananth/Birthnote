import React from 'react';
import type { Metadata } from 'next';
import OrderList from '@/app/account/components/OrderList';
import { requireUser } from '@/lib/session';
import { listOrdersForUser } from '@/lib/orders';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'My orders — BirthNote',
  robots: { index: false, follow: false },
};

export default async function AccountOrdersPage() {
  const user = await requireUser('/account/orders');
  const orders = await listOrdersForUser(user.id);

  return (
    <div>
      <h2 className="font-sans font-bold text-foreground text-sm uppercase tracking-wide mb-4">
        My orders
      </h2>
      <OrderList orders={orders} />
    </div>
  );
}
