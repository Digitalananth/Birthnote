'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';

/**
 * Asks our server to read the latest scans from Shiprocket, then reloads.
 *
 * For when a webhook was missed: the page already refreshes itself when its
 * tracking is over half an hour old, and this lets the customer ask sooner.
 */
export default function RefreshTrackingButton({ reference }: { reference: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');

  const refresh = async () => {
    setWorking(true);
    setMessage('');
    try {
      const response = await fetch(`/api/track/${reference}/refresh`, { method: 'POST' });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setMessage(payload.error || 'Could not refresh right now.');
      }
      startTransition(() => router.refresh());
    } catch {
      setMessage('Could not reach the server.');
    } finally {
      setWorking(false);
    }
  };

  const busy = working || isPending;
  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={refresh}
        disabled={busy}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-foreground text-sm font-semibold hover:bg-secondary transition-colors disabled:opacity-50"
      >
        <Icon name="ArrowPathIcon" size={15} className={busy ? 'animate-spin' : undefined} />
        {busy ? 'Checking…' : 'Refresh tracking'}
      </button>
      {message && <p className="text-xs text-red-600">{message}</p>}
    </div>
  );
}
