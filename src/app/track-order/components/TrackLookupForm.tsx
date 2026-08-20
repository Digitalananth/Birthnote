'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import { isValidReference } from '@/lib/validation';

/**
 * The only interactive part of the tracking flow.
 *
 * It does not fetch anything — it validates the shape of the reference and
 * navigates to /track-order/[reference], which renders the real record on the
 * server. Keeping the fetch out of the client means the order data never has
 * to round-trip as JSON and the page is shareable as a URL.
 */
export default function TrackLookupForm({ initialError }: { initialError?: string }) {
  const router = useRouter();
  const [reference, setReference] = useState('');
  const [error, setError] = useState(initialError || '');
  const [pending, setPending] = useState(false);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = reference.trim().toUpperCase();
    if (!trimmed) {
      setError('Enter your reference number.');
      return;
    }
    if (!isValidReference(trimmed)) {
      setError('That does not look like a BirthNote reference (e.g. BN-140387-K9TQXM).');
      return;
    }
    setError('');
    setPending(true);
    router.push(`/track-order/${trimmed}`);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <label htmlFor="reference" className="sr-only">
        Reference number
      </label>
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          id="reference"
          name="reference"
          value={reference}
          onChange={(event) => setReference(event.target.value.toUpperCase())}
          placeholder="BN-140387-K9TQXM"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'reference-error' : undefined}
          className="flex-1 px-5 py-4 rounded-xl border border-border bg-background font-mono tracking-wider text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 px-7 py-4 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          <Icon name="MagnifyingGlassIcon" size={16} />
          {pending ? 'Looking up…' : 'Track order'}
        </button>
      </div>
      {error && (
        <p id="reference-error" role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}
