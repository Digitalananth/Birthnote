import type { Migration } from './types';
import { PAGE_MARKDOWN } from './0022_seed_pages.content';

/**
 * Publishes the pages the footer links to.
 *
 * The footer's Help and Company columns point at /faq, /shipping, /returns,
 * /about and /authenticity. Their copy was written into content/pages/ with
 * the intent that someone would paste it into the admin, and on production
 * nobody did — so every page on the site carried five links that 404'd, which
 * is exactly what a payment gateway's site review flags.
 *
 * A fresh database now comes up with them published. INSERT IGNORE against
 * the unique slug means a page the owner already created in the admin, in
 * whatever state, is left exactly as it is. After this runs, the admin is
 * where these pages are edited; changing the markdown only affects databases
 * that have not had this migration yet.
 */
const PAGES: Array<{ slug: string; title: string }> = [
  { slug: 'about', title: 'About Us' },
  { slug: 'authenticity', title: 'Authenticity & Sourcing' },
  { slug: 'faq', title: 'Frequently Asked Questions' },
  { slug: 'shipping', title: 'Shipping & Delivery' },
  { slug: 'returns', title: 'Returns & Refunds' },
];

export const migration: Migration = {
  version: '0022',
  name: 'seed_pages',
  async up(m) {
    for (const { slug, title } of PAGES) {
      const body = PAGE_MARKDOWN[slug];
      if (!body) throw new Error(`content/pages/${slug}.md was not bundled.`);
      await m.execute(
        `INSERT IGNORE INTO pages (slug, title, body_markdown, status, updated_by)
         VALUES (?, ?, ?, 'published', 'migration')`,
        [slug, title, body]
      );
    }
  },
};
