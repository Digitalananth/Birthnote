import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import AdminNav from '@/app/admin/components/AdminNav';
import OrdersChart from '@/app/admin/components/OrdersChart';
import { requireAdmin } from '@/lib/auth';
import { getDashboardStats, WINDOW_DAYS, type AttentionOrder } from '@/lib/admin-stats';
import { ORDER_STATUSES } from '@/lib/orders';
import { formatPrice } from '@/lib/validation';
import { STATUS_CONFIG, formatDateTime } from '@/lib/order-status';

/**
 * Rendering strategy: SSR (force-dynamic).
 *
 * Same reason as the order queue — an overview of what needs doing is worth
 * nothing if it is a cached picture of an hour ago.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Dashboard — BirthNote admin',
  robots: { index: false, follow: false },
};

/** One headline number. Every tile is a link into the work it describes. */
function StatCard({
  label,
  value,
  hint,
  icon,
  href,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  hint?: string;
  icon: string;
  href: string;
  tone?: 'neutral' | 'warn';
}) {
  return (
    <Link
      href={href}
      className="card-warm p-5 flex flex-col gap-3 hover:border-primary/40 transition-colors"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-widest font-bold text-muted-foreground">
          {label}
        </span>
        <span
          className={`w-8 h-8 rounded-full flex items-center justify-center ${
            tone === 'warn' ? 'bg-accent/15' : 'bg-primary/10'
          }`}
        >
          <Icon
            name={icon}
            size={16}
            className={tone === 'warn' ? 'text-accent' : 'text-primary'}
          />
        </span>
      </div>
      <p className="font-sans font-extrabold text-2xl text-foreground">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </Link>
  );
}

function AttentionList({
  title,
  description,
  emptyMessage,
  orders,
  total,
  moreHref,
  render,
}: {
  title: string;
  description: string;
  emptyMessage: string;
  orders: AttentionOrder[];
  total: number;
  moreHref: string;
  render: (order: AttentionOrder) => string;
}) {
  return (
    <section className="card-warm p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="font-sans font-bold text-base text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
        {total > orders.length && (
          <Link href={moreHref} className="text-xs font-semibold text-primary shrink-0">
            View all {total}
          </Link>
        )}
      </div>

      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">{emptyMessage}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {orders.map((order) => (
            <li key={order.reference}>
              <Link
                href={`/admin/orders/${order.reference}`}
                className="flex items-center gap-3 py-3 hover:text-primary transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-mono font-bold text-sm text-foreground">{order.reference}</p>
                  <p className="text-xs text-muted-foreground truncate">{order.customerName}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-semibold text-foreground">{render(order)}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(order.createdAt)}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const admin = await requireAdmin('/admin');

  // /admin used to *be* the queue, so bookmarks and old emails carry its
  // filters. Anything with a queue parameter belongs at its new address.
  const { status, q, page } = await searchParams;
  if (status || q || page) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries({ status, q, page })) {
      if (value) search.set(key, value);
    }
    redirect(`/admin/orders?${search.toString()}`);
  }

  const stats = await getDashboardStats();
  const isOwner = admin.role === 'owner';
  const { currency } = stats.revenue;

  return (
    <main className="min-h-screen bg-secondary/20 px-4 md:px-10 py-10">
      <div className="max-w-6xl mx-auto">
        <AdminNav admin={admin} current="dashboard" />

        <div className="mb-8">
          <p className="text-xs uppercase tracking-widest text-primary font-bold mb-1">BirthNote</p>
          <h1 className="font-sans font-extrabold text-2xl md:text-3xl text-foreground">
            Good to see you, {admin.name.split(' ')[0]}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Everything below covers the last {WINDOW_DAYS} days unless it says otherwise.
          </p>
        </div>

        {/* Headline numbers. Revenue is owner-only — staff work the queue. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {isOwner && (
            <StatCard
              label={`Revenue ${WINDOW_DAYS}d`}
              value={formatPrice(stats.revenue.last30, currency)}
              hint={`${formatPrice(stats.revenue.last7, currency)} in the last 7 days`}
              icon="BanknotesIcon"
              href="/admin/orders?status=paid"
            />
          )}
          <StatCard
            label={`Paid ${WINDOW_DAYS}d`}
            value={String(stats.paidOrders.last30)}
            hint={`${stats.paidOrders.last7} in the last 7 days`}
            icon="CreditCardIcon"
            href="/admin/orders?status=paid"
          />
          <StatCard
            label="Notes to check"
            value={String(stats.pendingItems)}
            hint="Awaiting an availability decision"
            icon="MagnifyingGlassIcon"
            href="/admin/orders?status=checking"
            tone={stats.pendingItems > 0 ? 'warn' : 'neutral'}
          />
          <StatCard
            label="To dispatch"
            value={String(stats.awaitingDispatch)}
            hint="Paid, no tracking number yet"
            icon="TruckIcon"
            href="/admin/orders?status=paid"
            tone={stats.awaitingDispatch > 0 ? 'warn' : 'neutral'}
          />
          {!isOwner && (
            <StatCard
              label="New customers"
              value={String(stats.newCustomers30)}
              hint={`Accounts created in ${WINDOW_DAYS} days`}
              icon="UserCircleIcon"
              href="/admin/orders"
            />
          )}
        </div>

        {/* Trend */}
        <section className="card-warm p-6 mb-8">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="font-sans font-bold text-base text-foreground">
                Requests and payments
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Last {WINDOW_DAYS} days · {stats.newCustomers30} new customers
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-primary" /> Requests
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-accent" /> Paid
              </span>
            </div>
          </div>
          <OrdersChart data={stats.daily} />
        </section>

        {/* The two real queues */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
          <AttentionList
            title="Waiting on you"
            description="Oldest requests with notes still to check"
            emptyMessage="Nothing waiting — every request has been answered."
            orders={stats.needsAvailability}
            total={stats.pendingItems}
            moreHref="/admin/orders?status=pending"
            render={(order) => `${order.pendingItems} note${order.pendingItems === 1 ? '' : 's'}`}
          />
          <AttentionList
            title="Ready to post"
            description="Paid orders with no tracking number"
            emptyMessage="Nothing to dispatch."
            orders={stats.needsDispatch}
            total={stats.awaitingDispatch}
            moreHref="/admin/orders?status=paid"
            render={(order) => formatPrice(order.pricePaise, order.currency)}
          />
        </div>

        {/* Status breakdown — the queue's own filters, as a summary */}
        <section className="card-warm p-6 mb-8">
          <h2 className="font-sans font-bold text-base text-foreground mb-4">
            All {stats.totalOrders} orders by status
          </h2>
          <div className="flex flex-wrap gap-2">
            {ORDER_STATUSES.map((value) => {
              const config = STATUS_CONFIG[value];
              const count = stats.statusCounts[value] ?? 0;
              return (
                <Link
                  key={value}
                  href={`/admin/orders?status=${value}`}
                  className={`px-3.5 py-2 rounded-full text-xs font-semibold border bg-background border-border hover:border-primary/40 transition-colors ${config.color}`}
                >
                  {config.label} ({count})
                </Link>
              );
            })}
          </div>
        </section>

        {/* Content and system health, side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <section className="card-warm p-6">
            <h2 className="font-sans font-bold text-base text-foreground mb-4">Content</h2>
            <div className="flex flex-col gap-3 text-sm">
              <Link
                href="/admin/pages"
                className="flex items-center justify-between hover:text-primary transition-colors"
              >
                <span className="text-muted-foreground">Pages in draft</span>
                <span className="font-bold text-foreground">{stats.content.draftPages}</span>
              </Link>
              <Link
                href="/admin/blog"
                className="flex items-center justify-between hover:text-primary transition-colors"
              >
                <span className="text-muted-foreground">Blog posts in draft</span>
                <span className="font-bold text-foreground">{stats.content.draftPosts}</span>
              </Link>
            </div>
          </section>

          {/* Owner-only: an error message can name internals staff need not see. */}
          {isOwner && (
            <section className="card-warm p-6">
              <div className="flex items-center justify-between gap-4 mb-4">
                <h2 className="font-sans font-bold text-base text-foreground">System health</h2>
                {/* A JSON endpoint, not a page: client-side navigation would
                    try to render it as one. eslint-disable-next-line
                    @next/next/no-html-link-for-pages */}
                <a
                  href="/api/health"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-semibold text-primary"
                >
                  Full report
                </a>
              </div>
              {stats.errors24h === 0 ? (
                <p className="flex items-center gap-2 text-sm text-green-700">
                  <Icon name="CheckCircleIcon" size={16} />
                  No errors recorded in the last 24 hours.
                </p>
              ) : (
                <>
                  <p className="flex items-center gap-2 text-sm text-red-600 mb-3">
                    <Icon name="ExclamationTriangleIcon" size={16} />
                    {stats.errors24h} error{stats.errors24h === 1 ? '' : 's'} in the last 24 hours.
                  </p>
                  <ul className="flex flex-col gap-2">
                    {stats.latestErrors.map((error) => (
                      <li key={error.id} className="text-xs">
                        <span className="font-mono font-semibold text-foreground">
                          {error.scope}
                        </span>
                        <span className="text-muted-foreground">
                          {' '}
                          · {formatDateTime(error.created_at)}
                        </span>
                        <p className="text-muted-foreground break-words">{error.message}</p>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
