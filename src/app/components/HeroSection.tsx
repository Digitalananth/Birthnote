'use client';

import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import AppImage from '@/components/ui/AppImage';
import Icon from '@/components/ui/AppIcon';

export default function HeroSection() {
  const badgeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const badge = badgeRef?.current;
    if (!badge) return;
    setTimeout(() => {
      badge.style.opacity = '1';
      badge.style.transform = 'translateY(0)';
    }, 2600);
  }, []);

  return (
    <section className="relative w-full min-h-screen overflow-hidden flex flex-col justify-end pb-12 md:pb-20">
      {/* Background image layer — cinematic entrance */}
      <div className="absolute inset-0 z-0 bg-foreground">
        <AppImage
          src="https://images.unsplash.com/photo-1700394474173-6428c2ea061c"
          alt="Aged vintage banknotes and currency spread on warm wooden surface, warm amber light, soft shadows, nostalgic atmosphere"
          fill
          priority
          className="object-cover animate-cinematic opacity-0"
          sizes="100vw" />
        
        {/* Warm gradient scrim — dark at bottom for white text legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-foreground/90 via-foreground/30 to-transparent" />
        {/* Subtle warm tone overlay */}
        <div className="absolute inset-0 bg-primary/10 mix-blend-multiply" />
        {/* Grain texture */}
        <div className="absolute inset-0 grain-overlay opacity-60" />
      </div>
      {/* Floating status badge */}
      <div
        ref={badgeRef}
        className="absolute top-28 right-6 md:right-12 z-20 opacity-0 translate-y-4"
        style={{ transition: 'opacity 0.8s ease, transform 0.8s cubic-bezier(0.22,1,0.36,1)' }}>
        
        <div className="px-4 py-2.5 rounded-xl bg-foreground/50 backdrop-blur-md border border-accent/30 flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
          <span className="text-xs font-mono tracking-wider uppercase text-primary-foreground/90">
            Indian Banknotes Available
          </span>
        </div>
      </div>
      {/* Hero content grid */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-12 gap-6 items-end">

        {/* Left: Primary headline */}
        <div className="md:col-span-7">
          {/* Eyebrow */}
          <div
            className="flex items-center gap-3 mb-6 animate-slide-up opacity-0"
            style={{ animationDelay: '1.0s', animationFillMode: 'forwards' }}>
            
            <span className="h-px w-8 bg-accent/80" />
            <span className="text-xs font-mono uppercase tracking-widest text-primary-foreground/70">
              Genuine dated banknotes
            </span>
          </div>

          <h1
            className="text-hero-xl font-sans font-extrabold text-primary-foreground leading-none tracking-tight animate-slide-up opacity-0"
            style={{ animationDelay: '1.2s', animationFillMode: 'forwards' }}>
            
            The day that
            <br />
            <span className="font-serif font-light italic text-accent">mattered most,</span>
            <br />
            was printed.
          </h1>

          <p
            className="mt-6 text-base md:text-lg text-primary-foreground/70 font-light max-w-md leading-relaxed animate-slide-up opacity-0"
            style={{ animationDelay: '1.45s', animationFillMode: 'forwards' }}>
            
            A real banknote from the exact date of your most memorable moment — authenticated, preserved, and given with love.
          </p>
        </div>

        {/* Right: Glassmorphism CTA card */}
        <div
          className="md:col-span-5 animate-slide-up opacity-0"
          style={{ animationDelay: '1.7s', animationFillMode: 'forwards' }}>
          
          <div className="relative overflow-hidden glass-warm rounded-2xl p-8 shadow-2xl">
            {/* Shimmer */}
            <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-accent/8 to-transparent pointer-events-none animate-shimmer" />

            <div className="relative z-10">
              <p className="text-sm font-medium text-foreground/60 uppercase tracking-widest mb-1">
                Find your date
              </p>
              <p className="text-foreground font-serif font-medium text-xl mb-6 leading-snug">
                Enter a memorable date to see if a matching Indian banknote exists.
              </p>

              {/* Mini date preview */}
              <div className="flex items-center gap-3 mb-5">
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
              <div className="mb-5">
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
                className="group w-full flex items-center justify-between px-6 py-4 bg-primary text-primary-foreground rounded-xl font-semibold text-base hover:bg-primary/90 transition-all duration-300">
                
                <span>Check Availability</span>
                <Icon name="ArrowRightIcon" size={18} className="group-hover:translate-x-1 transition-transform" />
              </Link>

              <div className="mt-5 flex items-center justify-between text-xs text-foreground/40 font-medium">
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
      {/* Scroll indicator */}
      <div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 animate-slide-up opacity-0"
        style={{ animationDelay: '2.2s', animationFillMode: 'forwards' }}>
        
        <span className="text-xs uppercase tracking-widest text-primary-foreground/40 font-mono">Scroll</span>
        <div className="w-px h-10 bg-gradient-to-b from-accent/60 to-transparent" />
      </div>
    </section>
  );

}