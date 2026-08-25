'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import {
  validateRequest,
  DENOMINATIONS,
  GIFT_RELATIONSHIPS,
  MAX_ITEMS_PER_ORDER,
  type RequestFormErrors,
  type RequestItemValues,
} from '@/lib/validation';

type FormState = 'idle' | 'submitting' | 'submitted';

/**
 * A date block in the form. `key` is stable so React does not reuse inputs on
 * removal.
 *
 * One block can be several banknotes: it carries a set of denominations, and
 * each one is a separate note to find, price and post. `noteCount` below is
 * what the customer is actually ordering.
 */
interface ItemRow extends RequestItemValues {
  key: number;
}

interface FormData {
  name: string;
  email: string;
  whatsapp: string;
  whatsappOptIn: boolean;
  message: string;
  /** Honeypot — hidden from humans, filled in by bots. */
  website: string;
}

const progressSteps = [
  { label: 'Date Submitted', icon: 'CheckCircleIcon' as const, status: 'done' },
  { label: 'Checking Collection', icon: 'MagnifyingGlassIcon' as const, status: 'pending' },
  { label: 'Confirmation Sent', icon: 'EnvelopeIcon' as const, status: 'pending' },
];

let nextKey = 1;
const emptyRow = (): ItemRow => ({
  key: nextKey++,
  day: '',
  month: '',
  year: '',
  denominations: [],
  giftRelationship: '',
  giftFor: '',
});

/** How many banknotes a set of date blocks comes to. */
const noteCount = (rows: ItemRow[]) => rows.reduce((sum, row) => sum + row.denominations.length, 0);

interface Props {
  /**
   * The signed-in customer, or null for a guest.
   *
   * Prefilling saves them retyping what we already know. The API reads the
   * name and email from the session rather than the body, so editing these
   * fields in the browser cannot change whose order it is.
   */
  /** `email` is null for an account that signed up with a mobile number only. */
  user?: { name: string; email: string | null; whatsapp?: string | null } | null;
}

export default function RequestFormSection({ user = null }: Props) {
  const [formData, setFormData] = useState<FormData>({
    name: user?.name ?? '',
    email: user?.email ?? '',
    // Prefilled from the profile, but the consent box still starts unticked:
    // having someone's number is not the same as being asked to use it.
    whatsapp: user?.whatsapp ?? '',
    whatsappOptIn: false,
    message: '',
    website: '',
  });
  const [rows, setRows] = useState<ItemRow[]>([emptyRow()]);
  const [errors, setErrors] = useState<RequestFormErrors>({});
  const [formState, setFormState] = useState<FormState>('idle');
  const [result, setResult] = useState<{ reference: string; count: number } | null>(null);
  const [submitError, setSubmitError] = useState('');

  const payload = () => ({ ...formData, items: rows });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    // Same rules the server runs — this copy only makes the feedback instant.
    const { errors: found, valid } = validateRequest(payload());
    setErrors(found);
    if (!valid) return;

    setFormState('submitting');
    try {
      const response = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload()),
      });
      const body = await response.json().catch(() => ({}));

      if (response.status === 422 && body.errors) {
        setErrors(body.errors as RequestFormErrors);
        setFormState('idle');
        return;
      }
      if (!response.ok) {
        throw new Error(body.error || 'Something went wrong. Please try again.');
      }

      // The server counts notes, not date blocks; the fallback must agree.
      setResult({ reference: body.reference, count: body.itemCount ?? noteCount(rows) });
      setFormState('submitted');
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Something went wrong. Please try again.'
      );
      setFormState('idle');
    }
  };

  const setRow = (index: number, patch: Partial<RequestItemValues>) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  /**
   * Ticks or unticks one denomination for a date.
   *
   * Untick is always allowed. Tick is refused once the order is at the cap,
   * because the alternative — accepting it and failing validation on submit —
   * tells the customer only after they have finished filling the form in.
   */
  const toggleDenomination = (index: number, value: string) => {
    setRows((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        const has = row.denominations.includes(value);
        if (!has && noteCount(prev) >= MAX_ITEMS_PER_ORDER) return row;
        return {
          ...row,
          denominations: has
            ? row.denominations.filter((v) => v !== value)
            : [...row.denominations, value],
        };
      })
    );
  };

  /** Two digits only, and hop to the next box once this one is full. */
  const datePart = (
    index: number,
    part: 'day' | 'month' | 'year',
    value: string,
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const digits = value.replace(/\D/g, '').slice(0, 2);
    setRow(index, { [part]: digits });
    if (digits.length === 2) {
      const next = event.target.parentElement?.parentElement?.nextElementSibling;
      next?.querySelector('input')?.focus();
    }
  };

  if (formState === 'submitted' && result) {
    const many = result.count > 1;
    return (
      <section className="bg-background py-16 md:py-24">
        <div className="max-w-2xl mx-auto px-6 md:px-12">
          <div className="card-warm p-10 md:p-14 text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-accent/0 via-accent to-accent/0" />

            <div className="w-16 h-16 rounded-full bg-accent/15 flex items-center justify-center mx-auto mb-6">
              <Icon name="CheckCircleIcon" size={32} className="text-accent" />
            </div>

            <h2
              className="font-sans font-extrabold text-foreground mb-3"
              style={{ fontSize: 'clamp(1.5rem, 4vw, 2.5rem)', letterSpacing: '-0.03em' }}
            >
              Request received.
            </h2>
            <p className="font-serif italic text-lg text-muted-foreground mb-4 leading-relaxed">
              We&apos;re searching our collection for{' '}
              <span className="text-primary font-semibold not-italic">
                {many ? `${result.count} notes` : 'a note'}
              </span>
              {many ? '.' : ` from `}
              {!many && (
                <span className="text-primary font-semibold not-italic font-mono">
                  {rows[0].day.padStart(2, '0')}/{rows[0].month.padStart(2, '0')}/{rows[0].year}
                </span>
              )}
            </p>

            <div className="inline-flex flex-col items-center gap-1 bg-secondary/60 border border-border rounded-xl px-6 py-4 mb-8">
              <span className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">
                Your Reference Number
              </span>
              <span className="font-mono font-extrabold text-2xl text-foreground tracking-wider">
                {result.reference}
              </span>
              <span className="text-xs text-muted-foreground">Save this to track your order</span>
            </div>

            <div className="flex items-center justify-center gap-0 mb-10">
              {progressSteps.map((step, i) => (
                <React.Fragment key={i}>
                  <div className="flex flex-col items-center gap-2 max-w-[90px]">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                        step.status === 'done'
                          ? 'bg-accent border-accent text-foreground'
                          : 'bg-background border-border text-muted-foreground'
                      }`}
                    >
                      <Icon name={step.icon} size={18} />
                    </div>
                    <p
                      className={`text-xs font-medium text-center leading-tight ${
                        step.status === 'done' ? 'text-accent-foreground' : 'text-muted-foreground'
                      }`}
                    >
                      {step.label}
                    </p>
                  </div>
                  {i < progressSteps.length - 1 && (
                    <div
                      className={`flex-1 h-0.5 mx-1 mb-5 ${i === 0 ? 'bg-accent' : 'bg-border'}`}
                    />
                  )}
                </React.Fragment>
              ))}
            </div>

            <div className="bg-secondary/50 rounded-2xl p-6 text-left mb-8">
              <h3 className="font-sans font-bold text-foreground mb-4 text-sm uppercase tracking-wide">
                What happens next
              </h3>
              <div className="flex flex-col gap-3">
                {[
                  {
                    icon: 'ClockIcon' as const,
                    text: 'We check our collection — usually within a few hours.',
                  },
                  {
                    icon: 'EnvelopeIcon' as const,
                    text: `We'll email ${formData.email} with availability and pricing.`,
                  },
                  {
                    icon: 'CreditCardIcon' as const,
                    text: many
                      ? "You'll get a secure payment link for whichever notes we find — you pay nothing for any we can't."
                      : "If available, you'll receive a secure payment link.",
                  },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <Icon name={item.icon} size={16} className="text-accent mt-0.5 shrink-0" />
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href={`/track-order/${result.reference}`}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-full text-sm font-semibold hover:bg-primary/90 transition-all"
              >
                <Icon name="MagnifyingGlassIcon" size={14} />
                Track my order
              </Link>
              <Link
                href="/"
                className="inline-flex items-center gap-2 text-primary font-semibold text-sm border-b border-primary/30 pb-0.5 hover:border-primary transition-colors"
              >
                <Icon name="ArrowLeftIcon" size={14} />
                Back to BirthNote
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  /** Banknotes on the order as it stands — the number the cap applies to. */
  const total = noteCount(rows);

  const underline = (bad?: string) =>
    `border-b-2 transition-colors ${bad ? 'border-red-400' : 'border-border focus-within:border-accent'}`;

  return (
    <section className="bg-background py-12 md:py-20">
      <div className="max-w-3xl mx-auto px-6 md:px-12">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-10 items-start">
          <div className="md:col-span-3">
            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-8">
              {/*
                Honeypot. Hidden from sighted users and screen readers alike;
                anything that fills it in is a bot, and the API silently drops
                the submission.
              */}
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                value={formData.website}
                onChange={(e) => setFormData((p) => ({ ...p, website: e.target.value }))}
                className="absolute w-px h-px -left-[9999px] opacity-0"
              />

              {/* One block per requested note */}
              {rows.map((row, index) => {
                const rowErrors = errors.itemErrors?.[index] ?? {};
                return (
                  <div
                    key={row.key}
                    className={rows.length > 1 ? 'border border-border rounded-2xl p-5' : ''}
                  >
                    {rows.length > 1 && (
                      <div className="flex items-center justify-between mb-4">
                        <p className="text-xs uppercase tracking-widest text-accent font-bold">
                          Date {index + 1}
                        </p>
                        <button
                          type="button"
                          onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-red-600 transition-colors"
                        >
                          <Icon name="XMarkIcon" size={12} />
                          Remove
                        </button>
                      </div>
                    )}

                    <div className="flex flex-col gap-6">
                      {/* Date */}
                      <div>
                        <label className="block text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-3">
                          Memorable Date <span className="text-accent">*</span>
                        </label>
                        <div className="flex items-start gap-3">
                          {(
                            [
                              ['day', 'DD', 'Day'],
                              ['month', 'MM', 'Month'],
                              ['year', 'YY', 'Year (2 digits)'],
                            ] as const
                          ).map(([part, placeholder, label], partIndex) => (
                            <React.Fragment key={part}>
                              {partIndex > 0 && (
                                <span className="text-2xl font-mono text-muted-foreground mt-3">
                                  /
                                </span>
                              )}
                              <div className="flex-1">
                                <div className={underline(rowErrors[part])}>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    placeholder={placeholder}
                                    value={row[part]}
                                    onChange={(e) => datePart(index, part, e.target.value, e)}
                                    className="void-input-warm w-full py-3 text-2xl font-mono font-bold text-foreground placeholder:text-muted/50 text-center"
                                    aria-label={label}
                                  />
                                </div>
                                {rowErrors[part] && (
                                  <p className="text-xs text-red-500 mt-1">{rowErrors[part]}</p>
                                )}
                              </div>
                            </React.Fragment>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          Format: DD / MM / YY — e.g. 14 / 03 / 87
                        </p>
                      </div>

                      {/*
                        Denominations — checkboxes, not a <select multiple>,
                        which on a phone is a scroll trap and on a desktop
                        needs a held modifier key to pick a second value. Each
                        tick is one more banknote, so the count is spelled out
                        rather than left to be inferred from the price later.
                      */}
                      <fieldset>
                        <legend className="block text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-3">
                          Denominations <span className="text-accent">*</span>
                        </legend>
                        <div className="flex flex-wrap gap-2">
                          {DENOMINATIONS.map((value) => {
                            const picked = row.denominations.includes(String(value));
                            // Only the untick stays available at the cap.
                            const blocked = !picked && total >= MAX_ITEMS_PER_ORDER;
                            return (
                              <label
                                key={value}
                                className={`relative inline-flex items-center rounded-full border px-4 py-2 text-base font-semibold transition-colors ${
                                  picked
                                    ? 'border-accent bg-accent/10 text-foreground'
                                    : blocked
                                      ? 'border-border text-muted-foreground/40 cursor-not-allowed'
                                      : 'border-border text-muted-foreground hover:border-accent/60 cursor-pointer'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={picked}
                                  disabled={blocked}
                                  onChange={() => toggleDenomination(index, String(value))}
                                  className="absolute w-px h-px opacity-0"
                                />
                                ₹{value}
                              </label>
                            );
                          })}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          {row.denominations.length === 0
                            ? 'Pick every value you want for this date — each one is a separate note.'
                            : row.denominations.length === 1
                              ? 'One note for this date.'
                              : `${row.denominations.length} notes for this date.`}
                        </p>
                        {rowErrors.denominations && (
                          <p className="text-xs text-red-500 mt-1">{rowErrors.denominations}</p>
                        )}
                      </fieldset>

                      {/* Who it is for */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div>
                          <label
                            htmlFor={`relationship-${row.key}`}
                            className="block text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-3"
                          >
                            Who is it for{' '}
                            <span className="text-muted-foreground/50 normal-case font-normal tracking-normal">
                              (optional)
                            </span>
                          </label>
                          <div className={underline(rowErrors.giftRelationship)}>
                            <select
                              id={`relationship-${row.key}`}
                              value={row.giftRelationship}
                              onChange={(e) => setRow(index, { giftRelationship: e.target.value })}
                              className="void-input-warm w-full py-3 text-base font-medium text-foreground bg-transparent"
                            >
                              <option value="">Select…</option>
                              {GIFT_RELATIONSHIPS.map((value) => (
                                <option key={value} value={value}>
                                  {value}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div>
                          <label
                            htmlFor={`giftFor-${row.key}`}
                            className="block text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-3"
                          >
                            Occasion or name{' '}
                            <span className="text-muted-foreground/50 normal-case font-normal tracking-normal">
                              (optional)
                            </span>
                          </label>
                          <div className={underline(rowErrors.giftFor)}>
                            <input
                              id={`giftFor-${row.key}`}
                              type="text"
                              placeholder="Dad's 60th"
                              value={row.giftFor}
                              onChange={(e) => setRow(index, { giftFor: e.target.value })}
                              className="void-input-warm w-full py-3 text-base font-medium text-foreground placeholder:text-muted-foreground/40"
                            />
                          </div>
                          {rowErrors.giftFor && (
                            <p className="text-xs text-red-500 mt-1">{rowErrors.giftFor}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {errors.items && (
                <p role="alert" className="text-xs text-red-500">
                  {errors.items}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                {/*
                  A new block starts empty, so it adds no notes and cannot
                  itself breach the cap — what the cap stops is ticking a
                  denomination inside it. Hiding the button at the cap is
                  therefore about not offering a block that can hold nothing.
                */}
                {total < MAX_ITEMS_PER_ORDER ? (
                  <button
                    type="button"
                    onClick={() => setRows((prev) => [...prev, emptyRow()])}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-primary border-b border-primary/30 pb-0.5 hover:border-primary transition-colors"
                  >
                    <Icon name="GiftIcon" size={14} />
                    Add another date
                  </button>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    That is the most we can take in one order.
                  </p>
                )}

                {/*
                  Shown only once the order is more than a single note: with
                  one note it states the obvious, and with several it is the
                  only place the total appears before the confirmation email.
                */}
                {total > 1 && (
                  <p className="text-sm font-semibold text-foreground">
                    {total} notes in this order
                  </p>
                )}
              </div>

              {/* Name */}
              <div>
                <label
                  htmlFor="name"
                  className="block text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-3"
                >
                  Your Name <span className="text-accent">*</span>
                </label>
                <div className={underline(errors.name)}>
                  <input
                    id="name"
                    type="text"
                    placeholder="Full name"
                    value={formData.name}
                    onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                    readOnly={Boolean(user?.name)}
                    className={`void-input-warm w-full py-3 text-base font-medium text-foreground placeholder:text-muted-foreground/40 ${
                      user?.name ? 'opacity-70' : ''
                    }`}
                  />
                </div>
                {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
              </div>

              {/* Email */}
              <div>
                <label
                  htmlFor="email"
                  className="block text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-3"
                >
                  Email Address <span className="text-accent">*</span>
                </label>
                <div className={underline(errors.email)}>
                  <input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    value={formData.email}
                    onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
                    // Locked to the account's address, unless there isn't one:
                    // accounts created with a mobile number alone have no
                    // email, and a receipt has to go somewhere.
                    readOnly={Boolean(user?.email)}
                    className={`void-input-warm w-full py-3 text-base font-medium text-foreground placeholder:text-muted-foreground/40 ${
                      user?.email ? 'opacity-70' : ''
                    }`}
                  />
                </div>
                {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
                {user?.email ? (
                  <p className="text-xs text-muted-foreground mt-2">
                    Signed in as {user.email}. Change it in{' '}
                    <Link href="/account/profile" className="text-primary underline">
                      your profile
                    </Link>
                    .
                  </p>
                ) : user ? (
                  <p className="text-xs text-muted-foreground mt-2">
                    We&apos;ll send your receipt and updates here, and save it to your account.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-2">
                    <Link href="/login?next=/request-a-banknote" className="text-primary underline">
                      Sign in
                    </Link>{' '}
                    to keep every order in one place — or carry on as a guest.
                  </p>
                )}
              </div>

              {/* WhatsApp updates */}
              <div>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.whatsappOptIn}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, whatsappOptIn: e.target.checked }))
                    }
                    className="mt-1 w-4 h-4 rounded border-border text-primary focus:ring-primary/30"
                  />
                  <span className="text-sm text-foreground leading-relaxed">
                    Send me order updates on WhatsApp
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      Availability, payment and dispatch — the same updates we email. Nothing else,
                      and you can reply STOP at any time.
                    </span>
                  </span>
                </label>

                {formData.whatsappOptIn && (
                  <div className="mt-4">
                    <label
                      htmlFor="whatsapp"
                      className="block text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-3"
                    >
                      WhatsApp Number <span className="text-accent">*</span>
                    </label>
                    <div className={underline(errors.whatsapp)}>
                      <input
                        id="whatsapp"
                        type="tel"
                        placeholder="+91 98765 43210"
                        value={formData.whatsapp}
                        onChange={(e) => setFormData((p) => ({ ...p, whatsapp: e.target.value }))}
                        className="void-input-warm w-full py-3 text-base font-medium text-foreground placeholder:text-muted-foreground/40"
                      />
                    </div>
                    {errors.whatsapp && (
                      <p className="text-xs text-red-500 mt-1">{errors.whatsapp}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Message */}
              <div>
                <label
                  htmlFor="message"
                  className="block text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-3"
                >
                  Anything else we should know{' '}
                  <span className="text-muted-foreground/50 normal-case font-normal tracking-normal">
                    (optional)
                  </span>
                </label>
                <textarea
                  id="message"
                  rows={3}
                  placeholder="e.g. I'd prefer crisp notes if possible, or need them by a specific date…"
                  value={formData.message}
                  onChange={(e) => setFormData((p) => ({ ...p, message: e.target.value }))}
                  className="w-full bg-transparent border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none focus:border-accent transition-colors leading-relaxed"
                />
                {errors.message && <p className="text-xs text-red-500 mt-1">{errors.message}</p>}
              </div>

              <button
                type="submit"
                disabled={formState === 'submitting'}
                className="group w-full flex items-center justify-center gap-3 px-8 py-4 bg-primary text-primary-foreground rounded-xl font-bold text-base hover:bg-primary/90 transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed mt-2"
              >
                {formState === 'submitting' ? (
                  <>
                    <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    Submitting request…
                  </>
                ) : (
                  <>
                    {total > 1 ? `Submit Request for ${total} Notes` : 'Submit Date Request'}
                    <Icon
                      name="ArrowRightIcon"
                      size={18}
                      className="group-hover:translate-x-1 transition-transform"
                    />
                  </>
                )}
              </button>

              {submitError && (
                <div
                  role="alert"
                  className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3"
                >
                  <Icon
                    name="ExclamationTriangleIcon"
                    size={16}
                    className="text-red-600 mt-0.5 shrink-0"
                  />
                  <p className="text-sm text-red-700 leading-relaxed">{submitError}</p>
                </div>
              )}

              <p className="text-xs text-muted-foreground text-center leading-relaxed">
                By submitting, you agree to be contacted by email. No payment until we confirm
                availability, and you pay only for the notes we find.
              </p>
            </form>
          </div>

          {/* Sidebar */}
          <div className="md:col-span-2 flex flex-col gap-6 sticky top-28">
            <div className="card-warm p-6">
              <h3 className="font-sans font-bold text-foreground text-sm uppercase tracking-wide mb-4">
                What happens next
              </h3>
              <div className="flex flex-col gap-4">
                {[
                  { step: '1', text: 'We search our collection of 2,400+ dated notes.' },
                  { step: '2', text: 'Reply within 24h with availability and price.' },
                  { step: '3', text: 'You approve and pay — only then do we ship.' },
                ].map((item) => (
                  <div key={item.step} className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-accent/15 text-accent-foreground text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {item.step}
                    </span>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="card-warm p-6">
              <h3 className="font-sans font-bold text-foreground text-sm uppercase tracking-wide mb-3">
                Ordering more than one?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Add up to {MAX_ITEMS_PER_ORDER} dates to a single order — one parcel, one payment,
                and you pay only for the ones we find.
              </p>
            </div>

            <div className="card-warm p-6">
              <div className="flex flex-col gap-3">
                {[
                  { icon: 'LockClosedIcon' as const, text: 'No payment until confirmed' },
                  { icon: 'ShieldCheckIcon' as const, text: 'Every note authenticated' },
                  { icon: 'TruckIcon' as const, text: 'Tracked delivery across India' },
                  { icon: 'ArrowPathIcon' as const, text: 'Full refund if unavailable' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Icon name={item.icon} size={16} className="text-accent shrink-0" />
                    <p className="text-sm text-muted-foreground">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="card-warm p-6">
              <h3 className="font-sans font-bold text-foreground text-sm uppercase tracking-wide mb-3">
                Available Denominations
              </h3>
              <div className="flex flex-wrap gap-2">
                {DENOMINATIONS.map((d) => (
                  <span
                    key={d}
                    className="px-3 py-1.5 rounded-lg bg-accent/15 border border-accent/25 text-sm font-mono font-bold text-foreground/80"
                  >
                    ₹{d}
                  </span>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                All notes are genuine Indian banknotes in DD/MM/YY format.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
