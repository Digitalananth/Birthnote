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
  title: 'Reports — My Lucky Dates admin',
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

/**
 * Presets as links, plus a custom from/to that works without client JS.
 *
 * Whatever the notes ledger is searching for rides along in both, so changing
 * the date range narrows the same search rather than silently dropping it.
 */
function RangeControl({ range, search }: { range: ReportRange; search: string }) {
  const carry = search ? `&${search}` : '';
  return (
    <div className="flex flex-col gap-3 mb-8">
      <div className="flex flex-wrap gap-2">
        {RANGE_PRESETS.map((preset) => (
          <Link
            key={preset.key}
            href={`/admin/reports?preset=${preset.key}${carry}`}
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
        {/* One hidden field per active notes filter, so a range change keeps them. */}
        {Array.from(new URLSearchParams(search).entries()).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
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

/** Rows of the sold-note ledger per screen. The CSV is never paginated. */
const NOTES_PER_PAGE = 50;

const hours = (value: number | null) =>
  value === null ? '—' : value < 48 ? `${value} h` : `${Math.round(value / 24)} d`;

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    preset?: string;
    from?: string;
    to?: string;
    serial?: string;
    noteDate?: string;
    page?: string;
  }>;
}) {
  const owner = await requireOwner('/admin/reports');
  const params = await searchParams;
  const range = resolveRange(params);

  const serial = (params.serial ?? '').trim().slice(0, 60);
  // A date on a note is only ever digits and separators; anything else is a
  // typo or a paste, and dropping it keeps a junk search from reading as
  // "we never sold that note".
  const noteDate = (params.noteDate ?? '')
    .trim()
    .replace(/[^0-9/-]/g, '')
    .slice(0, 10);
  // The notes ledger's filters as a query string, shared by every link and
  // form on the page that must not lose them.
  const notesFilters = new URLSearchParams();
  if (serial) notesFilters.set('serial', serial);
  if (noteDate) notesFilters.set('noteDate', noteDate);
  const notesSearch = notesFilters.toString();
  // A page number out of a query string is whatever someone typed; anything
  // that is not a positive integer is page one.
  const page = Math.max(Math.trunc(Number(params.page)) || 1, 1);
  const { sales, demand, funnel, speed, customers, notes } = await getAllReports(range, {
    serial,
    noteDate,
    limit: NOTES_PER_PAGE,
    offset: (page - 1) * NOTES_PER_PAGE,
  });

  const csv = (report: string) => `/api/admin/reports?report=${report}&${rangeQuery(range)}`;
  const notesQuery = (next: number) =>
    `/admin/reports?${rangeQuery(range)}${notesSearch ? `&${notesSearch}` : ''}${
      next > 1 ? `&page=${next}` : ''
    }#notes`;
  const lastPage = Math.max(Math.ceil(notes.total / NOTES_PER_PAGE), 1);
  const price = (paise: number) => formatPrice(paise, sales.currency);

  return (
    <main className="min-h-screen bg-secondary/20 px-4 md:px-10 py-10">
      <div className="max-w-6xl mx-auto">
        <AdminNav admin={owner} current="reports" />

        <div className="mb-6">
          <p className="text-xs uppercase tracking-widest text-primary font-bold mb-1">
            My Lucky Dates
          </p>
          <h1 className="font-sans font-extrabold text-2xl md:text-3xl text-foreground">Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {range.label} · {range.from} to {range.to} · grouped by {range.granularity}
          </p>
        </div>

        <RangeControl range={range} search={notesSearch} />

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

        {/* 6 — Sold notes, by serial number */}
        <Section
          title="Notes sold"
          description="Every banknote that went out on a paid order in this range — serial number, what it was, and who bought it. Both searches match any part of what you type."
          csv={`${csv('notes')}${notesSearch ? `&${notesSearch}` : ''}`}
        >
          <div id="notes" className="scroll-mt-6">
            <form action="/admin/reports" method="get" className="mb-6">
              {/* The range travels with the search; without it, searching would
                  reset the dates the owner just chose. */}
              {range.preset === 'custom' ? (
                <>
                  <input type="hidden" name="from" value={range.from} />
                  <input type="hidden" name="to" value={range.to} />
                </>
              ) : (
                <input type="hidden" name="preset" value={range.preset} />
              )}
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-muted-foreground">Serial number</span>
                  <input
                    type="search"
                    name="serial"
                    defaultValue={serial}
                    maxLength={60}
                    placeholder="e.g. 5AB 123456"
                    className="px-3 py-2 rounded-xl border border-border bg-background text-sm font-mono w-56 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-muted-foreground">Date on note</span>
                  {/* The same rule the server applies, enforced before the
                      search is sent: digits and separators only, and a
                      numeric keypad on a phone. */}
                  <input
                    type="search"
                    name="noteDate"
                    defaultValue={noteDate}
                    maxLength={10}
                    inputMode="numeric"
                    pattern="[0-9/-]*"
                    title="Digits and / or - only, e.g. 15/08/1947 or 1947"
                    placeholder="15/08/1947 or 1947"
                    className="px-3 py-2 rounded-xl border border-border bg-background text-sm font-mono w-44 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </label>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-foreground text-background text-sm font-semibold"
                >
                  Search
                </button>
                {notesSearch && (
                  <Link
                    href={`/admin/reports?${rangeQuery(range)}#notes`}
                    className="px-4 py-2 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </Link>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                The date on the note is the date printed on it, not when it sold.
              </p>
            </form>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
              <Figure
                label={notesSearch ? 'Notes matching' : 'Notes sold'}
                value={String(notes.total)}
                hint={
                  [
                    serial ? `serial contains "${serial}"` : null,
                    noteDate ? `note dated "${noteDate}"` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || undefined
                }
              />
              <Figure label="Value" value={formatPrice(notes.revenue, notes.currency)} />
              <Figure
                label="No serial recorded"
                value={String(notes.missingSerial)}
                hint="Sold notes still missing their number"
              />
              <Figure
                label="Showing"
                value={notes.total ? `${page} of ${lastPage}` : '—'}
                hint={`${NOTES_PER_PAGE} per page`}
              />
            </div>

            <Table
              headers={['Serial', 'Note', 'Order', 'Customer', 'Paid', 'Price']}
              align={['left', 'left', 'left', 'left', 'left', 'right']}
              empty={
                notesSearch
                  ? 'No note sold in this range matches that search. Try the All time preset — the range above is when a note sold, not the date on it.'
                  : 'No notes were sold in this range.'
              }
              rows={notes.notes.map((note) => [
                <span key="serial" className="font-mono text-foreground">
                  {note.serial ?? (
                    <span className="text-muted-foreground italic">not recorded</span>
                  )}
                </span>,
                <span key="note">
                  <span className="text-foreground">{note.displayDate}</span>
                  <span className="text-muted-foreground text-xs block">
                    {[note.denomination, note.condition, note.country]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </span>
                </span>,
                <Link
                  key="order"
                  href={`/admin/orders/${note.reference}`}
                  className="font-mono font-semibold text-primary"
                >
                  {note.reference}
                </Link>,
                <span key="customer">
                  <span className="text-foreground">{note.customerName}</span>
                  <span className="text-muted-foreground text-xs block">{note.customerEmail}</span>
                </span>,
                <span key="paid" className="text-muted-foreground">
                  {note.paidAt ?? '—'}
                </span>,
                formatPrice(note.price, note.currency),
              ])}
            />

            {lastPage > 1 && (
              <div className="flex items-center justify-between gap-3 mt-4">
                {page > 1 ? (
                  <Link
                    href={notesQuery(page - 1)}
                    className="px-4 py-2 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:text-foreground"
                  >
                    ← Previous
                  </Link>
                ) : (
                  <span />
                )}
                <span className="text-xs text-muted-foreground">
                  Page {page} of {lastPage}
                </span>
                {page < lastPage ? (
                  <Link
                    href={notesQuery(page + 1)}
                    className="px-4 py-2 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:text-foreground"
                  >
                    Next →
                  </Link>
                ) : (
                  <span />
                )}
              </div>
            )}
          </div>
        </Section>
      </div>
    </main>
  );
}
