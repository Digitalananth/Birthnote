import React from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';

const steps = [
  {
    number: '01',
    icon: 'CalendarDaysIcon' as const,
    title: 'Submit Your Date',
    description:
      'Enter any memorable date in DD/MM/YY format — a birthday, anniversary, wedding day, or special moment. We search our authenticated collection of dated banknotes from across decades.',
    detail: 'Takes 30 seconds',
  },
  {
    number: '02',
    icon: 'MagnifyingGlassIcon' as const,
    title: 'We Confirm Availability',
    description:
      'Our team personally verifies the note exists in our collection, checks its condition, and confirms the match within 24 hours.',
    detail: 'Reply within 24h',
  },
  {
    number: '03',
    icon: 'GiftIcon' as const,
    title: 'Pay & Receive',
    description:
      'Once confirmed, you pay securely and we ship the note in an archival presentation sleeve with a personalised card.',
    detail: 'Delivered in 3–5 days',
  },
];

export default function HowItWorksSection() {

  return (
    <section id="how-it-works" className="bg-secondary/40 py-20 md:py-28 relative overflow-hidden">
      {/* Section volume number */}
      <div className="absolute top-8 right-6 md:right-12 pointer-events-none select-none font-sans font-extrabold text-primary/5"
        style={{ fontSize: 'clamp(5rem, 14vw, 12rem)', lineHeight: 1 }}>
        01
      </div>

      <div className="max-w-7xl mx-auto px-6 md:px-12 relative z-10">
        {/* Header */}
        <div
          className="reveal-warm mb-16 md:mb-20"
        >
          <span className="text-xs uppercase tracking-widest text-accent font-semibold block mb-3">
            The Process
          </span>
          <h2 className="text-section-xl font-sans font-extrabold text-foreground">
            Simple as
            <br />
            <span className="font-serif font-light italic text-primary">making a wish.</span>
          </h2>
        </div>

        {/* Steps */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          {steps.map((step, i) => (
            <div
              key={step.number}
              className="reveal-warm card-warm p-8 md:p-10 relative overflow-hidden group hover:-translate-y-1 transition-transform duration-300"
              style={{ transitionDelay: `${i * 120}ms` }}
            >
              {/* Shimmer */}
              <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-accent/6 to-transparent pointer-events-none group-hover:animate-shimmer" />

              {/* Step number background */}
              <div className="absolute top-4 right-6 font-sans font-extrabold text-primary/5 select-none pointer-events-none"
                style={{ fontSize: '5rem', lineHeight: 1 }}>
                {step.number}
              </div>

              <div className="relative z-10">
                {/* Icon */}
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-6 group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
                  <Icon name={step.icon} size={22} className="text-primary group-hover:text-primary-foreground transition-colors" />
                </div>

                {/* Step tag */}
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2 block">
                  Step {step.number}
                </span>

                <h3 className="text-xl font-sans font-bold text-foreground mb-3 leading-tight">
                  {step.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                  {step.description}
                </p>

                {/* Detail tag */}
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent/10 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                  <span className="text-xs font-semibold text-accent-foreground">{step.detail}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA nudge */}
        <div
          className="reveal-warm mt-12 flex justify-center"
        >
          <Link
            href="/request-a-banknote"
            className="group inline-flex items-center gap-2 text-primary font-semibold border-b-2 border-primary/30 pb-0.5 hover:border-primary transition-colors"
          >
            Start your request
            <Icon name="ArrowRightIcon" size={16} className="group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </div>
    </section>
  );
}