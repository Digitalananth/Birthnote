import React from 'react';
import Icon from '@/components/ui/AppIcon';

export default function PaymentHeroSection() {
  return (
    <section className="bg-secondary/40 pt-28 pb-8 md:pt-32 md:pb-10 relative overflow-hidden">
      {/* Background vol number */}
      <div
        className="absolute top-0 right-6 md:right-12 pointer-events-none select-none font-sans font-extrabold text-primary/5"
        style={{ fontSize: 'clamp(5rem, 16vw, 14rem)', lineHeight: 1 }}
      >
        PAY
      </div>
      <div className="max-w-2xl mx-auto px-6 md:px-12 relative z-10">
        {/* Progress breadcrumb */}
        <div className="flex items-center gap-2 mb-5">
          {[
            { label: 'Date Submitted', done: true },
            { label: 'Availability Confirmed', done: true },
            { label: 'Payment', done: false, active: true },
          ]?.map((crumb, i) => (
            <React.Fragment key={i}>
              <div className="flex items-center gap-1.5">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center border ${
                  crumb?.done
                    ? 'bg-accent border-accent'
                    : crumb?.active
                    ? 'bg-primary border-primary' :'border-border bg-background'
                }`}>
                  {crumb?.done && <Icon name="CheckIcon" size={11} className="text-foreground" />}
                  {crumb?.active && <div className="w-2 h-2 rounded-full bg-primary-foreground" />}
                </div>
                <span className={`text-xs font-medium hidden sm:block ${
                  crumb?.active ? 'text-foreground' : crumb?.done ? 'text-accent-foreground' : 'text-muted-foreground'
                }`}>
                  {crumb?.label}
                </span>
              </div>
              {i < 2 && <div className={`flex-1 h-px max-w-[40px] ${crumb?.done ? 'bg-accent' : 'bg-border'}`} />}
            </React.Fragment>
          ))}
        </div>

        <span className="text-xs uppercase tracking-widest text-accent font-semibold block mb-3">
          Step 3 of 3
        </span>
        <h1 className="font-sans font-extrabold text-foreground mb-3"
          style={{ fontSize: 'clamp(2rem, 5.5vw, 4rem)', lineHeight: 0.92, letterSpacing: '-0.04em' }}>
          Your note has
          <br />
          <span className="font-serif font-light italic text-primary">been confirmed.</span>
        </h1>
        <p className="text-base md:text-lg text-muted-foreground leading-relaxed max-w-xl">
          Complete your payment below to secure this note. It will be packaged and dispatched within 2 working days.
        </p>
      </div>
    </section>
  );
}