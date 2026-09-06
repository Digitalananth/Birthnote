'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { INDIAN_STATES } from '@/lib/india-gst';
import {
  SETTING_GROUPS,
  settingForDisplay,
  validateSetting,
  type AppSettings,
  type SettingKey,
  type SettingMeta,
} from '@/lib/settings-types';

/**
 * The whole settings form, saved in one go.
 *
 * One save rather than a field at a time, because these settings are read
 * together: a rate and the state it is charged from are only meaningful as a
 * pair, and a half-applied change would mean an order priced with one and
 * invoiced with the other.
 */
export default function SettingsForm({ settings }: { settings: AppSettings }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(settings).map(([key, value]) => [
        key,
        settingForDisplay(key as SettingKey, value),
      ])
    )
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = (key: SettingKey, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  /*
   * The pickup addresses registered on the Shiprocket account.
   *
   * Fetched so the nickname can be chosen rather than remembered. A typo here
   * passes every check the app can make on its own and then fails at booking
   * time with an error from Shiprocket that does not say what was wrong — so
   * the list is worth a round trip.
   *
   * `reason` rather than an error: when Shiprocket cannot be reached the field
   * falls back to a plain text box and the page stays fully usable. Locking
   * the owner out of editing their GST rates because a courier's API is down
   * would be the worse bug by far.
   */
  const [pickups, setPickups] = useState<
    { nickname: string; pincode: string; city: string; state: string }[]
  >([]);
  const [pickupReason, setPickupReason] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/admin/shiprocket/pickup-locations');
        const payload = (await response.json()) as {
          locations?: { nickname: string; pincode: string; city: string; state: string }[];
          reason?: string | null;
        };
        if (cancelled) return;
        setPickups(payload.locations ?? []);
        setPickupReason(payload.reason ?? null);
      } catch {
        if (!cancelled) setPickupReason('Could not reach the server to list pickup addresses.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Choosing an address sets its PIN code too.
   *
   * The two are one fact — where the parcels leave from — and the only way
   * they cannot disagree is for one choice to write both. The PIN code field
   * stays editable underneath, because an account can hold an address whose
   * registered PIN is wrong and the owner should be able to say so.
   */
  const choosePickup = (nickname: string) => {
    set('shiprocket_pickup_location', nickname);
    const match = pickups.find((location) => location.nickname === nickname);
    if (match?.pincode) set('shiprocket_pickup_pincode', match.pincode);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage('');

    // The same validator the API runs, so a bad rate is caught before the
    // round trip and worded identically either way.
    const found: Record<string, string> = {};
    for (const group of SETTING_GROUPS) {
      for (const meta of group.settings) {
        const checked = validateSetting(meta.key, values[meta.key] ?? '');
        if (checked.value === undefined) found[meta.key] = checked.error ?? 'Not valid.';
      }
    }
    if (Object.keys(found).length) {
      setErrors(found);
      setMessage('Please check the highlighted fields.');
      return;
    }

    setBusy(true);
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrors((payload.errors as Record<string, string>) ?? {});
        setMessage(payload.error || 'That did not save.');
        return;
      }
      setErrors({});
      setSaved(true);
      router.refresh();
    } catch {
      setMessage('We could not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  const inputClass = (key: SettingKey) =>
    `px-3.5 py-2.5 rounded-xl border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 ${
      errors[key] ? 'border-red-500' : 'border-border'
    }`;

  const renderField = (meta: SettingMeta) => {
    const value = values[meta.key] ?? '';

    return (
      <label key={meta.key} className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {meta.label}
          {meta.requiredForInvoice && <span className="text-red-600"> *</span>}
        </span>

        {meta.kind === 'pickup' && pickups.length > 0 ? (
          <select
            value={value}
            onChange={(event) => choosePickup(event.target.value)}
            className={inputClass(meta.key)}
          >
            <option value="">Not set</option>
            {pickups.map((location) => (
              <option key={location.nickname} value={location.nickname}>
                {location.nickname}
                {location.city ? ` — ${location.city} ${location.pincode}` : ''}
              </option>
            ))}
          </select>
        ) : meta.kind === 'state' ? (
          <select
            value={value}
            onChange={(event) => set(meta.key, event.target.value)}
            className={inputClass(meta.key)}
          >
            <option value="">Not set</option>
            {INDIAN_STATES.map((state) => (
              <option key={state.code} value={state.code}>
                {state.name} ({state.code})
              </option>
            ))}
          </select>
        ) : meta.kind === 'multiline' ? (
          <textarea
            value={value}
            rows={4}
            onChange={(event) => set(meta.key, event.target.value)}
            className={`${inputClass(meta.key)} resize-y`}
          />
        ) : (
          <input
            value={value}
            inputMode={
              meta.kind === 'rate' || meta.kind === 'money' || meta.kind === 'measure'
                ? 'decimal'
                : undefined
            }
            onChange={(event) => set(meta.key, event.target.value)}
            className={inputClass(meta.key)}
          />
        )}

        {meta.kind === 'pickup' && pickups.length === 0 && (
          <span className="text-xs text-amber-700 leading-relaxed">
            {pickupReason ?? 'No pickup addresses are registered on your Shiprocket account yet.'}{' '}
            Type the nickname exactly as it appears in Shiprocket → Settings → Pickup Addresses.
          </span>
        )}
        {meta.hint && <span className="text-xs text-muted-foreground/80">{meta.hint}</span>}
        {errors[meta.key] && <span className="text-xs text-red-600">{errors[meta.key]}</span>}
      </label>
    );
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      {SETTING_GROUPS.map((group) => (
        <section key={group.title} className="card-warm p-6">
          <h2 className="font-sans font-bold text-lg text-foreground">{group.title}</h2>
          <p className="text-xs text-muted-foreground mt-1 mb-5 leading-relaxed">
            {group.description}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {group.settings.map((meta) => (
              <div
                key={meta.key}
                className={meta.kind === 'multiline' ? 'sm:col-span-2' : undefined}
              >
                {renderField(meta)}
              </div>
            ))}
          </div>
        </section>
      ))}

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={busy}
          className="px-6 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {busy ? 'Saving…' : 'Save settings'}
        </button>
        {saved && <span className="text-sm text-green-700 font-semibold">Saved.</span>}
        {message && <span className="text-sm text-red-600">{message}</span>}
      </div>
    </form>
  );
}
