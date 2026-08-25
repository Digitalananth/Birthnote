import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Order and payment URLs contain a customer's reference number, and
        // the account pages are per-customer — neither must ever be indexed.
        disallow: [
          '/api/',
          '/_next/',
          '/admin',
          '/admin/',
          '/payment/',
          '/track-order/',
          '/account',
          '/account/',
          '/login',
          '/signup',
        ],
      },
    ],
    sitemap: `${env.siteUrl}/sitemap.xml`,
  };
}
