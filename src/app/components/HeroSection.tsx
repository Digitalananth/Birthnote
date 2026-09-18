import React from 'react';
import Link from 'next/link';
import AppImage from '@/components/ui/AppImage';
import Icon from '@/components/ui/AppIcon';

export default function HeroSection() {

  // The banner is a finished design with its own headline and logo, so it is
  // shown whole at its own 12:5 shape — no cropping, scrim or text on top —
  // and the date finder sits bottom-right, raised 16% to clear the banner's
  // "Trusted by" strip (the bottom ~13.5% of the image). Below xl the
  // banner is too short to hold the card, so it drops beneath the banner.
  // mt-20 clears the fixed header.
  return (
    <section className="relative mt-20 w-full">
      <div className="relative w-full aspect-[12/5] bg-secondary">
        <AppImage
          src="/assets/images/hero-banner.jpg"
          alt="My Lucky Dates — Gift Memories. Gift Luck. Genuine Indian banknotes with serial-number patterns matching meaningful dates."
          fill
          priority
          className="object-contain"
          sizes="100vw" />
      </div>
      <div className="w-full px-6 md:px-12 py-8 md:py-12 xl:absolute xl:bottom-[16%] xl:right-12 xl:w-auto xl:p-0 xl:z-10">
        {/* Right: Glassmorphism CTA card */}
        <div
          className="w-full max-w-xl mx-auto xl:w-[26rem] xl:max-w-none"
          >
          
          <div className="relative overflow-hidden glass-warm rounded-2xl p-5 lg:p-7 shadow-2xl">
            {/* Shimmer */}
            <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-accent/8 to-transparent pointer-events-none animate-shimmer" />

            <div className="relative z-10">
              <p className="text-sm font-medium text-foreground/60 uppercase tracking-widest mb-1">
                Find your date
              </p>
              <p className="text-foreground font-serif font-medium text-lg lg:text-xl mb-4 lg:mb-5 leading-snug">
                Enter a memorable date to see if a matching Indian banknote exists.
              </p>

              {/* Mini date preview */}
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 bg-secondary/60 rounded-xl px-4 py-3 border border-border">
                  <p className="text-xs text-muted-foreground mb-0.5 uppercase tracking-wide">Memorable Date</p>
                  <p className="text-foreground font-mono font-semibold text-lg tracking-widest">DD / MM / YY</p>
                </div>
                <div className="flex flex-col gap-1 text-right">
                  <span className="text-xs text-muted-foreground">e.g.</span>
                  <span className="text-sm font-mono text-foreground/70">14/03/87</span>
                </div>
              </div>

              {/* Denominations */}
              <div className="mb-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Available Denominations</p>
                <div className="flex flex-wrap gap-1.5">
                  {['₹1', '₹2', '₹5', '₹10', '₹20', '₹50', '₹100', '₹200', '₹500']?.map((d) => (
                    <span key={d} className="px-2 py-0.5 rounded-md bg-accent/15 border border-accent/25 text-xs font-mono font-semibold text-foreground/80">
                      {d}
                    </span>
                  ))}
                </div>
              </div>

              <Link
                href="/request-a-banknote"
                className="group w-full flex items-center justify-between px-6 py-3.5 bg-primary text-primary-foreground rounded-xl font-semibold text-base hover:bg-primary/90 transition-all duration-300">
                
                <span>Check Availability</span>
                <Icon name="ArrowRightIcon" size={18} className="group-hover:translate-x-1 transition-transform" />
              </Link>

              <div className="mt-4 flex items-center justify-between text-xs text-foreground/40 font-medium">
                <span>Free to request</span>
                <span>·</span>
                <span>No commitment</span>
                <span>·</span>
                <span>Reply within 24h</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );

}
