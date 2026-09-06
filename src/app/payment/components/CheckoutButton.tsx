'use client';

import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';

/**
 * Sends the customer to PhonePe to pay.
 *
 * Deliberately the *only* client component on the payment page that touches
 * money, and it touches very little of it: no card fields exist anywhere in
 * this codebase, and unlike the modal this replaced there is no gateway script
 * on the page either. PhonePe hosts the payment page on its own origin — card
 * numbers and UPI ids are typed there, not here, which is what keeps the site
 * out of PCI-DSS scope.
 *
 * The order summary above already prints the breakup — notes, delivery, GST —
 * because PhonePe is handed one amount and shows only that total. The customer
 * sees what it is made of before this button is pressed.
 *
 * Nothing comes back on the return leg: PhonePe redirects to the success page
 * with no status and no signature. That page asks PhonePe directly, and the
 * webhook is the other half. Neither is this component's business.
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
      const session = (await response.json().catch(() => ({}))) as {
        redirectUrl?: string;
        error?: string;
      };
      if (!response.ok || !session.redirectUrl) {
        throw new Error(session.error || 'Could not start the payment. Please try again.');
      }

      /*
       * `pending` is deliberately left set.
       *
       * The navigation that follows takes a moment, and a button that springs
       * back to "Pay ₹x" in that moment invites a second press — which would
       * mint a second PhonePe order for the same money. It stays spinning
       * until the page is gone.
       */
      window.location.href = session.redirectUrl;
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
            Taking you to PhonePe…
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
        Payment is handled by PhonePe — UPI, cards, netbanking and wallets. You will be taken to
        PhonePe&apos;s secure page to pay and brought straight back here. Your card and UPI details
        are entered on PhonePe&apos;s page and are never sent to or stored by My Lucky Dates.
      </p>
    </div>
  );
}
