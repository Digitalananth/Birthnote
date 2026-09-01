import React from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

/**
 * The frame every signed-out account page sits in.
 *
 * A server component, so the page around each client form stays HTML.
 */
export default function AuthShell({
  title,
  subtitle,
  footer,
  children,
}: {
  title: string;
  subtitle?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      <main className="bg-background min-h-screen pt-32 pb-24">
        <div className="max-w-md mx-auto px-6">
          <div className="card-warm p-8 md:p-10">
            <h1
              className="font-sans font-extrabold text-foreground mb-2"
              style={{ fontSize: 'clamp(1.5rem, 4vw, 2rem)', letterSpacing: '-0.03em' }}
            >
              {title}
            </h1>
            {subtitle && (
              <p className="text-sm text-muted-foreground leading-relaxed mb-8">{subtitle}</p>
            )}
            {children}
          </div>
          {footer && <div className="text-center text-sm text-muted-foreground mt-6">{footer}</div>}
          <p className="text-center text-sm text-muted-foreground mt-4">
            <Link href="/" className="text-primary underline">
              Back to My Lucky Dates
            </Link>
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
