'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import AppImage from '@/components/ui/AppImage';

type PaymentState = 'idle' | 'processing' | 'success';

interface CardData {
  name: string;
  number: string;
  expiry: string;
  cvv: string;
  billingAddress: string;
  city: string;
  postcode: string;
}

interface CardErrors {
  name?: string;
  number?: string;
  expiry?: string;
  cvv?: string;
  billingAddress?: string;
  postcode?: string;
}

// Mock confirmed order data
const confirmedOrder = {
  date: '14/03/87',
  denomination: '£1 Bank of England Note',
  year: '1987',
  condition: 'Fine (F)',
  serialPrefix: 'HK',
  country: 'United Kingdom',
  price: 49,
  shipping: 4.95,
  total: 53.95,
  image: 'https://images.unsplash.com/photo-1580048915913-4f8f5cb481c4?w=600&q=80',
};

export default function PaymentFormSection() {
  const [cardData, setCardData] = useState<CardData>({
    name: '',
    number: '',
    expiry: '',
    cvv: '',
    billingAddress: '',
    city: '',
    postcode: '',
  });
  const [errors, setErrors] = useState<CardErrors>({});
  const [paymentState, setPaymentState] = useState<PaymentState>('idle');

  const formatCardNumber = (val: string) => {
    return val
      .replace(/\D/g, '')
      .slice(0, 16)
      .replace(/(.{4})/g, '$1 ')
      .trim();
  };

  const formatExpiry = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 4);
    if (digits.length >= 3) return `${digits.slice(0, 2)} / ${digits.slice(2)}`;
    return digits;
  };

  const validate = (): boolean => {
    const newErrors: CardErrors = {};
    if (!cardData.name.trim()) newErrors.name = 'Enter the cardholder name';
    if (cardData.number.replace(/\s/g, '').length < 16) newErrors.number = 'Enter a valid 16-digit card number';
    if (cardData.expiry.length < 7) newErrors.expiry = 'Enter a valid expiry (MM / YY)';
    if (cardData.cvv.length < 3) newErrors.cvv = 'Enter a valid CVV';
    if (!cardData.billingAddress.trim()) newErrors.billingAddress = 'Enter billing address';
    if (!cardData.postcode.trim()) newErrors.postcode = 'Enter postcode';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setPaymentState('processing');
    setTimeout(() => setPaymentState('success'), 2000);
  };

  if (paymentState === 'success') {
    return (
      <section className="bg-background py-16 md:py-24 pb-28">
        <div className="max-w-2xl mx-auto px-6 md:px-12">
          <div className="card-warm p-10 md:p-14 text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-accent/0 via-accent to-accent/0" />

            <div className="w-20 h-20 rounded-full bg-accent/15 flex items-center justify-center mx-auto mb-6">
              <Icon name="HeartIcon" size={36} className="text-accent" />
            </div>

            <h2 className="font-sans font-extrabold text-foreground mb-3"
              style={{ fontSize: 'clamp(1.6rem, 4vw, 2.8rem)', letterSpacing: '-0.03em' }}>
              Order confirmed.
            </h2>
            <p className="font-serif italic text-lg text-muted-foreground mb-2 leading-relaxed">
              Your note from{' '}
              <span className="text-primary font-semibold not-italic font-mono">
                {confirmedOrder.date}
              </span>{' '}
              is on its way.
            </p>
            <p className="text-sm text-muted-foreground mb-10 leading-relaxed">
              A confirmation email with your tracking number will arrive within the hour.
            </p>

            {/* Delivery summary */}
            <div className="bg-secondary/50 rounded-2xl p-6 text-left mb-8">
              <h3 className="font-sans font-bold text-foreground text-sm uppercase tracking-wide mb-4">
                What happens next
              </h3>
              <div className="flex flex-col gap-3">
                {[
                  { icon: 'EnvelopeIcon' as const, text: 'Confirmation email sent within the hour.' },
                  { icon: 'ArchiveBoxIcon' as const, text: 'Note packaged in archival sleeve and gift box within 1–2 working days.' },
                  { icon: 'TruckIcon' as const, text: 'Dispatched with tracked delivery. Arrives in 3–5 working days.' },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <Icon name={item.icon} size={16} className="text-accent mt-0.5 shrink-0" />
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>

            <Link
              href="/"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors"
            >
              <Icon name="HomeIcon" size={16} />
              Back to MemoNote
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-background py-12 md:py-20 pb-24">
      <div className="max-w-5xl mx-auto px-6 md:px-12">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-10 items-start">

          {/* Payment form — 3 cols */}
          <div className="lg:col-span-3">
            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-8">

              {/* Card details */}
              <div className="card-warm p-7">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="font-sans font-bold text-foreground text-base">Card Details</h2>
                  <div className="flex items-center gap-2 opacity-50">
                    <Icon name="LockClosedIcon" size={14} className="text-muted-foreground" />
                    <span className="text-xs text-muted-foreground font-medium">SSL Secured</span>
                  </div>
                </div>

                <div className="flex flex-col gap-5">
                  {/* Cardholder name */}
                  <div>
                    <label className="block text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-2">
                      Cardholder Name
                    </label>
                    <div className={`border-b-2 transition-colors ${errors.name ? 'border-red-400' : 'border-border focus-within:border-accent'}`}>
                      <input
                        type="text"
                        placeholder="Name as it appears on card"
                        value={cardData.name}
                        onChange={(e) => setCardData((p) => ({ ...p, name: e.target.value }))}
                        className="void-input-warm w-full py-3 text-base font-medium text-foreground placeholder:text-muted-foreground/40"
                      />
                    </div>
                    {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
                  </div>

                  {/* Card number */}
                  <div>
                    <label className="block text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-2">
                      Card Number
                    </label>
                    <div className={`border-b-2 transition-colors ${errors.number ? 'border-red-400' : 'border-border focus-within:border-accent'}`}>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="0000 0000 0000 0000"
                        value={cardData.number}
                        onChange={(e) => setCardData((p) => ({ ...p, number: formatCardNumber(e.target.value) }))}
                        className="void-input-warm w-full py-3 text-base font-mono font-medium text-foreground placeholder:text-muted-foreground/40 tracking-widest"
                      />
                    </div>
                    {errors.number && <p className="text-xs text-red-500 mt-1">{errors.number}</p>}
                  </div>

                  {/* Expiry + CVV */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-2">
                        Expiry
                      </label>
                      <div className={`border-b-2 transition-colors ${errors.expiry ? 'border-red-400' : 'border-border focus-within:border-accent'}`}>
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="MM / YY"
                          value={cardData.expiry}
                          onChange={(e) => setCardData((p) => ({ ...p, expiry: formatExpiry(e.target.value) }))}
                          className="void-input-warm w-full py-3 text-base font-mono font-medium text-foreground placeholder:text-muted-foreground/40"
                        />
                      </div>
                      {errors.expiry && <p className="text-xs text-red-500 mt-1">{errors.expiry}</p>}
                    </div>
                    <div>
                      <label className="block text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-2">
                        CVV
                      </label>
                      <div className={`border-b-2 transition-colors ${errors.cvv ? 'border-red-400' : 'border-border focus-within:border-accent'}`}>
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="•••"
                          maxLength={4}
                          value={cardData.cvv}
                          onChange={(e) => setCardData((p) => ({ ...p, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                          className="void-input-warm w-full py-3 text-base font-mono font-medium text-foreground placeholder:text-muted-foreground/40"
                        />
                      </div>
                      {errors.cvv && <p className="text-xs text-red-500 mt-1">{errors.cvv}</p>}
                    </div>
                  </div>
                </div>
              </div>

              {/* Billing address */}
              <div className="card-warm p-7">
                <h2 className="font-sans font-bold text-foreground text-base mb-6">Delivery Address</h2>
                <div className="flex flex-col gap-5">
                  <div>
                    <label className="block text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-2">
                      Street Address
                    </label>
                    <div className={`border-b-2 transition-colors ${errors.billingAddress ? 'border-red-400' : 'border-border focus-within:border-accent'}`}>
                      <input
                        type="text"
                        placeholder="12 Maple Lane"
                        value={cardData.billingAddress}
                        onChange={(e) => setCardData((p) => ({ ...p, billingAddress: e.target.value }))}
                        className="void-input-warm w-full py-3 text-base font-medium text-foreground placeholder:text-muted-foreground/40"
                      />
                    </div>
                    {errors.billingAddress && <p className="text-xs text-red-500 mt-1">{errors.billingAddress}</p>}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-2">
                        City
                      </label>
                      <div className="border-b-2 border-border focus-within:border-accent transition-colors">
                        <input
                          type="text"
                          placeholder="London"
                          value={cardData.city}
                          onChange={(e) => setCardData((p) => ({ ...p, city: e.target.value }))}
                          className="void-input-warm w-full py-3 text-base font-medium text-foreground placeholder:text-muted-foreground/40"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-2">
                        Postcode
                      </label>
                      <div className={`border-b-2 transition-colors ${errors.postcode ? 'border-red-400' : 'border-border focus-within:border-accent'}`}>
                        <input
                          type="text"
                          placeholder="SW1A 1AA"
                          value={cardData.postcode}
                          onChange={(e) => setCardData((p) => ({ ...p, postcode: e.target.value.toUpperCase() }))}
                          className="void-input-warm w-full py-3 text-base font-mono font-medium text-foreground placeholder:text-muted-foreground/40"
                        />
                      </div>
                      {errors.postcode && <p className="text-xs text-red-500 mt-1">{errors.postcode}</p>}
                    </div>
                  </div>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={paymentState === 'processing'}
                className="group w-full flex items-center justify-center gap-3 px-8 py-5 bg-primary text-primary-foreground rounded-xl font-bold text-base hover:bg-primary/90 transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed shadow-lg"
              >
                {paymentState === 'processing' ? (
                  <>
                    <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    Processing payment…
                  </>
                ) : (
                  <>
                    <Icon name="LockClosedIcon" size={18} />
                    Pay £{confirmedOrder.total.toFixed(2)} Securely
                    <Icon name="ArrowRightIcon" size={18} className="group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>

              <p className="text-xs text-muted-foreground text-center leading-relaxed">
                Your payment is encrypted and secure. By completing payment you agree to our{' '}
                <Link href="#" className="underline hover:text-foreground transition-colors">Terms of Sale</Link>.
              </p>
            </form>
          </div>

          {/* Order summary — 2 cols */}
          <div className="lg:col-span-2 flex flex-col gap-5 sticky top-28">
            {/* Note preview */}
            <div className="card-warm overflow-hidden">
              <div className="relative h-44 overflow-hidden">
                <AppImage
                  src={confirmedOrder.image}
                  alt="Close-up of vintage British pound banknote from 1987, aged paper texture, fine condition, warm light"
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 40vw"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-card/80 to-transparent" />
                <div className="absolute bottom-4 left-4">
                  <span className="px-3 py-1 bg-accent/20 border border-accent/30 rounded-full text-xs font-semibold text-accent-foreground font-mono">
                    {confirmedOrder.date}
                  </span>
                </div>
              </div>
              <div className="p-6">
                <h3 className="font-sans font-bold text-foreground mb-1">{confirmedOrder.denomination}</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {confirmedOrder.country} · {confirmedOrder.year} · Prefix {confirmedOrder.serialPrefix}
                </p>

                {/* Condition badge */}
                <div className="flex items-center gap-2 mb-5">
                  <div className="w-2 h-2 rounded-full bg-accent" />
                  <span className="text-xs font-medium text-muted-foreground">
                    Condition: <span className="text-foreground font-semibold">{confirmedOrder.condition}</span>
                  </span>
                </div>

                {/* Price breakdown */}
                <div className="flex flex-col gap-2 pt-4 border-t border-border">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Banknote</span>
                    <span className="font-medium text-foreground">£{confirmedOrder.price.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Tracked shipping</span>
                    <span className="font-medium text-foreground">£{confirmedOrder.shipping.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between text-base font-bold pt-2 border-t border-border mt-1">
                    <span className="text-foreground">Total</span>
                    <span className="text-primary">£{confirmedOrder.total.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* What's included */}
            <div className="card-warm p-5">
              <h3 className="font-sans font-bold text-foreground text-xs uppercase tracking-wide mb-3">
                Included in your order
              </h3>
              <div className="flex flex-col gap-2.5">
                {[
                  'Authenticated dated banknote',
                  'UV-protective archival sleeve',
                  'Personalised story card',
                  'Kraft presentation gift box',
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <Icon name="CheckCircleIcon" size={15} className="text-accent shrink-0" variant="solid" />
                    <span className="text-sm text-muted-foreground">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Trust */}
            <div className="flex items-center gap-3 px-4 py-3 bg-secondary/50 rounded-xl border border-border">
              <Icon name="ShieldCheckIcon" size={18} className="text-accent shrink-0" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Secured by 256-bit SSL encryption. We never store card details.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}