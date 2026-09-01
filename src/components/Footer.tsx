import React from 'react';
import Link from 'next/link';
import AppLogo from '@/components/ui/AppLogo';

/**
 * The footer doubles as the site index.
 *
 * The header is capped at what a buyer needs before buying, so everything
 * else — support pages, company pages, anything published from the admin —
 * is reachable from here. New CMS pages belong in one of these columns;
 * without a slot to sit in, a published page is live but unlinkable.
 */
const columns: Array<{ heading: string; links: Array<{ label: string; href: string }> }> = [
  {
    heading: 'Shop',
    links: [
      { label: 'Request a Date', href: '/request-a-banknote' },
      { label: 'How It Works', href: '/#how-it-works' },
      { label: 'What You Receive', href: '/#what-you-receive' },
    ],
  },
  {
    heading: 'Help',
    links: [
      { label: 'FAQ', href: '/faq' },
      { label: 'Shipping & Delivery', href: '/shipping' },
      { label: 'Returns & Refunds', href: '/returns' },
      { label: 'Track Order', href: '/track-order' },
      { label: 'My Account', href: '/account' },
      { label: 'Contact Us', href: 'mailto:support@msphilately.in' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'About Us', href: '/about' },
      { label: 'Authenticity & Sourcing', href: '/authenticity' },
      { label: 'Blog', href: '/blog' },
      { label: 'Stories', href: '/#stories' },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="max-w-7xl mx-auto px-6 md:px-12 py-14 md:py-16">
        <div className="grid grid-cols-2 md:grid-cols-[1.6fr_1fr_1fr_1fr] gap-10 md:gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2">
              <AppLogo size={28} />
              <span className="font-serif text-base font-medium text-foreground">
                My Lucky Dates
              </span>
            </Link>
            <p className="mt-4 text-sm text-muted-foreground leading-relaxed max-w-xs">
              Original banknotes printed on the dates that matter — found, verified and gift-boxed.
            </p>
          </div>

          {columns.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <h2 className="text-xs uppercase tracking-widest font-semibold text-foreground mb-4">
                {column.heading}
              </h2>
              <ul className="flex flex-col gap-3">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/* Legal — demoted, not a column of its own. */}
        <div className="mt-12 pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} My Lucky Dates. All rights reserved.
          </p>
          <nav aria-label="Legal" className="flex items-center gap-6">
            <Link
              href="/terms"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Terms
            </Link>
            <Link
              href="/privacy"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Privacy
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
