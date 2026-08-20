import React from 'react';
import AppImage from '@/components/ui/AppImage';
import Icon from '@/components/ui/AppIcon';

const inclusions = [
{
  icon: 'DocumentTextIcon' as const,
  title: 'The Banknote',
  description: 'Genuine circulated banknote bearing your chosen date, in Fine or better condition.'
},
{
  icon: 'ArchiveBoxIcon' as const,
  title: 'Archival Sleeve',
  description: 'UV-protective sleeve that preserves the note for generations without yellowing.'
},
{
  icon: 'EnvelopeOpenIcon' as const,
  title: 'Personalised Card',
  description: 'A hand-written card telling the story of the note — date, country of issue, and a personal message.'
},
{
  icon: 'GiftIcon' as const,
  title: 'Gift Box',
  description: 'Kraft-lined presentation box, ready to give. No wrapping required.'
}];


export default function WhatYouReceiveSection() {

  return (
    <section id="what-you-receive" className="bg-foreground text-primary-foreground py-20 md:py-28 relative overflow-hidden">
      {/* Section vol number */}
      <div
        className="absolute bottom-8 left-6 md:left-12 pointer-events-none select-none font-sans font-extrabold text-primary-foreground/5"
        style={{ fontSize: 'clamp(5rem, 14vw, 12rem)', lineHeight: 1 }}>
        
        02
      </div>

      {/* Background warm blob */}
      <div className="absolute top-1/2 right-0 -translate-y-1/2 w-80 h-80 blob-warm rounded-full pointer-events-none opacity-30" />

      <div className="max-w-7xl mx-auto px-6 md:px-12 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20 items-center">

          {/* Left: Content */}
          <div className="flex flex-col gap-10">
            <div
              className="reveal-warm">
              
              <span className="text-xs uppercase tracking-widest text-accent font-semibold block mb-4">
                Every Order Includes
              </span>
              <h2 className="text-section-xl font-sans font-extrabold text-primary-foreground mb-6">
                Everything to
                <br />
                <span className="font-serif font-light italic text-accent">make it special.</span>
              </h2>
            </div>

            {/* Inclusions list */}
            <div
              className="reveal-warm reveal-delay-1 flex flex-col gap-5">
              
              {inclusions.map((item, i) =>
              <div
                key={i}
                className="flex items-start gap-4 pb-5 border-b border-primary-foreground/10 last:border-0 last:pb-0 group">
                
                  <div className="w-10 h-10 rounded-xl bg-primary-foreground/8 flex items-center justify-center shrink-0 group-hover:bg-accent group-hover:text-foreground transition-colors duration-300 border border-primary-foreground/10">
                    <Icon name={item.icon} size={18} className="text-accent group-hover:text-foreground transition-colors" />
                  </div>
                  <div>
                    <h4 className="font-sans font-semibold text-primary-foreground mb-1">{item.title}</h4>
                    <p className="text-sm text-primary-foreground/60 leading-relaxed">{item.description}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Price indicator */}
            <div
              className="reveal-warm reveal-delay-2 flex items-center gap-4 pt-2">
              
              <div>
                <p className="text-xs uppercase tracking-widest text-primary-foreground/40 mb-1">Starting from</p>
                <p className="font-serif font-medium text-3xl text-primary-foreground">
                  ₹499 <span className="text-primary-foreground/40 text-base font-sans font-normal">/ note</span>
                </p>
              </div>
              <div className="h-12 w-px bg-primary-foreground/10" />
              <div>
                <p className="text-sm text-primary-foreground/50 max-w-xs leading-relaxed mb-2">
                  Price confirmed after availability check. No payment until you approve.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {['₹1', '₹2', '₹5', '₹10', '₹20', '₹50', '₹100', '₹200', '₹500'].map((d) => (
                    <span key={d} className="px-1.5 py-0.5 rounded bg-primary-foreground/10 text-xs font-mono font-semibold text-primary-foreground/70">
                      {d}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right: Product image */}
          <div
            className="reveal-warm reveal-delay-2 relative">
            
            <div className="relative rounded-2xl overflow-hidden aspect-square shadow-2xl">
              <AppImage
                src="https://img.rocket.new/generatedImages/rocket_gen_img_10c2c1ecf-1772218618826.png"
                alt="Elegant gift box open revealing a preserved banknote in archival sleeve, warm candlelight, dark atmospheric background, deep shadows"
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 50vw" />
              
              <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 via-transparent to-transparent" />

              {/* Overlay badge */}
              <div className="absolute bottom-6 left-6 right-6 glass-warm rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
                    <Icon name="CheckBadgeIcon" size={20} className="text-accent" />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-foreground">Authenticated</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Every note verified by our team</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Spinning decorative element */}
            <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full border border-accent/20 animate-spin-slow pointer-events-none hidden md:block" />
            <div className="absolute -top-3 -right-3 w-12 h-12 rounded-full border border-accent/40 animate-spin-slow pointer-events-none hidden md:block"
            style={{ animationDirection: 'reverse', animationDuration: '15s' }} />
          </div>
        </div>
      </div>
    </section>);

}