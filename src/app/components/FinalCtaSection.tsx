import React from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';

export default function FinalCtaSection() {

  return (
    <section className="bg-background py-20 md:py-24">
      <div className="max-w-4xl mx-auto px-6 md:px-12">
        <section
          className="reveal-warm relative overflow-hidden bg-primary rounded-3xl p-10 md:p-16 text-center"
        >
          {/* Blob */}
          <div className="absolute inset-0 overflow-hidden rounded-3xl pointer-events-none">
            <div className="absolute -top-12 -right-12 w-64 h-64 rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(200,150,90,0.25) 0%, transparent 70%)' }} />
            <div className="absolute -bottom-12 -left-12 w-64 h-64 rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(255,248,240,0.08) 0%, transparent 70%)' }} />
          </div>

          <div className="relative z-10">
            <span className="text-xs uppercase tracking-widest text-accent font-semibold block mb-4">
              Ready to find yours?
            </span>
            <h2 className="font-sans font-extrabold text-primary-foreground mb-4"
              style={{ fontSize: 'clamp(2rem, 6vw, 4rem)', lineHeight: 0.92, letterSpacing: '-0.03em' }}>
              Every special day
              <br />
              <span className="font-serif font-light italic text-accent">has a note.</span>
            </h2>
            <p className="text-primary-foreground/70 text-base md:text-lg max-w-lg mx-auto leading-relaxed mb-10 mt-5">
              Submit any memorable date and we'll check our collection. Free to request, no commitment until we confirm.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link
                href="/request-a-banknote"
                className="group inline-flex items-center gap-2 px-8 py-4 bg-primary-foreground text-primary rounded-xl font-bold text-base hover:bg-accent hover:text-foreground transition-all duration-300 shadow-lg"
              >
                Find My Banknote
                <Icon name="ArrowRightIcon" size={18} className="group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                href="/#stories"
                className="inline-flex items-center gap-2 px-8 py-4 border border-primary-foreground/20 text-primary-foreground/80 rounded-xl font-medium text-base hover:border-primary-foreground/60 hover:text-primary-foreground transition-all duration-300"
              >
                Read stories first
              </Link>
            </div>

            <p className="text-primary-foreground/40 text-xs mt-6 font-medium">
              Replies within 24 hours · Secure payment · Delivered in 3–5 days
            </p>
          </div>
        </section>
      </div>
    </section>
  );
}