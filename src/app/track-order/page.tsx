'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Icon from '@/components/ui/AppIcon';

interface OrderRecord {
  referenceNumber: string;
  submittedAt: string;
  date: string;
  name: string;
  email: string;
  giftFor?: string;
  message?: string;
  status: 'pending' | 'checking' | 'confirmed' | 'unavailable';
}

const STATUS_CONFIG = {
  pending: {
    label: 'Date Submitted',
    description: 'Your request has been received and is in our queue.',
    icon: 'ClockIcon' as const,
    color: 'text-accent',
    bg: 'bg-accent/15',
    border: 'border-accent/30',
  },
  checking: {
    label: 'Checking Collection',
    description: 'We are actively searching our collection for your date.',
    icon: 'MagnifyingGlassIcon' as const,
    color: 'text-primary',
    bg: 'bg-primary/10',
    border: 'border-primary/30',
  },
  confirmed: {
    label: 'Confirmed — Available',
    description: 'Great news! Your date is available. Check your email for the payment link.',
    icon: 'CheckCircleIcon' as const,
    color: 'text-green-700',
    bg: 'bg-green-50',
    border: 'border-green-200',
  },
  unavailable: {
    label: 'Not Available',
    description: 'We were unable to find a note for this date. A full refund has been issued.',
    icon: 'XCircleIcon' as const,
    color: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-200',
  },
};

const PROGRESS_STEPS = [
  { key: 'pending', label: 'Submitted' },
  { key: 'checking', label: 'Checking' },
  { key: 'confirmed', label: 'Confirmed' },
];

function getProgressIndex(status: OrderRecord['status']) {
  if (status === 'unavailable') return 1;
  return PROGRESS_STEPS.findIndex((s) => s.key === status);
}

export default function TrackOrderPage() {
  const [refInput, setRefInput] = useState('');
  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = refInput.trim().toUpperCase();
    if (!trimmed) return;

    setSearched(true);
    setNotFound(false);
    setOrder(null);

    try {
      const stored = localStorage.getItem('memonote_orders');
      if (stored) {
        const orders: OrderRecord[] = JSON.parse(stored);
        const found = orders.find((o) => o.referenceNumber === trimmed);
        if (found) {
          setOrder(found);
          return;
        }
      }
    } catch {
      // ignore parse errors
    }
    setNotFound(true);
  };

  const statusCfg = order ? STATUS_CONFIG[order.status] : null;
  const progressIdx = order ? getProgressIndex(order.status) : -1;

  return (
    <>
      <Header />
      <main className="min-h-screen bg-background pt-28 pb-24">
        {/* Page header */}
        <div className="max-w-2xl mx-auto px-6 md:px-12 mb-12 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-semibold uppercase tracking-widest mb-6">
            <Icon name="MagnifyingGlassIcon" size={12} />
            Order Tracking
          </div>
          <h1
            className="font-sans font-extrabold text-foreground mb-4"
            style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', letterSpacing: '-0.03em', lineHeight: 1 }}
          >
            Track your request
          </h1>
          <p className="font-serif italic text-lg text-muted-foreground leading-relaxed">
            Enter the reference number from your confirmation to see your order status.
          </p>
        </div>

        {/* Search box */}
        <div className="max-w-xl mx-auto px-6 md:px-12">
          <form onSubmit={handleSearch} className="card-warm p-8 mb-8">
            <label className="block text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-3">
              Reference Number
            </label>
            <div className="flex gap-3">
              <div className="flex-1 border-b-2 border-border focus-within:border-accent transition-colors">
                <input
                  type="text"
                  value={refInput}
                  onChange={(e) => {
                    setRefInput(e.target.value);
                    if (searched) { setSearched(false); setNotFound(false); setOrder(null); }
                  }}
                  placeholder="e.g. MN-140387-A1B2"
                  className="void-input-warm w-full py-3 text-base font-mono font-bold text-foreground placeholder:text-muted-foreground/40 uppercase"
                  spellCheck={false}
                  autoComplete="off"
                />
              </div>
              <button
                type="submit"
                className="px-6 py-3 bg-primary text-primary-foreground rounded-xl font-bold text-sm hover:bg-primary/90 transition-all duration-200 flex items-center gap-2 shrink-0"
              >
                Track
                <Icon name="ArrowRightIcon" size={14} />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Your reference number was shown on the confirmation screen after submitting your request.
            </p>
          </form>

          {/* Not found state */}
          {notFound && (
            <div className="card-warm p-8 text-center animate-slide-up">
              <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <Icon name="QuestionMarkCircleIcon" size={28} className="text-muted-foreground" />
              </div>
              <h2 className="font-sans font-bold text-foreground text-lg mb-2">No order found</h2>
              <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                We couldn't find an order with reference{' '}
                <span className="font-mono font-bold text-foreground">{refInput.trim().toUpperCase()}</span>.
                Double-check the number from your confirmation screen.
              </p>
              <Link
                href="/request-a-banknote"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-full text-sm font-semibold hover:bg-primary/90 transition-all"
              >
                Submit a new request
                <Icon name="ArrowRightIcon" size={14} />
              </Link>
            </div>
          )}

          {/* Order found */}
          {order && statusCfg && (
            <div className="flex flex-col gap-5 animate-slide-up">
              {/* Status banner */}
              <div className={`card-warm p-6 border ${statusCfg.border}`}>
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-full ${statusCfg.bg} flex items-center justify-center shrink-0`}>
                    <Icon name={statusCfg.icon} size={22} className={statusCfg.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-xs font-bold uppercase tracking-widest ${statusCfg.color}`}>
                        {statusCfg.label}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{statusCfg.description}</p>
                  </div>
                </div>
              </div>

              {/* Progress bar (only for non-unavailable) */}
              {order.status !== 'unavailable' && (
                <div className="card-warm p-6">
                  <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-5">Progress</h3>
                  <div className="flex items-center gap-0">
                    {PROGRESS_STEPS.map((step, i) => {
                      const done = i <= progressIdx;
                      const active = i === progressIdx;
                      return (
                        <React.Fragment key={step.key}>
                          <div className="flex flex-col items-center gap-2 flex-1">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all ${
                              done
                                ? 'bg-accent border-accent text-foreground'
                                : 'bg-background border-border text-muted-foreground'
                            } ${active ? 'ring-2 ring-accent/30 ring-offset-2' : ''}`}>
                              {done && i < progressIdx ? (
                                <Icon name="CheckIcon" size={16} />
                              ) : (
                                <span className="text-xs font-bold">{i + 1}</span>
                              )}
                            </div>
                            <p className={`text-xs font-medium text-center ${done ? 'text-foreground' : 'text-muted-foreground'}`}>
                              {step.label}
                            </p>
                          </div>
                          {i < PROGRESS_STEPS.length - 1 && (
                            <div className={`h-0.5 flex-1 mb-5 mx-1 transition-all ${i < progressIdx ? 'bg-accent' : 'bg-border'}`} />
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Order details */}
              <div className="card-warm p-6">
                <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-5">Order Details</h3>
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-muted-foreground">Reference</span>
                    <span className="font-mono font-bold text-sm text-foreground">{order.referenceNumber}</span>
                  </div>
                  <div className="h-px bg-border" />
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-muted-foreground">Requested Date</span>
                    <span className="font-mono font-bold text-sm text-foreground">{order.date}</span>
                  </div>
                  <div className="h-px bg-border" />
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-muted-foreground">Submitted</span>
                    <span className="text-sm text-foreground font-medium">{order.submittedAt}</span>
                  </div>
                  <div className="h-px bg-border" />
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-muted-foreground">Name</span>
                    <span className="text-sm text-foreground font-medium">{order.name}</span>
                  </div>
                  <div className="h-px bg-border" />
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-muted-foreground">Email</span>
                    <span className="text-sm text-foreground font-medium truncate max-w-[180px]">{order.email}</span>
                  </div>
                  {order.giftFor && (
                    <>
                      <div className="h-px bg-border" />
                      <div className="flex items-start justify-between gap-4">
                        <span className="text-sm text-muted-foreground shrink-0">Gift For</span>
                        <span className="text-sm text-foreground font-medium text-right">{order.giftFor}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* What to expect */}
              <div className="border-l-4 border-accent pl-5 py-2">
                <p className="font-serif italic text-sm text-foreground/70 leading-relaxed">
                  We'll email you at <span className="font-semibold not-italic text-foreground">{order.email}</span> as soon as we have an update. Usually within a few hours.
                </p>
              </div>

              <Link
                href="/"
                className="inline-flex items-center gap-2 text-primary font-semibold text-sm border-b border-primary/30 pb-0.5 hover:border-primary transition-colors self-start"
              >
                <Icon name="ArrowLeftIcon" size={14} />
                Back to MemoNote
              </Link>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
