import React from 'react';
import type { Order } from '@/lib/order-types';
import { formatPrice } from '@/lib/validation';
import { stateName } from '@/lib/india-gst';

/**
 * What the order costs, broken up the way the invoice will break it up.
 *
 * Shown wherever a total is shown, because a total with tax folded invisibly
 * into it is the thing customers write in to ask about. The tax is a single
 * "GST 5%" line until a delivery address tells us which side of the state line
 * this is — the amount is the same either way, so waiting to name it costs
 * nothing and guessing would be wrong half the time.
 */
export default function OrderTotals({ order }: { order: Order }) {
  const rows: { label: string; value: string; muted?: boolean }[] = [
    { label: 'Notes', value: formatPrice(order.pricePaise, order.currency) },
  ];

  if (order.shippingPaise > 0) {
    rows.push({
      label: 'Tracked delivery',
      value: formatPrice(order.shippingPaise, order.currency),
    });
  } else if (order.pricePaise > 0) {
    rows.push({ label: 'Tracked delivery', value: 'Free', muted: true });
  }

  if (order.taxPaise > 0) {
    if (order.igstPaise > 0) {
      rows.push({
        label: `IGST${order.shipping ? ` (${stateName(order.shipping.stateCode)})` : ''}`,
        value: formatPrice(order.igstPaise, order.currency),
      });
    } else if (order.cgstPaise > 0 || order.sgstPaise > 0) {
      rows.push({ label: 'CGST', value: formatPrice(order.cgstPaise, order.currency) });
      rows.push({ label: 'SGST', value: formatPrice(order.sgstPaise, order.currency) });
    } else {
      rows.push({ label: 'GST', value: formatPrice(order.taxPaise, order.currency) });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row) => (
        <div key={row.label} className="flex items-baseline justify-between text-sm">
          <span className="text-muted-foreground">{row.label}</span>
          <span className={row.muted ? 'text-muted-foreground' : 'text-foreground font-medium'}>
            {row.value}
          </span>
        </div>
      ))}

      <div className="flex items-baseline justify-between pt-3 mt-1 border-t border-border">
        <span className="font-sans font-bold text-foreground">Total</span>
        <span className="font-sans font-bold text-foreground">
          {formatPrice(order.totalPaise, order.currency)}
        </span>
      </div>

      {!order.shipping && order.taxPaise > 0 && (
        <p className="text-xs text-muted-foreground leading-relaxed">
          GST is charged at {order.gstGoodsRate}% on the notes and {order.gstShippingRate}% on
          delivery. Once you enter a delivery address it is shown as CGST + SGST or as IGST — the
          total is the same either way.
        </p>
      )}
    </div>
  );
}
