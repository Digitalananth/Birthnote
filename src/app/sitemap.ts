import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';

/**
 * Only the public, indexable pages belong here. Order, payment and admin
 * pages are per-customer or private, and each sets robots noindex of its own.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: `${env.siteUrl}/`, lastModified, changeFrequency: 'weekly', priority: 1.0 },
    {
      url: `${env.siteUrl}/request-a-banknote`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    { url: `${env.siteUrl}/track-order`, lastModified, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${env.siteUrl}/terms`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${env.siteUrl}/privacy`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
