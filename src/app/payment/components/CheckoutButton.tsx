'use client';

import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';

/**
 * Hands the customer off to Stripe Checkout.
 *
 * Deliberately the *only* client component on the payment page: no card
 * fields exist anywhere in this codebase, so card data never reaches our
 * server and the site stays out of PCI-DSS scope.
 */
export default function CheckoutButton({
  reference,
  amountLabel,
}: {
  reference: string;
  amountLabel: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const startCheckout = async () => {
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.url) {
        throw new Error(payload.error || 'Could not start the payment. Please try again.');
      }
      window.location.href = payload.url as string;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start the payment.');
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={startCheckout}
        disabled={pending}
        className="group w-full inline-flex items-center justify-center gap-2 px-8 py-4 bg-primary text-primary-foreground rounded-xl font-semibold text-base hover:bg-primary/90 transition-colors disabled:opacity-60"
      >
        {pending ? (
          <>
            <span className="w-4 h-4 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full animate-spin" />
            Redirecting to secure checkout…
          </>
        ) : (
          <>
            <Icon name="LockClosedIcon" size={18} />
            Pay {amountLabel} securely
            <Icon
              name="ArrowRightIcon"
              size={18}
              className="group-hover:translate-x-1 transition-transform"
            />
          </>
        )}
      </button>

      {error && (
        <p role="alert" className="text-sm text-red-600 text-center">
          {error}
        </p>
      )}

      <p className="text-xs text-muted-foreground text-center leading-relaxed">
        Payment is handled by Stripe. Your card details are entered on Stripe&apos;s secure page and
        are never sent to or stored by My Lucky Dates.
      </p>
    </div>
  );
}
