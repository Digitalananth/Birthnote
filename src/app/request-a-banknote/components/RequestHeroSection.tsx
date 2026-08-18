import React from 'react';

export default function RequestHeroSection() {
  return (
    <section className="bg-secondary/40 pt-32 pb-12 md:pt-36 md:pb-16 relative overflow-hidden">
      {/* Background vol number */}
      <div
        className="absolute top-0 right-6 md:right-12 pointer-events-none select-none font-sans font-extrabold text-primary/5"
        style={{ fontSize: 'clamp(6rem, 18vw, 16rem)', lineHeight: 1 }}
      >
        REQ
      </div>

      <div className="max-w-3xl mx-auto px-6 md:px-12 relative z-10">
        <span className="text-xs uppercase tracking-widest text-accent font-semibold block mb-4">
          Step 1 of 3
        </span>
        <h1 className="font-sans font-extrabold text-foreground mb-4"
          style={{ fontSize: 'clamp(2.2rem, 6vw, 4.5rem)', lineHeight: 0.92, letterSpacing: '-0.04em' }}>
          Find a note
          <br />
          <span className="font-serif font-light italic text-primary">from your special date.</span>
        </h1>
        <p className="text-base md:text-lg text-muted-foreground leading-relaxed max-w-xl">
          Enter any memorable date below — a birthday, anniversary, wedding day, or moment that matters. We'll search our collection and reply within 24 hours to confirm whether a matching note is available.
        </p>
      </div>
    </section>
  );
}