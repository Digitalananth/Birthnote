'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import AppLogo from '@/components/ui/AppLogo';
import Icon from '@/components/ui/AppIcon';

type HeaderProps = {
  /**
   * Float over a dark full-bleed hero instead of sitting on its own colour.
   *
   * Only the home page has such a hero. Everywhere else the page begins on the
   * light background, where pale-on-pale would be exactly the bug this whole
   * arrangement exists to avoid — so the default is the opaque header, and a
   * page must ask for the overlay.
   */
  overlay?: boolean;
};

export default function Header({ overlay = false }: HeaderProps) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40);
    // Read the position once on mount too: a reload halfway down a page, or a
    // browser restoring the scroll offset, would otherwise leave the header
    // dressed for the top of a page it is nowhere near.
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  const navLinks = [
    { label: 'How It Works', href: '/#how-it-works' },
    { label: 'What You Receive', href: '/#what-you-receive' },
    { label: 'Stories', href: '/#stories' },
    { label: 'Blog', href: '/blog' },
    { label: 'Track Order', href: '/track-order' },
    // Deliberately not personalised: showing the signed-in name here would
    // force every page carrying the header to render per request, costing the
    // home page its ISR. /account redirects to /login when nobody is signed in.
    { label: 'My Account', href: '/account' },
  ];

  /**
   * True only while the header floats over the hero. Everything that carries a
   * colour reads this one flag, so the two states cannot drift apart.
   */
  // `mobileOpen` counts as off the hero: the menu overlay behind the header is
  // light, so light type would vanish the moment the menu opened.
  const onDark = overlay && !scrolled && !mobileOpen;

  return (
    <>
      {/*
        Two states, and legible in both.
        
        The original header was transparent until 40px of scroll and painted its
        dark ink straight onto the hero photograph, so the wordmark and the menu
        were invisible at the one moment everybody sees them. Rather than give
        up the photograph, the header keeps floating over it and dresses for it:
        light type, and a scrim of its own so the type never depends on which
        part of the image happens to sit behind it. Past the hero it becomes the
        opaque header, dark type on card.
      */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-colors duration-300 ${
          onDark
            ? 'bg-gradient-to-b from-black/55 via-black/30 to-transparent'
            : 'bg-card border-b border-border'
        } ${scrolled ? 'shadow-sm' : ''}`}
      >
        <div className="max-w-7xl mx-auto px-6 md:px-12 h-20 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <AppLogo
              size={36}
              className="transition-transform duration-300 group-hover:scale-105"
              onClick={() => {}}
            />
            <span
              className={`font-serif font-medium text-xl tracking-tight transition-colors duration-300 ${
                onDark ? 'text-primary-foreground drop-shadow-sm' : 'text-foreground'
              }`}
            >
              My Lucky Dates
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8">
            {navLinks?.map((link) => (
              <Link
                key={link?.label}
                href={link?.href}
                className={`text-sm font-medium transition-colors duration-200 ${
                  onDark
                    ? 'text-primary-foreground/90 hover:text-primary-foreground drop-shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {link?.label}
              </Link>
            ))}
          </nav>

          {/* CTA */}
          <div className="flex items-center gap-3">
            <Link
              href="/request-a-banknote"
              className="hidden sm:inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-full text-sm font-semibold hover:bg-primary/90 transition-all duration-200 animate-pulse-glow"
            >
              Find My Date
              <Icon name="ArrowRightIcon" size={14} />
            </Link>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className={`md:hidden w-10 h-10 flex items-center justify-center rounded-full border transition-colors duration-300 ${
                onDark
                  ? 'border-primary-foreground/30 bg-black/25 text-primary-foreground'
                  : 'border-border bg-card/80 text-foreground'
              }`}
              aria-label="Toggle menu"
            >
              <Icon name={mobileOpen ? 'XMarkIcon' : 'Bars3Icon'} size={20} />
            </button>
          </div>
        </div>
      </header>
      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/95 backdrop-blur-xl flex flex-col pt-24 px-6"
          onClick={() => setMobileOpen(false)}
        >
          <nav className="flex flex-col gap-6 mt-8">
            {navLinks?.map((link) => (
              <Link
                key={link?.label}
                href={link?.href}
                onClick={() => setMobileOpen(false)}
                className="text-2xl font-serif font-medium text-foreground border-b border-border pb-4"
              >
                {link?.label}
              </Link>
            ))}
            <Link
              href="/request-a-banknote"
              onClick={() => setMobileOpen(false)}
              className="mt-4 inline-flex items-center justify-center gap-2 px-6 py-4 bg-primary text-primary-foreground rounded-full text-base font-semibold"
            >
              Find My Date
              <Icon name="ArrowRightIcon" size={16} />
            </Link>
          </nav>
        </div>
      )}
    </>
  );
}
