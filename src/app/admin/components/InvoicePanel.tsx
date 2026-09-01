'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';

/**
 * The order's invoice, and a way to raise one that never got raised.
 *
 * Issuing happens automatically when Stripe confirms the payment. It can still
 * fail — most likely because the GSTIN had not been filled in on the settings
 * page yet — and when it does the money has already changed hands, so there
 * has to be a way to put it right that does not involve charging anyone again.
 */
export default function InvoicePanel({
  reference,
  invoiceNumber,
  canIssue,
}: {
  reference: string;
  invoiceNumber: string | null;
  /** False before payment: there is nothing to invoice yet. */
  canIssue: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const issue = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/orders/${reference}/invoice`, { method: 'POST' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload.error || 'Could not issue the invoice.');
        return;
      }
      router.refresh();
    } catch {
      setError('We could not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  if (invoiceNumber) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-mono font-bold text-foreground">{invoiceNumber}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Raised when the payment landed.</p>
        </div>
        <Link
          href={`/invoice/${reference}`}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary text-foreground text-sm font-semibold hover:bg-secondary/70 transition-colors"
        >
          <Icon name="DocumentTextIcon" size={15} />
          Open
        </Link>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-muted-foreground leading-relaxed mb-3">
        {canIssue
          ? 'This order is paid but has no invoice. That usually means the invoice settings were incomplete when the payment arrived.'
          : 'An invoice is raised automatically once this order has been paid for.'}
      </p>
      {canIssue && (
        <button
          type="button"
          onClick={issue}
          disabled={busy}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          <Icon name="DocumentTextIcon" size={15} />
          {busy ? 'Issuing…' : 'Issue invoice now'}
        </button>
      )}
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}
