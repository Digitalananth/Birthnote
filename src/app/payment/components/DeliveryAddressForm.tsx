'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import { INDIAN_STATES } from '@/lib/india-gst';
import { validateAddress, type AddressErrors, type AddressInput } from '@/lib/address';
import type { ShippingAddress } from '@/lib/order-types';

/**
 * Where the parcel goes — asked before payment, not after.
 *
 * Two reasons it lives here rather than at Stripe. It is a courier's
 * instruction, so the customer should be able to correct it without going near
 * a card form; and the state decides whether the tax is CGST + SGST or IGST,
 * which has to be settled before the charge rather than discovered on the
 * invoice afterwards.
 *
 * Saving refreshes the server component above it, so the totals redraw with
 * the split filled in. The amount does not change — the rate is the same
 * either way — which is why the customer is never shown a total that moves
 * under them.
 */
export default function DeliveryAddressForm({
  reference,
  address,
  customerName,
}: {
  reference: string;
  address: ShippingAddress | null;
  /** Prefilled from the order, since it is almost always the same person. */
  customerName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!address);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<AddressErrors>({});
  const [message, setMessage] = useState('');
  const [fields, setFields] = useState<AddressInput>({
    name: address?.name ?? customerName,
    line1: address?.line1 ?? '',
    line2: address?.line2 ?? '',
    city: address?.city ?? '',
    stateCode: address?.stateCode ?? '',
    pincode: address?.pincode ?? '',
    phone: address?.phone ?? '',
    buyerGstin: '',
  });

  const set =
    (key: keyof AddressInput) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setFields((prev) => ({ ...prev, [key]: event.target.value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage('');

    // Checked here with the same function the API uses, so a typo is caught
    // before a round trip and the wording cannot drift between the two.
    const local = validateAddress(fields);
    if (!local.address) {
      setErrors(local.errors);
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(`/api/orders/${reference}/address`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrors((payload.errors as AddressErrors) ?? {});
        setMessage(payload.error || 'We could not save that address.');
        return;
      }
      setErrors({});
      setOpen(false);
      // The totals above are rendered on the server from the order row, and
      // the tax split has just changed.
      router.refresh();
    } catch {
      setMessage('We could not reach the server. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const field = (
    key: keyof AddressInput,
    label: string,
    options: {
      placeholder?: string;
      optional?: boolean;
      className?: string;
      inputMode?: 'numeric' | 'tel';
    } = {}
  ) => (
    <label className={`flex flex-col gap-1.5 ${options.className ?? ''}`}>
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
        {options.optional && <span className="font-normal normal-case"> (optional)</span>}
      </span>
      <input
        value={fields[key] ?? ''}
        onChange={set(key)}
        placeholder={options.placeholder}
        inputMode={options.inputMode}
        aria-invalid={Boolean(errors[key])}
        className={`px-3.5 py-2.5 rounded-xl border bg-background text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30 ${
          errors[key] ? 'border-red-500' : 'border-border'
        }`}
      />
      {errors[key] && <span className="text-xs text-red-600">{errors[key]}</span>}
    </label>
  );

  if (address && !open) {
    return (
      <div className="card-warm p-6 md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-sans font-bold text-foreground text-sm uppercase tracking-wide mb-3">
              Delivering to
            </h2>
            <address className="not-italic text-sm text-foreground leading-relaxed">
              {address.name}
              <br />
              {address.line1}
              {address.line2 && (
                <>
                  <br />
                  {address.line2}
                </>
              )}
              <br />
              {address.city} {address.pincode}
              <br />
              {INDIAN_STATES.find((state) => state.code === address.stateCode)?.name}
              {address.phone && (
                <>
                  <br />
                  {address.phone}
                </>
              )}
            </address>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-xs font-semibold text-primary hover:underline underline-offset-4 shrink-0"
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card-warm p-6 md:p-8">
      <h2 className="font-sans font-bold text-foreground text-sm uppercase tracking-wide mb-2">
        Delivery address
      </h2>
      <p className="text-xs text-muted-foreground mb-5 leading-relaxed">
        Where the parcel should go. Your state also decides how GST is shown on your invoice — the
        amount you pay is the same wherever you are.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {field('name', 'Full name', { className: 'sm:col-span-2' })}
        {field('line1', 'Flat, house and street', { className: 'sm:col-span-2' })}
        {field('line2', 'Area or landmark', { className: 'sm:col-span-2', optional: true })}
        {field('city', 'Town or city')}

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            State
          </span>
          <select
            value={fields.stateCode ?? ''}
            onChange={set('stateCode')}
            aria-invalid={Boolean(errors.stateCode)}
            className={`px-3.5 py-2.5 rounded-xl border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 ${
              errors.stateCode ? 'border-red-500' : 'border-border'
            }`}
          >
            <option value="">Choose your state</option>
            {INDIAN_STATES.map((state) => (
              <option key={state.code} value={state.code}>
                {state.name}
              </option>
            ))}
          </select>
          {errors.stateCode && <span className="text-xs text-red-600">{errors.stateCode}</span>}
        </label>

        {field('pincode', 'PIN code', { inputMode: 'numeric', placeholder: '600001' })}
        {field('phone', 'Mobile number', { optional: true, inputMode: 'tel' })}
        {field('buyerGstin', 'Your GSTIN', {
          className: 'sm:col-span-2',
          optional: true,
          placeholder: 'Only if you are buying through a business',
        })}
      </div>

      {message && (
        <p role="alert" className="text-sm text-red-600 mt-4">
          {message}
        </p>
      )}

      <div className="flex items-center gap-3 mt-6">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          <Icon name="CheckIcon" size={16} />
          {busy ? 'Saving…' : 'Save address'}
        </button>
        {address && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
