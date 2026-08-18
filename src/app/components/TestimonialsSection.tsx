'use client';

import React, { useEffect, useRef } from 'react';
import AppImage from '@/components/ui/AppImage';
import Icon from '@/components/ui/AppIcon';

const testimonials = [
{
  quote:
  "My mum turned 60 this year. I gave her a banknote from the 14th of March 1965 — the exact day she was born. She cried. I cried. The whole room went quiet. Nothing I\'ve ever bought has meant more.",
  name: 'James Whitfield',
  role: "Son, gave for his mother's 60th birthday",
  location: 'Manchester',
  image: "https://img.rocket.new/generatedImages/rocket_gen_img_1cbf4bb47-1763293058500.png",
  imageAlt: 'Smiling man in his 30s, warm natural light, casual portrait',
  date: '14/03/65'
},
{
  quote:
  "We found a note from our wedding anniversary date in 1978. He's a collector — he's seen everything. But this? He said it was the most thoughtful gift he'd received in 40 years of marriage.",
  name: 'Patricia Osei',
  role: "Wife, gave for their 45th anniversary",
  location: 'London',
  image: "https://img.rocket.new/generatedImages/rocket_gen_img_19f1ca95c-1784572539049.png",
  imageAlt: 'Warm portrait of a woman smiling, soft indoor light, natural tones',
  date: '07/11/78'
},
{
  quote:
  "My daughter asked what I wanted for my 70th. I said \'nothing expensive.\' She found a note from 1954 — the year I was born — and had it framed. I look at it every morning.",
  name: 'Harold Sutton',
  role: 'Recipient, 70th birthday gift',
  location: 'Edinburgh',
  image: "https://images.unsplash.com/photo-1618674609573-288fb3dab13d",
  imageAlt: 'Elderly man with kind eyes and silver hair, warm afternoon light, gentle smile',
  date: '22/06/54'
}];


export default function TestimonialsSection() {
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
      { threshold: 0.1, rootMargin: '0px 0px -30px 0px' }
    );
    refs.current.forEach((el) => {if (el) observer.observe(el);});
    return () => observer.disconnect();
  }, []);

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
          ref={(el) => {refs.current[0] = el as HTMLElement;}}
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

        {/* Testimonial cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          {testimonials.map((t, i) =>
          <div
            key={i}
            ref={(el) => {refs.current[i + 1] = el as HTMLElement;}}
            className="reveal-warm card-warm p-8 flex flex-col justify-between gap-6 group hover:-translate-y-1 transition-transform duration-300"
            style={{ transitionDelay: `${i * 100}ms` }}>
            
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
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-accent/10 rounded-full self-start">
                <span className="text-xs font-mono font-semibold text-accent-foreground tracking-widest">{t.date}</span>
              </div>

              {/* Author */}
              <div className="flex items-center gap-3 pt-4 border-t border-border">
                <div className="w-10 h-10 rounded-full overflow-hidden shrink-0">
                  <AppImage
                  src={t.image}
                  alt={t.imageAlt}
                  width={40}
                  height={40}
                  className="object-cover w-full h-full" />
                
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.role}</p>
                </div>
                <span className="ml-auto text-xs text-muted-foreground font-medium">{t.location}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>);

}