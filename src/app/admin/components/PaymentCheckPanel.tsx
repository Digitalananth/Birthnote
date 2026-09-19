'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import type { Order } from '@/lib/order-types';

/**
 * Reconciles one order with PayU on demand.
 *
 * For the customer who says they paid while the order says they did not. It
 * is not a "mark paid" button: the server asks PayU about every checkout
 * attempt the order had and settles only on PayU's word, for the full amount —
 * and then the invoice and receipt go out as for any other payment.
 */
const OUTCOMES: Record<string, string> = {
  settled: 'paid — the order has been settled',
  already_paid: 'the order was already paid',
  not_paid: 'PayU has no successful payment under this ID',
  amount_mismatch: 'PayU has a payment, but not for this order’s total — see /api/health',
  unmatched: 'no order holds this ID',
  not_payable: 'the order is not waiting on a PayU payment',
};

interface Result {
  txnId: string;
  outcome: string;
}

export default function PaymentCheckPanel({ order }: { order: Order }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [working, setWorking] = useState(false);
  const [txnId, setTxnId] = useState('');
  const [results, setResults] = useState<Result[] | null>(null);
  const [error, setError] = useState('');

  const check = async () => {
    setError('');
    setResults(null);
    setWorking(true);
    try {
      const response = await fetch(`/api/admin/orders/${order.reference}/payment-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txnId: txnId.trim() || undefined }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'The check failed.');
      setResults(payload.results as Result[]);
      if (payload.settled) startTransition(() => router.refresh());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The check failed.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-xs max-w-sm">
        <span className="font-semibold uppercase tracking-wide text-muted-foreground">
          PayU transaction ID (optional)
        </span>
        <input
          value={txnId}
          placeholder="Only if PayU shows a payment under an ID not listed here"
          onChange={(event) => setTxnId(event.target.value)}
          className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </label>

      <div>
        <button
          type="button"
          disabled={working || isPending}
          onClick={check}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {working ? 'Asking PayU…' : 'Check with PayU'}
        </button>
      </div>

      {results &&
        (results.length ? (
          <ul className="flex flex-col gap-1">
            {results.map((result) => (
              <li key={result.txnId} className="text-sm">
                <span className="font-mono text-xs text-foreground">{result.txnId}</span>
                <span
                  className={
                    result.outcome === 'settled' ? 'text-green-700' : 'text-muted-foreground'
                  }
                >
                  {' '}
                  — {OUTCOMES[result.outcome] ?? result.outcome}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            This order has no checkout attempts on record. If PayU shows a payment, enter its
            transaction ID above.
          </p>
        ))}

      {error && (
        <p role="alert" className="flex items-start gap-2 text-sm text-red-600">
          <Icon name="ExclamationTriangleIcon" size={16} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
