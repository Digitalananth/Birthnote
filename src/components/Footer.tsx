import React from 'react';
import Link from 'next/link';
import AppLogo from '@/components/ui/AppLogo';
import { FaFacebook, FaInstagram, FaLinkedin, FaXTwitter, FaYoutube } from 'react-icons/fa6';
import { COMPANY, SOCIAL_PROFILES } from '@/lib/company';

const SOCIAL_ICONS = {
  facebook: FaFacebook,
  instagram: FaInstagram,
  x: FaXTwitter,
  linkedin: FaLinkedin,
  youtube: FaYoutube,
} as const;

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
      { label: 'Gallery', href: '/gallery' },
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
            <Link href="/" className="flex items-center" aria-label="My Lucky Dates — home">
              <AppLogo size={48} />
            </Link>
            <p className="mt-4 text-sm text-muted-foreground leading-relaxed max-w-xs">
              Original banknotes printed on the dates that matter — found, verified and gift-boxed.
            </p>

            <address className="mt-6 not-italic text-sm text-muted-foreground leading-relaxed max-w-xs">
              <span className="block font-semibold text-foreground">{COMPANY.legalName}</span>
              {COMPANY.addressLines.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
              <span className="block mt-3">
                Phone:{' '}
                <a
                  href={COMPANY.phoneHref}
                  className="font-medium text-foreground hover:text-primary transition-colors"
                >
                  {COMPANY.phone}
                </a>
              </span>
              <span className="block">
                Email:{' '}
                <a
                  href={`mailto:${COMPANY.email}`}
                  className="font-medium text-foreground hover:text-primary transition-colors break-all"
                >
                  {COMPANY.email}
                </a>
              </span>
              <span className="block mt-3 text-xs">GSTIN: {COMPANY.gstin}</span>
            </address>

            {SOCIAL_PROFILES.some((profile) => profile.url) && (
              <ul aria-label="Follow us" className="mt-6 flex items-center gap-3">
                {SOCIAL_PROFILES.filter((profile) => profile.url).map((profile) => {
                  const SocialIcon = SOCIAL_ICONS[profile.network];
                  return (
                    <li key={profile.network}>
                      <a
                        href={profile.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={profile.label}
                        title={profile.label}
                        className="w-9 h-9 rounded-full border border-border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary transition-colors"
                      >
                        <SocialIcon size={16} aria-hidden="true" />
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
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
