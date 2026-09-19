import React from 'react';
import Icon from '@/components/ui/AppIcon';
import { listPublishedTestimonials } from '@/lib/testimonials';

/**
 * The "Real Stories" section. Stories are managed in Admin → Stories; saving
 * one revalidates `/`, so edits show immediately despite the page's ISR.
 * Renders nothing when none are published or the database is unreachable,
 * rather than an empty heading or a broken home page.
 */
export default async function TestimonialsSection() {
  let testimonials;
  try {
    testimonials = await listPublishedTestimonials();
  } catch (error) {
    console.error('[home] could not load testimonials', error);
    return null;
  }

  if (testimonials.length === 0) return null;

  return (
    <section id="stories" className="bg-secondary/30 py-20 md:py-28 relative overflow-hidden">
      {/* Section vol */}
      <div
        className="absolute top-8 left-6 md:left-12 pointer-events-none select-none font-sans font-extrabold text-primary/5"
        style={{ fontSize: 'clamp(5rem, 14vw, 12rem)', lineHeight: 1 }}>

        03
      </div>

      <div className="max-w-7xl mx-auto px-6 md:px-12 relative z-10">
        {/* Header */}
        <div
          className="reveal-warm text-center mb-16">

          <span className="text-xs uppercase tracking-widest text-accent font-semibold block mb-3">
            Real Stories
          </span>
          <h2 className="text-section-xl font-sans font-extrabold text-foreground">
            Gifts they'll never
            <br />
            <span className="font-serif font-light italic text-primary">forget.</span>
          </h2>
        </div>

        {/* Testimonial cards — a swipe row with the scrollbar hidden; card
            widths leave the next card half in view so it reads as scrollable. */}
        <div className="scrollbar-none -mx-6 md:-mx-12 px-6 md:px-12 py-2 flex gap-6 md:gap-8 overflow-x-auto snap-x snap-mandatory scroll-px-6 md:scroll-px-12">
          {testimonials.map((t, i) =>
          <div
            key={t.id}
            className="reveal-warm card-warm p-8 flex flex-col justify-between gap-6 group hover:-translate-y-1 transition-transform duration-300 snap-start shrink-0 w-[80%] sm:w-[60%] md:w-[42%] lg:w-[calc((100%-6rem)/3.3)]"
            style={{ transitionDelay: `${(i % 3) * 100}ms` }}>

              {/* Stars */}
              <div className="flex gap-1">
                {[...Array(5)].map((_, s) =>
              <Icon key={s} name="StarIcon" size={14} variant="solid" className="text-accent" />
              )}
              </div>

              {/* Quote */}
              <p className="font-serif italic text-foreground/80 leading-relaxed text-base flex-1">
                "{t.quote}"
              </p>

              {/* Date badge */}
              {t.dateLabel &&
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-accent/10 rounded-full self-start">
                  <span className="text-xs font-mono font-semibold text-accent-foreground tracking-widest">{t.dateLabel}</span>
                </div>
            }

              {/* Author */}
              <div className="flex items-center gap-3 pt-4 border-t border-border">
                {t.imageUrl &&
              <div className="w-10 h-10 rounded-full overflow-hidden shrink-0">
                    {/* Plain <img>: photo URLs can be uploads or any external host. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                  src={t.imageUrl}
                  alt=""
                  width={40}
                  height={40}
                  loading="lazy"
                  className="object-cover w-full h-full" />
                  </div>
              }
                <div>
                  <p className="text-sm font-semibold text-foreground">{t.name}</p>
                  {t.role && <p className="text-xs text-muted-foreground">{t.role}</p>}
                </div>
                {t.location &&
              <span className="ml-auto text-xs text-muted-foreground font-medium">{t.location}</span>
              }
              </div>
            </div>
          )}
        </div>
      </div>
    </section>);

}
