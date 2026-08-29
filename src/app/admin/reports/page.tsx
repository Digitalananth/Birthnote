import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import AdminNav from '@/app/admin/components/AdminNav';
import { requireOwner } from '@/lib/auth';
import { getAllReports } from '@/lib/admin-reports';
import { resolveRange, rangeQuery, RANGE_PRESETS, type ReportRange } from '@/lib/report-range';
import { formatPrice } from '@/lib/validation';

/**
 * Rendering strategy: SSR (force-dynamic).
 *
 * The range comes from the query string and the figures change with every
 * order; there is nothing here worth caching.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Reports — BirthNote admin',
  robots: { index: false, follow: false },
};

function Section({
  title,
  description,
  csv,
  children,
}: {
  title: string;
  description: string;
  csv: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card-warm p-6 mb-4">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="font-sans font-bold text-base text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
        {/* A file download, not a page: Link would try to render the CSV. */}
        <a
          href={csv}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors shrink-0"
        >
          <Icon name="DocumentTextIcon" size={14} />
          CSV
        </a>
      </div>
      {children}
    </section>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-widest font-bold text-muted-foreground mb-1">
        {label}
      </p>
      <p className="font-sans font-extrabold text-xl text-foreground">{value}</p>
      {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}

/** A percentage change, coloured by direction. Null when there is no prior. */
function Change({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">no prior period</span>;
  const up = value >= 0;
  return (
    <span className={up ? 'text-green-700' : 'text-red-600'}>
      {up ? '▲' : '▼'} {Math.abs(value)}% vs previous
    </span>
  );
}

function Table({
  headers,
  rows,
  empty,
  align = [],
}: {
  headers: string[];
  rows: React.ReactNode[][];
  empty: string;
  align?: ('left' | 'right')[];
}) {
  if (!rows.length) {
    return <p className="text-sm text-muted-foreground py-4 text-center">{empty}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {headers.map((header, index) => (
              <th
                key={header}
                className={`py-2 text-xs uppercase tracking-widest font-bold text-muted-foreground ${
                  align[index] === 'right' ? 'text-right' : 'text-left'
                }`}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-border/60 last:border-0">
              {row.map((value, index) => (
                <td
                  key={index}
                  className={`py-2.5 ${align[index] === 'right' ? 'text-right' : 'text-left'}`}
                >
                  {value}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Presets as links, plus a custom from/to that works without client JS. */
function RangeControl({ range }: { range: ReportRange }) {
  return (
    <div className="flex flex-col gap-3 mb-8">
      <div className="flex flex-wrap gap-2">
        {RANGE_PRESETS.map((preset) => (
          <Link
            key={preset.key}
            href={`/admin/reports?preset=${preset.key}`}
            className={`px-3.5 py-2 rounded-full text-xs font-semibold border transition-colors ${
              range.preset === preset.key
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground border-border hover:text-foreground'
            }`}
          >
            {preset.label}
          </Link>
        ))}
      </div>
      <form action="/admin/reports" method="get" className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-muted-foreground">From</span>
          <input
            type="date"
            name="from"
            defaultValue={range.from}
            className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-muted-foreground">To</span>
          <input
            type="date"
            name="to"
            defaultValue={range.to}
            className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </label>
        <button
          type="submit"
          className="px-5 py-2 rounded-xl bg-foreground text-background text-sm font-semibold"
        >
          Apply
        </button>
      </form>
    </div>
  );
}

const hours = (value: number | null) =>
  value === null ? '—' : value < 48 ? `${value} h` : `${Math.round(value / 24)} d`;

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; from?: string; to?: string }>;
}) {
  const owner = await requireOwner('/admin/reports');
  const params = await searchParams;
  const range = resolveRange(params);
  const { sales, demand, funnel, speed, customers } = await getAllReports(range);

  const csv = (report: string) => `/api/admin/reports?report=${report}&${rangeQuery(range)}`;
  const price = (paise: number) => formatPrice(paise, sales.currency);

  return (
    <main className="min-h-screen bg-secondary/20 px-4 md:px-10 py-10">
      <div className="max-w-6xl mx-auto">
        <AdminNav admin={owner} current="reports" />

        <div className="mb-6">
          <p className="text-xs uppercase tracking-widest text-primary font-bold mb-1">BirthNote</p>
          <h1 className="font-sans font-extrabold text-2xl md:text-3xl text-foreground">Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {range.label} · {range.from} to {range.to} · grouped by {range.granularity}
          </p>
        </div>

        <RangeControl range={range} />

        {/* 1 — Sales */}
        <Section
          title="Sales"
          description="Paid orders only. An order counts on the day it was paid for, not requested."
          csv={csv('sales')}
        >
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            <Figure
              label="Revenue"
              value={price(sales.totals.revenue)}
              hint={<Change value={sales.change.revenue} />}
            />
            <Figure
              label="Paid orders"
              value={String(sales.totals.orders)}
              hint={<Change value={sales.change.orders} />}
            />
            <Figure label="Notes sold" value={String(sales.totals.notes)} />
            <Figure label="Average order" value={price(sales.totals.averageOrder)} />
          </div>
          <Table
            headers={['Period', 'Orders', 'Notes', 'Revenue']}
            align={['left', 'right', 'right', 'right']}
            empty="Nothing was paid for in this range."
            rows={sales.periods.map((period) => [
              period.period,
              period.orders,
              period.notes,
              price(period.revenue),
            ])}
          />
        </Section>

        {/* 2 — Demand and availability */}
        <Section
          title="Demand and availability"
          description="What was asked for, and how much of it you could supply. Fill rate counts decided notes only — pending ones are work outstanding, not failures."
          csv={csv('demand')}
        >
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            <Figure label="Notes requested" value={String(demand.totals.requested)} />
            <Figure label="Found" value={String(demand.totals.available)} />
            <Figure label="Not found" value={String(demand.totals.unavailable)} />
            <Figure
              label="Fill rate"
              value={demand.totals.fillRate === null ? '—' : `${demand.totals.fillRate}%`}
              hint={`${demand.totals.pending} still to check`}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
              <h3 className="text-xs uppercase tracking-widest font-bold text-muted-foreground mb-2">
                By decade
              </h3>
              <Table
                headers={['Decade', 'Asked', 'Found', 'Fill rate']}
                align={['left', 'right', 'right', 'right']}
                empty="No notes requested in this range."
                rows={demand.byDecade.map((group) => [
                  group.key,
                  group.requested,
                  group.available,
                  group.fillRate === null ? '—' : `${group.fillRate}%`,
                ])}
              />
            </div>
            <div>
              <h3 className="text-xs uppercase tracking-widest font-bold text-muted-foreground mb-2">
                By denomination
              </h3>
              <Table
                headers={['Denomination', 'Asked', 'Found', 'Fill rate']}
                align={['left', 'right', 'right', 'right']}
                empty="No notes requested in this range."
                rows={demand.byDenomination.map((group) => [
                  group.key,
                  group.requested,
                  group.available,
                  group.fillRate === null ? '—' : `${group.fillRate}%`,
                ])}
              />
            </div>
          </div>

          <h3 className="text-xs uppercase tracking-widest font-bold text-muted-foreground mt-8 mb-2">
            Dates you could not supply
          </h3>
          <p className="text-xs text-muted-foreground mb-2">
            Commonest misses first — in effect, a buying list.
          </p>
          <Table
            headers={['Date', 'Asked', 'Missed']}
            align={['left', 'right', 'right']}
            empty="Every requested date was filled."
            rows={demand.topMissing.map((row) => [row.displayDate, row.requested, row.unavailable])}
          />
        </Section>

        {/* 3 — Funnel */}
        <Section
          title="Conversion funnel"
          description="Every request received in this range, and how far it got — however long that took."
          csv={csv('funnel')}
        >
          <div className="flex flex-col gap-2 mb-6">
            {funnel.stages.map((stage) => (
              <div key={stage.key} className="flex items-center gap-3">
                <span className="w-44 shrink-0 text-sm text-muted-foreground">{stage.label}</span>
                <div className="flex-1 h-7 rounded-lg bg-secondary/40 overflow-hidden">
                  <div
                    className="h-full bg-primary/70 rounded-lg"
                    style={{ width: `${stage.ofRequests ?? 0}%` }}
                  />
                </div>
                <span className="w-28 shrink-0 text-right text-sm">
                  <span className="font-bold text-foreground">{stage.count}</span>
                  <span className="text-muted-foreground">
                    {stage.ofRequests === null ? '' : ` · ${stage.ofRequests}%`}
                  </span>
                </span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-border">
            <Figure
              label="Confirmed, never paid"
              value={String(funnel.confirmedNotPaid)}
              hint="Notes you found and quoted that went unsold"
            />
            <Figure
              label="Declared unavailable"
              value={String(funnel.declaredUnavailable)}
              hint="Requests you could not fill at all"
            />
          </div>
        </Section>

        {/* 4 — Fulfilment speed */}
        <Section
          title="Fulfilment speed"
          description="Time between stages, for requests received in this range. The 90th percentile is the slow tail — nine in ten were faster than it."
          csv={csv('speed')}
        >
          <Table
            headers={['Stage', 'Measured', 'Median', '90th percentile']}
            align={['left', 'right', 'right', 'right']}
            empty="No completed stages in this range."
            rows={speed.stages.map((stage) => [
              stage.label,
              stage.samples,
              hours(stage.medianHours),
              hours(stage.p90Hours),
            ])}
          />
          {speed.oldestWaitingReference && (
            <p className="text-xs text-muted-foreground mt-4">
              Oldest unanswered request right now:{' '}
              <Link
                href={`/admin/orders/${speed.oldestWaitingReference}`}
                className="font-mono font-semibold text-primary"
              >
                {speed.oldestWaitingReference}
              </Link>{' '}
              · waiting {hours(speed.oldestWaitingHours)}. Not limited to this range.
            </p>
          )}
        </Section>

        {/* 5 — Customers */}
        <Section
          title="Customers"
          description="Returning means the customer had ordered before — at any time, not only within this range."
          csv={csv('customers')}
        >
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            <Figure label="New accounts" value={String(customers.newAccounts)} />
            <Figure label="Orders from new" value={String(customers.ordersFromNew)} />
            <Figure label="Orders from returning" value={String(customers.ordersFromReturning)} />
            <Figure
              label="Repeat rate"
              value={customers.repeatRate === null ? '—' : `${customers.repeatRate}%`}
              hint="Of all customers ever, share with more than one order"
            />
          </div>
          <h3 className="text-xs uppercase tracking-widest font-bold text-muted-foreground mb-2">
            Top customers by spend in this range
          </h3>
          <Table
            headers={['Customer', 'Orders', 'Spend']}
            align={['left', 'right', 'right']}
            empty="Nobody paid in this range."
            rows={customers.topCustomers.map((customer) => [
              <span key={customer.email}>
                <span className="text-foreground">{customer.name}</span>
                <span className="text-muted-foreground text-xs block">{customer.email}</span>
              </span>,
              customer.orders,
              formatPrice(customer.revenue, customer.currency),
            ])}
          />
        </Section>
      </div>
    </main>
  );
}
