'use client';

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';

type FormState = 'idle' | 'submitting' | 'submitted';

interface FormData {
  day: string;
  month: string;
  year: string;
  name: string;
  email: string;
  giftFor: string;
  message: string;
}

interface FormErrors {
  day?: string;
  month?: string;
  year?: string;
  name?: string;
  email?: string;
}

const progressSteps = [
  { label: 'Date Submitted', icon: 'CheckCircleIcon' as const, status: 'done' },
  { label: 'Checking Collection', icon: 'MagnifyingGlassIcon' as const, status: 'pending' },
  { label: 'Confirmation Sent', icon: 'EnvelopeIcon' as const, status: 'pending' },
];

export default function RequestFormSection() {
  const [formData, setFormData] = useState<FormData>({
    day: '',
    month: '',
    year: '',
    name: '',
    email: '',
    giftFor: '',
    message: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [formState, setFormState] = useState<FormState>('idle');
  const [referenceNumber, setReferenceNumber] = useState('');

  const dayRef = useRef<HTMLInputElement>(null);
  const monthRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);

  const validate = (): boolean => {
    const newErrors: FormErrors = {};
    const d = parseInt(formData.day, 10);
    const m = parseInt(formData.month, 10);
    const y = parseInt(formData.year, 10);

    if (!formData.day || isNaN(d) || d < 1 || d > 31) {
      newErrors.day = 'Enter a valid day (01–31)';
    }
    if (!formData.month || isNaN(m) || m < 1 || m > 12) {
      newErrors.month = 'Enter a valid month (01–12)';
    }
    if (!formData.year || isNaN(y) || formData.year.length !== 2) {
      newErrors.year = 'Enter 2-digit year (e.g. 87)';
    }
    if (!formData.name.trim()) {
      newErrors.name = 'Please enter your name';
    }
    if (!formData.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Enter a valid email address';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setFormState('submitting');
    setTimeout(() => {
      // Generate reference number
      const dd = formData.day.padStart(2, '0');
      const mm = formData.month.padStart(2, '0');
      const yy = formData.year;
      const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
      const ref = `MN-${dd}${mm}${yy}-${rand}`;
      setReferenceNumber(ref);

      // Save to localStorage
      try {
        const existing = localStorage.getItem('memonote_orders');
        const orders = existing ? JSON.parse(existing) : [];
        const now = new Date();
        const submittedAt = `${now.getDate().toString().padStart(2,'0')}/${(now.getMonth()+1).toString().padStart(2,'0')}/${now.getFullYear()} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
        orders.push({
          referenceNumber: ref,
          submittedAt,
          date: `${dd}/${mm}/${yy}`,
          name: formData.name,
          email: formData.email,
          giftFor: formData.giftFor || undefined,
          message: formData.message || undefined,
          status: 'pending',
        });
        localStorage.setItem('memonote_orders', JSON.stringify(orders));
      } catch {
        // ignore storage errors
      }

      setFormState('submitted');
    }, 1400);
  };

  const handleDayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 2);
    setFormData((p) => ({ ...p, day: val }));
    if (val.length === 2) monthRef.current?.focus();
  };

  const handleMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 2);
    setFormData((p) => ({ ...p, month: val }));
    if (val.length === 2) yearRef.current?.focus();
  };

  const handleYearChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 2);
    setFormData((p) => ({ ...p, year: val }));
  };

  if (formState === 'submitted') {
    return (
      <section className="bg-background py-16 md:py-24">
        <div className="max-w-2xl mx-auto px-6 md:px-12">
          {/* Success card */}
          <div className="card-warm p-10 md:p-14 text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-accent/0 via-accent to-accent/0" />

            {/* Icon */}
            <div className="w-16 h-16 rounded-full bg-accent/15 flex items-center justify-center mx-auto mb-6">
              <Icon name="CheckCircleIcon" size={32} className="text-accent" />
            </div>

            <h2 className="font-sans font-extrabold text-foreground mb-3"
              style={{ fontSize: 'clamp(1.5rem, 4vw, 2.5rem)', letterSpacing: '-0.03em' }}>
              Request received.
            </h2>
            <p className="font-serif italic text-lg text-muted-foreground mb-4 leading-relaxed">
              We're searching our collection for a note from{' '}
              <span className="text-primary font-semibold not-italic font-mono">
                {formData.day.padStart(2, '0')}/{formData.month.padStart(2, '0')}/{formData.year}
              </span>
            </p>

            {/* Reference number */}
            <div className="inline-flex flex-col items-center gap-1 bg-secondary/60 border border-border rounded-xl px-6 py-4 mb-8">
              <span className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">Your Reference Number</span>
              <span className="font-mono font-extrabold text-2xl text-foreground tracking-wider">{referenceNumber}</span>
              <span className="text-xs text-muted-foreground">Save this to track your order</span>
            </div>

            {/* Progress tracker */}
            <div className="flex items-center justify-center gap-0 mb-10">
              {progressSteps.map((step, i) => (
                <React.Fragment key={i}>
                  <div className="flex flex-col items-center gap-2 max-w-[90px]">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                      step.status === 'done'
                        ? 'bg-accent border-accent text-foreground' :'bg-background border-border text-muted-foreground'
                    }`}>
                      <Icon name={step.icon} size={18} />
                    </div>
                    <p className={`text-xs font-medium text-center leading-tight ${
                      step.status === 'done' ? 'text-accent-foreground' : 'text-muted-foreground'
                    }`}>
                      {step.label}
                    </p>
                  </div>
                  {i < progressSteps.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-1 mb-5 ${
                      i === 0 ? 'bg-accent' : 'bg-border'
                    }`} />
                  )}
                </React.Fragment>
              ))}
            </div>

            {/* What happens next */}
            <div className="bg-secondary/50 rounded-2xl p-6 text-left mb-8">
              <h3 className="font-sans font-bold text-foreground mb-4 text-sm uppercase tracking-wide">
                What happens next
              </h3>
              <div className="flex flex-col gap-3">
                {[
                  { icon: 'ClockIcon' as const, text: 'We check our collection — usually within a few hours.' },
                  { icon: 'EnvelopeIcon' as const, text: `We'll email ${formData.email} with availability and pricing.` },
                  { icon: 'CreditCardIcon' as const, text: 'If available, you\'ll receive a secure payment link.' },
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
                href="/track-order"
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
                Back to MemoNote
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-background py-12 md:py-20 pb-24">
      <div className="max-w-3xl mx-auto px-6 md:px-12">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-10 items-start">

          {/* Form — spans 3 cols */}
          <div className="md:col-span-3">
            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-8">

              {/* Date field group */}
              <div>
                <label className="block text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-3">
                  Memorable Date <span className="text-accent">*</span>
                </label>
                <div className="flex items-start gap-3">
                  {/* Day */}
                  <div className="flex-1">
                    <div className={`relative border-b-2 transition-colors ${errors.day ? 'border-red-400' : 'border-border focus-within:border-accent'}`}>
                      <input
                        ref={dayRef}
                        type="text"
                        inputMode="numeric"
                        placeholder="DD"
                        value={formData.day}
                        onChange={handleDayChange}
                        className="void-input-warm w-full py-3 text-2xl font-mono font-bold text-foreground placeholder:text-muted/50 text-center"
                        aria-label="Day"
                      />
                    </div>
                    {errors.day && <p className="text-xs text-red-500 mt-1">{errors.day}</p>}
                  </div>

                  <span className="text-2xl font-mono text-muted-foreground mt-3">/</span>

                  {/* Month */}
                  <div className="flex-1">
                    <div className={`relative border-b-2 transition-colors ${errors.month ? 'border-red-400' : 'border-border focus-within:border-accent'}`}>
                      <input
                        ref={monthRef}
                        type="text"
                        inputMode="numeric"
                        placeholder="MM"
                        value={formData.month}
                        onChange={handleMonthChange}
                        className="void-input-warm w-full py-3 text-2xl font-mono font-bold text-foreground placeholder:text-muted/50 text-center"
                        aria-label="Month"
                      />
                    </div>
                    {errors.month && <p className="text-xs text-red-500 mt-1">{errors.month}</p>}
                  </div>

                  <span className="text-2xl font-mono text-muted-foreground mt-3">/</span>

                  {/* Year */}
                  <div className="flex-1">
                    <div className={`relative border-b-2 transition-colors ${errors.year ? 'border-red-400' : 'border-border focus-within:border-accent'}`}>
                      <input
                        ref={yearRef}
                        type="text"
                        inputMode="numeric"
                        placeholder="YY"
                        value={formData.year}
                        onChange={handleYearChange}
                        className="void-input-warm w-full py-3 text-2xl font-mono font-bold text-foreground placeholder:text-muted/50 text-center"
                        aria-label="Year (2 digits)"
                      />
                    </div>
                    {errors.year && <p className="text-xs text-red-500 mt-1">{errors.year}</p>}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Format: DD / MM / YY — e.g. 14 / 03 / 87</p>
              </div>

              {/* Name */}
              <div>
                <label htmlFor="name" className="block text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-3">
                  Your Name <span className="text-accent">*</span>
                </label>
                <div className={`border-b-2 transition-colors ${errors.name ? 'border-red-400' : 'border-border focus-within:border-accent'}`}>
                  <input
                    id="name"
                    type="text"
                    placeholder="Full name"
                    value={formData.name}
                    onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                    className="void-input-warm w-full py-3 text-base font-medium text-foreground placeholder:text-muted-foreground/40"
                  />
                </div>
                {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
              </div>

              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-3">
                  Email Address <span className="text-accent">*</span>
                </label>
                <div className={`border-b-2 transition-colors ${errors.email ? 'border-red-400' : 'border-border focus-within:border-accent'}`}>
                  <input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    value={formData.email}
                    onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
                    className="void-input-warm w-full py-3 text-base font-medium text-foreground placeholder:text-muted-foreground/40"
                  />
                </div>
                {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
              </div>

              {/* Gift for (optional) */}
              <div>
                <label htmlFor="giftFor" className="block text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-3">
                  This is a gift for <span className="text-muted-foreground/50 normal-case font-normal tracking-normal">(optional)</span>
                </label>
                <div className="border-b-2 border-border focus-within:border-accent transition-colors">
                  <input
                    id="giftFor"
                    type="text"
                    placeholder="e.g. My parents' 30th wedding anniversary"
                    value={formData.giftFor}
                    onChange={(e) => setFormData((p) => ({ ...p, giftFor: e.target.value }))}
                    className="void-input-warm w-full py-3 text-base font-medium text-foreground placeholder:text-muted-foreground/40"
                  />
                </div>
              </div>

              {/* Message (optional) */}
              <div>
                <label htmlFor="message" className="block text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-3">
                  Anything else we should know <span className="text-muted-foreground/50 normal-case font-normal tracking-normal">(optional)</span>
                </label>
                <textarea
                  id="message"
                  rows={3}
                  placeholder="e.g. I'd prefer a British note if possible, or need it by a specific date..."
                  value={formData.message}
                  onChange={(e) => setFormData((p) => ({ ...p, message: e.target.value }))}
                  className="w-full bg-transparent border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none focus:border-accent transition-colors leading-relaxed"
                />
              </div>

              {/* Submit */}
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
                    Submit Date Request
                    <Icon name="ArrowRightIcon" size={18} className="group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>

              <p className="text-xs text-muted-foreground text-center leading-relaxed">
                By submitting, you agree to be contacted by email. No payment until we confirm availability.
              </p>
            </form>
          </div>

          {/* Sidebar — spans 2 cols */}
          <div className="md:col-span-2 flex flex-col gap-6 sticky top-28">
            {/* How it works mini */}
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

            {/* Trust signals */}
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

            {/* Available denominations */}
            <div className="card-warm p-6">
              <h3 className="font-sans font-bold text-foreground text-sm uppercase tracking-wide mb-3">
                Available Denominations
              </h3>
              <div className="flex flex-wrap gap-2">
                {['₹1', '₹2', '₹5', '₹10', '₹20', '₹50', '₹100', '₹200', '₹500'].map((d) => (
                  <span key={d} className="px-3 py-1.5 rounded-lg bg-accent/15 border border-accent/25 text-sm font-mono font-bold text-foreground/80">
                    {d}
                  </span>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                All notes are genuine Indian banknotes in DD/MM/YY format.
              </p>
            </div>

            {/* Quote */}
            <div className="border-l-4 border-accent pl-4 py-1">
              <p className="font-serif italic text-sm text-foreground/70 leading-relaxed">
                "We've fulfilled requests across all major Indian denominations. Chances are, your date is in our collection."
              </p>
              <p className="text-xs text-muted-foreground mt-2 font-medium">— The MemoNote Team</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}