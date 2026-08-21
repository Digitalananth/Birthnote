import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';
import { listPublishedForSitemap } from '@/lib/content';

/**
 * Only the public, indexable pages belong here. Order, payment and admin
 * pages are per-customer or private, and each sets robots noindex of its own.
 *
 * The CMS entries are read from the database, so publishing a page or post
 * puts it in the sitemap without a deploy. Built per request: crawlers fetch
 * it rarely, and a sitemap listing a page that no longer exists is worse than
 * the cost of one query.
 */
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date();

  const fixed: MetadataRoute.Sitemap = [
    { url: `${env.siteUrl}/`, lastModified, changeFrequency: 'weekly', priority: 1.0 },
    {
      url: `${env.siteUrl}/request-a-banknote`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    { url: `${env.siteUrl}/blog`, lastModified, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${env.siteUrl}/track-order`, lastModified, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${env.siteUrl}/terms`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${env.siteUrl}/privacy`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
  ];

  let content: Awaited<ReturnType<typeof listPublishedForSitemap>>;
  try {
    content = await listPublishedForSitemap();
  } catch (error) {
    // A sitemap that is missing the blog beats a 500 where the sitemap should
    // be — search engines treat the latter far less kindly.
    console.error('[sitemap] could not read CMS content', error);
    return fixed;
  }

  return [
    ...fixed,
    ...content.pages.map((page) => ({
      url: `${env.siteUrl}/${page.slug}`,
      lastModified: new Date(page.updatedAt),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
    ...content.categories.map((category) => ({
      url: `${env.siteUrl}/blog/category/${category.slug}`,
      lastModified,
      changeFrequency: 'weekly' as const,
      priority: 0.4,
    })),
    ...content.posts.map((post) => ({
      url: `${env.siteUrl}/blog/${post.slug}`,
      lastModified: new Date(post.updatedAt),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
  ];
}
