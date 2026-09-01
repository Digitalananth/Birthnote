/**
 * The date range every report shares.
 *
 * Client-safe (no server-only imports) so the range control, the page and the
 * CSV route all agree on what "?from=&to=" means without importing database
 * code into the browser.
 *
 * A range is a pair of calendar days, inclusive at both ends. The SQL uses
 * `>= from 00:00:00 AND < to + 1 day` rather than BETWEEN, so an order placed
 * at 23:30 on the last day is inside the range instead of silently outside it.
 */

export const RANGE_PRESETS = [
  { key: '7d', label: 'Last 7 days', days: 7 },
  { key: '30d', label: 'Last 30 days', days: 30 },
  { key: '90d', label: 'Last 90 days', days: 90 },
  { key: '365d', label: 'Last 12 months', days: 365 },
  { key: 'all', label: 'All time', days: 0 },
] as const;

export type RangePresetKey = (typeof RANGE_PRESETS)[number]['key'];

/** Anything older than this is "all time" — My Lucky Dates did not exist before it. */
const EPOCH = '2024-01-01';

export type Granularity = 'day' | 'week' | 'month';

export interface ReportRange {
  /** YYYY-MM-DD, inclusive. */
  from: string;
  /** YYYY-MM-DD, inclusive. */
  to: string;
  /** Exclusive upper bound for SQL: `to` plus one day. */
  toExclusive: string;
  days: number;
  granularity: Granularity;
  /** The equal-length range immediately before this one, for comparisons. */
  previous: { from: string; toExclusive: string };
  preset: RangePresetKey | 'custom';
  label: string;
}

const DAY_MS = 86_400_000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function shift(day: string, days: number): string {
  return toISO(new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS));
}

function isValid(day: string | undefined): day is string {
  return Boolean(day && ISO.test(day) && !Number.isNaN(Date.parse(`${day}T00:00:00Z`)));
}

/**
 * Buckets wide enough to read. Thirty daily points is a chart; three hundred
 * and sixty-five is a smear, so a long range is grouped by week or month.
 */
function pickGranularity(days: number): Granularity {
  if (days <= 31) return 'day';
  if (days <= 182) return 'week';
  return 'month';
}

/**
 * Resolves ?preset= / ?from= / ?to= into a range.
 *
 * Explicit from/to wins; otherwise the preset; otherwise 30 days. Anything
 * unparseable falls back rather than throwing — a mistyped URL should show the
 * default report, not a 500.
 */
export function resolveRange(params: {
  preset?: string;
  from?: string;
  to?: string;
  today?: string;
}): ReportRange {
  const today = isValid(params.today) ? params.today : toISO(new Date());

  let from: string;
  let to: string;
  let preset: RangePresetKey | 'custom';

  if (isValid(params.from) || isValid(params.to)) {
    to = isValid(params.to) ? params.to : today;
    from = isValid(params.from) ? params.from : shift(to, -29);
    // A backwards range is a typo, not a request for no data.
    if (from > to) [from, to] = [to, from];
    preset = 'custom';
  } else {
    const match = RANGE_PRESETS.find((p) => p.key === params.preset) ?? RANGE_PRESETS[1];
    preset = match.key;
    to = today;
    from = match.days === 0 ? EPOCH : shift(today, -(match.days - 1));
  }

  const days = Math.max(Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1, 1);

  return {
    from,
    to,
    toExclusive: shift(to, 1),
    days,
    granularity: pickGranularity(days),
    previous: { from: shift(from, -days), toExclusive: from },
    preset,
    label:
      preset === 'custom'
        ? `${from} to ${to}`
        : (RANGE_PRESETS.find((p) => p.key === preset)?.label ?? 'Last 30 days'),
  };
}

/** Query string that keeps the current range when linking or exporting. */
export function rangeQuery(range: ReportRange): string {
  return range.preset === 'custom' ? `from=${range.from}&to=${range.to}` : `preset=${range.preset}`;
}
