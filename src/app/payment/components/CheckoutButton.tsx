'use client';

import React, { useState } from 'react';
import Script from 'next/script';
import Icon from '@/components/ui/AppIcon';

/**
 * Opens Razorpay's checkout over the payment page.
 *
 * Deliberately the *only* client component on the payment page that touches
 * money: no card fields exist anywhere in this codebase. What opens here is
 * Razorpay's own form, in Razorpay's own iframe, on Razorpay's origin — card
 * numbers and UPI ids are typed into their page, not ours, which is what keeps
 * the site out of PCI-DSS scope.
 *
 * The order summary above already prints the breakup — notes, delivery, GST —
 * because a Razorpay order is a single amount and the checkout shows only that
 * total. The customer sees what it is made of before this button is pressed.
 */

/** Only what we actually call. Razorpay's global has a much larger surface. */
interface RazorpayInstance {
  open(): void;
  on(event: 'payment.failed', handler: (response: unknown) => void): void;
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  name: string;
  description: string;
  prefill: { name: string; email: string; contact: string };
  notes: Record<string, string>;
  theme: { color: string };
  handler(response: { razorpay_payment_id: string }): void;
  modal: { ondismiss(): void };
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

interface CheckoutSession {
  orderId: string;
  keyId: string;
  amount: number;
  prefill: { name: string; email: string; contact: string };
}

export default function CheckoutButton({
  reference,
  amountLabel,
}: {
  reference: string;
  amountLabel: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  const startCheckout = async () => {
    setPending(true);
    setError('');
    try {
      // The button is disabled until the script loads, but a remount or a
      // slow network can still get someone here first.
      if (!window.Razorpay) {
        throw new Error('The secure checkout is still loading. Please try again in a moment.');
      }

      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference }),
      });
      const session = (await response.json().catch(() => ({}))) as Partial<CheckoutSession> & {
        error?: string;
      };
      if (!response.ok || !session.orderId || !session.keyId) {
        throw new Error(session.error || 'Could not start the payment. Please try again.');
      }

      const checkout = new window.Razorpay({
        key: session.keyId,
        amount: session.amount as number,
        currency: 'INR',
        order_id: session.orderId,
        name: 'My Lucky Dates',
        description: `Order ${reference}`,
        prefill: session.prefill ?? { name: '', email: '', contact: '' },
        notes: { reference },
        // --accent from tailwind.css, so the checkout does not arrive
        // looking like somebody else's site.
        theme: { color: '#C8965A' },
        /*
         * Razorpay hands the browser a signed confirmation here. It is *not*
         * what marks the order paid — a browser can be lied to, closed, or
         * simply never reach this line — so all it does is send the customer
         * to the page that reports status. The webhook is the truth, and the
         * success page says "confirming" until it lands.
         */
        handler: () => {
          window.location.href = `/payment/${reference}/success`;
        },
        modal: {
          // Closing the checkout is not an error, and saying "payment failed"
          // to someone who simply changed their mind is worse than saying
          // nothing. Just give them the button back.
          ondismiss: () => setPending(false),
        },
      });

      checkout.on('payment.failed', () => {
        setError(
          'That payment did not go through and you have not been charged. Please try again, or use a different method.'
        );
        setPending(false);
      });

      checkout.open();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start the payment.');
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="afterInteractive"
        onReady={() => setReady(true)}
        onError={() => setError('The secure checkout could not be loaded. Please reload the page.')}
      />

      <button
        type="button"
        onClick={startCheckout}
        disabled={pending || !ready}
        className="group w-full inline-flex items-center justify-center gap-2 px-8 py-4 bg-primary text-primary-foreground rounded-xl font-semibold text-base hover:bg-primary/90 transition-colors disabled:opacity-60"
      >
        {pending ? (
          <>
            <span className="w-4 h-4 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full animate-spin" />
            Opening secure checkout…
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
        Payment is handled by Razorpay — UPI, cards, netbanking and wallets. Your card and UPI
        details are entered on Razorpay&apos;s secure form and are never sent to or stored by My
        Lucky Dates.
      </p>
    </div>
  );
}
