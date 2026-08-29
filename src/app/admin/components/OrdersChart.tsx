'use client';

import React from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DailyPoint } from '@/lib/admin-stats';

/**
 * Requests against payments, last 30 days.
 *
 * The only client component on the dashboard: recharts measures the DOM, so
 * it cannot render on the server. It takes plain numbers as props — the page
 * stays a server component and no database code reaches the browser.
 *
 * Colours are the theme's own hexes rather than `var(--primary)`: recharts
 * writes them into SVG `fill`/`stroke` attributes, where a CSS variable
 * resolves in modern browsers but not in the gradient stops below.
 */
const INK = '#8B4513'; // --primary
const GOLD = '#C8965A'; // --accent
const MUTED = '#7A5C44'; // --muted-foreground
const BORDER = '#DDD0C0'; // --border

/** "2026-08-29" → "29 Aug", the only part of the date an axis has room for. */
function tickLabel(date: string): string {
  const [, month, day] = date.split('-');
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${Number(day)} ${months[Number(month) - 1] ?? ''}`;
}

export default function OrdersChart({ data }: { data: DailyPoint[] }) {
  return (
    <div
      className="h-64 w-full"
      role="img"
      aria-label="Requests and payments over the last 30 days"
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <defs>
            <linearGradient id="fillCreated" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={INK} stopOpacity={0.28} />
              <stop offset="100%" stopColor={INK} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="fillPaid" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={GOLD} stopOpacity={0.3} />
              <stop offset="100%" stopColor={GOLD} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={tickLabel}
            tick={{ fontSize: 11, fill: MUTED }}
            tickLine={false}
            axisLine={{ stroke: BORDER }}
            minTickGap={24}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: MUTED }}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <Tooltip
            labelFormatter={(value) => tickLabel(String(value))}
            contentStyle={{
              borderRadius: 12,
              border: `1px solid ${BORDER}`,
              fontSize: 12,
            }}
          />
          <Area
            type="monotone"
            dataKey="created"
            name="Requests"
            stroke={INK}
            strokeWidth={2}
            fill="url(#fillCreated)"
          />
          <Area
            type="monotone"
            dataKey="paid"
            name="Paid"
            stroke={GOLD}
            strokeWidth={2}
            fill="url(#fillPaid)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
