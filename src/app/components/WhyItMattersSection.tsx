'use client';

import React, { useEffect, useRef } from 'react';
import AppImage from '@/components/ui/AppImage';

const stats = [
{ value: '2,400+', label: 'Dates sourced' },
{ value: '98%', label: 'Requests fulfilled' },
{ value: '40+', label: 'Years covered' }];


export default function WhyItMattersSection() {
  const refs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('active');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -30px 0px' }
    );
    refs.current.forEach((el) => {if (el) observer.observe(el);});
    return () => observer.disconnect();
  }, []);

  return (
    <section className="bg-background py-20 md:py-28 relative overflow-hidden">
      {/* Background blob */}
      <div className="absolute -top-20 -left-20 w-96 h-96 blob-warm rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 md:px-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20 items-center">

          {/* Left: Image with depth */}
          <div
            ref={(el) => {refs.current[0] = el as HTMLElement;}}
            className="reveal-warm relative">
            
            <div className="relative rounded-2xl overflow-hidden aspect-[4/5] shadow-2xl">
              <AppImage
                src="https://images.unsplash.com/photo-1632121632770-76f143c8b1a3"
                alt="Hands gently holding a preserved vintage banknote in soft warm light, intimate close-up, brown tones, nostalgic"
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 50vw" />
              
              {/* Subtle warm overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-primary/20 to-transparent" />
            </div>

            {/* Floating stat card */}
            <div className="absolute -bottom-6 -right-4 md:-right-8 glass-warm rounded-2xl p-5 shadow-xl animate-float">
              <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Collection size</p>
              <p className="font-serif font-medium text-3xl text-foreground">2,400<span className="text-accent">+</span></p>
              <p className="text-xs text-muted-foreground mt-0.5">Unique dated notes</p>
            </div>
          </div>

          {/* Right: Text content + stats */}
          <div className="flex flex-col justify-between gap-10">
            <div
              ref={(el) => {refs.current[1] = el as HTMLElement;}}
              className="reveal-warm">
              
              <span className="text-xs uppercase tracking-widest text-accent font-semibold block mb-4">
                Why It Matters
              </span>
              <h2 className="text-section-xl font-sans font-extrabold text-foreground mb-6">
                Not a card.
                <br />
                <span className="font-serif font-light italic text-primary">A keepsake.</span>
              </h2>
              <p className="text-base text-muted-foreground leading-relaxed mb-4">
                Every year, millions of banknotes are printed — each bearing a date. On the day that mattered most to you, one of those notes entered circulation. We find it, preserve it, and give it back to you.
              </p>
              <p className="text-base text-muted-foreground leading-relaxed">
                It's not something you can buy on Amazon. It's not a print or a replica. It's a real piece of history from the exact day that changed everything.
              </p>
            </div>

            {/* Stats row */}
            <div
              ref={(el) => {refs.current[2] = el as HTMLElement;}}
              className="reveal-warm reveal-delay-2 grid grid-cols-3 gap-4 pt-8 border-t border-border">
              
              {stats.map((stat, i) =>
              <div key={i} className="text-center md:text-left">
                  <p className="font-sans font-extrabold text-foreground mb-1"
                style={{ fontSize: 'clamp(1.5rem, 3vw, 2.5rem)' }}>
                    {stat.value}
                  </p>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                    {stat.label}
                  </p>
                </div>
              )}
            </div>

            {/* Pull quote */}
            <div
              ref={(el) => {refs.current[3] = el as HTMLElement;}}
              className="reveal-warm reveal-delay-3 border-l-4 border-accent pl-5 py-1">
              
              <p className="font-serif italic text-lg text-foreground/80 leading-relaxed">
                "The note from my father's birthday in 1963. He held it and didn't say a word for a full minute."
              </p>
              <p className="text-xs text-muted-foreground mt-2 font-medium uppercase tracking-wide">
                — Sarah M., Bristol
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>);

}