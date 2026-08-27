import React from 'react';
import Link from 'next/link';
import AppLogo from '@/components/ui/AppLogo';

export default function Footer() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="max-w-7xl mx-auto px-6 md:px-12 py-10 md:py-12 flex flex-col sm:flex-row items-center justify-between gap-6">
        {/* Logo + brand */}
        <Link href="/" className="flex items-center gap-2">
          <AppLogo size={28} />
          <span className="font-serif text-base font-medium text-foreground">BirthNote</span>
        </Link>

        {/* Links */}
        <nav className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
          <Link href="/#how-it-works" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            How It Works
          </Link>
          <Link href="/request-a-banknote" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Request a Date
          </Link>
          <Link href="/#stories" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Stories
          </Link>
          <Link href="/#what-you-receive" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            What You Receive
          </Link>
          <Link href="/blog" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Journal
          </Link>
        </nav>

        {/* Copyright */}
        <p className="text-sm font-medium text-muted-foreground whitespace-nowrap">
          © {new Date().getFullYear()} BirthNote ·{' '}
          <Link href="/track-order" className="hover:text-foreground transition-colors">
            Track order
          </Link>{' '}
          ·{' '}
          <Link href="/terms" className="hover:text-foreground transition-colors">
            Terms
          </Link>{' '}
          ·{' '}
          <Link href="/privacy" className="hover:text-foreground transition-colors">
            Privacy
          </Link>
        </p>
      </div>
    </footer>
  );
}