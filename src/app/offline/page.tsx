import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';

/**
 * Shown by the service worker when a navigation fails.
 *
 * Static and self-contained: it has to render from the cache with no network,
 * so it cannot use the header, which loads fonts and logo assets.
 */
export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'You are offline — My Lucky Dates',
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-6 py-16">
      <div className="max-w-sm text-center">
        <div className="w-16 h-16 rounded-full bg-accent/15 flex items-center justify-center mx-auto mb-6">
          <Icon name="ArrowPathIcon" size={28} className="text-accent" />
        </div>

        <h1
          className="font-sans font-extrabold text-foreground mb-3"
          style={{ fontSize: 'clamp(1.5rem, 5vw, 2rem)', letterSpacing: '-0.03em' }}
        >
          No connection.
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed mb-8">
          My Lucky Dates needs a connection to look up dates and order status. Nothing you had
          entered has been lost — reconnect and try again.
        </p>

        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-full text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          Try again
          <Icon name="ArrowRightIcon" size={14} />
        </Link>
      </div>
    </main>
  );
}
