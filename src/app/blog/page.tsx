import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import PostCard from '@/components/PostCard';
import { listPublishedPosts, listCategories } from '@/lib/content';

/**
 * Rendering strategy: SSR.
 *
 * Unlike an individual page or post, this lists the whole collection — so it
 * changes whenever anything is published, and rendering it per request is
 * both simpler and cheaper than invalidating it from six different places.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Journal — BirthNote',
  description:
    'Notes on banknotes, the dates printed on them, and the people who keep them. From the BirthNote collection.',
  alternates: { canonical: '/blog' },
};

export default async function BlogIndexPage() {
  const [posts, categories] = await Promise.all([listPublishedPosts(), listCategories()]);

  return (
    <>
      <Header />
      <main className="min-h-screen bg-background pt-32 pb-24">
        <div className="max-w-3xl mx-auto px-6 md:px-12">
          <h1
            className="font-sans font-extrabold text-foreground mb-3"
            style={{
              fontSize: 'clamp(2rem, 5vw, 3rem)',
              letterSpacing: '-0.03em',
              lineHeight: 1.05,
            }}
          >
            The Journal
          </h1>
          <p className="font-serif italic text-lg text-muted-foreground mb-10">
            Notes on banknotes, the dates printed on them, and the people who keep them.
          </p>

          {categories.length > 0 && (
            <nav className="flex flex-wrap gap-2 mb-10">
              {categories.map((category) => (
                <Link
                  key={category.id}
                  href={`/blog/category/${category.slug}`}
                  className="px-3.5 py-2 rounded-full text-xs font-semibold border border-border bg-background text-muted-foreground hover:text-foreground transition-colors"
                >
                  {category.name}
                </Link>
              ))}
            </nav>
          )}

          {posts.length === 0 ? (
            <p className="text-muted-foreground">Nothing published yet — check back soon.</p>
          ) : (
            <div className="flex flex-col gap-6">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
