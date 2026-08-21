import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import AdminNav from '@/app/admin/components/AdminNav';
import { requireAdmin } from '@/lib/auth';
import {
  listOrders,
  getStatusCounts,
  summariseOrder,
  ORDER_STATUSES,
  type OrderStatus,
} from '@/lib/orders';
import { formatPrice } from '@/lib/validation';
import { STATUS_CONFIG, formatDateTime } from '@/lib/order-status';

/**
 * Rendering strategy: SSR (force-dynamic).
 *
 * An operational queue must never be cached — the whole point is seeing what
 * arrived seconds ago.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Orders — BirthNote admin',
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 25;

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  // The middleware only checks the cookie exists; this resolves the session
  // and gives us the admin whose name goes on anything they change.
  const admin = await requireAdmin('/admin');

  const { status, q, page } = await searchParams;
  const activeStatus = ORDER_STATUSES.includes(status as OrderStatus)
    ? (status as OrderStatus)
    : undefined;
  const pageNumber = Math.max(Number.parseInt(page || '1', 10) || 1, 1);

  const [{ orders, total }, counts] = await Promise.all([
    listOrders({
      status: activeStatus,
      search: q?.trim() || undefined,
      limit: PAGE_SIZE,
      offset: (pageNumber - 1) * PAGE_SIZE,
    }),
    getStatusCounts(),
  ]);

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const buildHref = (params: Record<string, string | undefined>) => {
    const search = new URLSearchParams();
    const merged = { status: activeStatus, q, ...params };
    for (const [key, value] of Object.entries(merged)) {
      if (value) search.set(key, value);
    }
    const query = search.toString();
    return query ? `/admin?${query}` : '/admin';
  };

  return (
    <main className="min-h-screen bg-secondary/20 px-4 md:px-10 py-10">
      <div className="max-w-6xl mx-auto">
        <AdminNav admin={admin} />

        <div className="mb-8">
          <p className="text-xs uppercase tracking-widest text-primary font-bold mb-1">
            BirthNote
          </p>
          <h1 className="font-sans font-extrabold text-2xl md:text-3xl text-foreground">
            Order queue
          </h1>
        </div>

        {/* Status filters */}
        <div className="flex flex-wrap gap-2 mb-6">
          <Link
            href={buildHref({ status: undefined, page: undefined })}
            className={`px-3.5 py-2 rounded-full text-xs font-semibold border transition-colors ${
              !activeStatus
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground border-border hover:text-foreground'
            }`}
          >
            All ({Object.values(counts).reduce((sum, count) => sum + count, 0)})
          </Link>
          {ORDER_STATUSES.map((value) => (
            <Link
              key={value}
              href={buildHref({ status: value, page: undefined })}
              className={`px-3.5 py-2 rounded-full text-xs font-semibold border transition-colors ${
                activeStatus === value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:text-foreground'
              }`}
            >
              {STATUS_CONFIG[value].label} ({counts[value] ?? 0})
            </Link>
          ))}
        </div>

        {/* Search — a plain GET form, so it works without any client JS */}
        <form action="/admin" method="get" className="flex gap-2 mb-8">
          {activeStatus && <input type="hidden" name="status" value={activeStatus} />}
          <input
            name="q"
            defaultValue={q ?? ''}
            placeholder="Search reference, name or email"
            className="flex-1 px-4 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl bg-foreground text-background text-sm font-semibold"
          >
            Search
          </button>
        </form>

        {/* Orders */}
        {orders.length === 0 ? (
          <div className="card-warm p-12 text-center">
            <Icon name="ArchiveBoxIcon" size={28} className="text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No orders match this view.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {orders.map((order) => {
              const config = STATUS_CONFIG[order.status];
              return (
                <Link
                  key={order.reference}
                  href={`/admin/orders/${order.reference}`}
                  className="card-warm p-5 flex flex-wrap items-center gap-4 hover:border-primary/40 transition-colors"
                >
                  <div className={`w-10 h-10 rounded-full ${config.bg} flex items-center justify-center shrink-0`}>
                    <Icon name={config.icon} size={18} className={config.color} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono font-bold text-sm text-foreground">{order.reference}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {order.customerName} · {order.customerEmail}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono font-bold text-sm text-primary">{summariseOrder(order)}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(order.createdAt)}
                    </p>
                  </div>
                  <div className="text-right shrink-0 w-32">
                    <p className={`text-xs font-semibold ${config.color}`}>{config.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatPrice(order.pricePaise, order.currency)}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 mt-8 text-sm">
            {pageNumber > 1 && (
              <Link href={buildHref({ page: String(pageNumber - 1) })} className="text-primary font-semibold">
                ← Previous
              </Link>
            )}
            <span className="text-muted-foreground">
              Page {pageNumber} of {totalPages}
            </span>
            {pageNumber < totalPages && (
              <Link href={buildHref({ page: String(pageNumber + 1) })} className="text-primary font-semibold">
                Next →
              </Link>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
