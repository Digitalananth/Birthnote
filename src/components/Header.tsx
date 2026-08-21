'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import AppLogo from '@/components/ui/AppLogo';
import Icon from '@/components/ui/AppIcon';

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  const navLinks = [
    { label: 'How It Works', href: '/#how-it-works' },
    { label: 'What You Receive', href: '/#what-you-receive' },
    { label: 'Stories', href: '/#stories' },
    { label: 'Track Order', href: '/track-order' },
    // Deliberately not personalised: showing the signed-in name here would
    // force every page carrying the header to render per request, costing the
    // home page its ISR. /account redirects to /login when nobody is signed in.
    { label: 'My Account', href: '/account' },
  ];

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          scrolled
            ? 'bg-card/90 backdrop-blur-xl border-b border-border shadow-sm'
            : 'bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 md:px-12 h-20 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <AppLogo
              size={36}
              className="transition-transform duration-300 group-hover:scale-105"
              onClick={() => {}}
            />
            <span className="font-serif font-medium text-xl tracking-tight text-foreground">
              BirthNote
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8">
            {navLinks?.map((link) => (
              <Link
                key={link?.label}
                href={link?.href}
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors duration-200"
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
              className="md:hidden w-10 h-10 flex items-center justify-center rounded-full border border-border bg-card/80 text-foreground"
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