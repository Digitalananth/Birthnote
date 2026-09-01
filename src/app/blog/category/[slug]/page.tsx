import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Icon from '@/components/ui/AppIcon';
import PostCard from '@/components/PostCard';
import { getCategoryBySlug, listPublishedPosts } from '@/lib/content';

/** Rendering strategy: ISR — see /[slug]. */
export const revalidate = 3600;
export const dynamicParams = true;

/**
 * Nothing is prerendered at build: an empty params list plus dynamicParams
 * means each URL is generated on its first request and cached from there.
 * Without this the build would need a reachable database, which couples every
 * deploy to the database being up.
 */
export async function generateStaticParams() {
  return [];
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) return { title: 'Not found — My Lucky Dates' };

  return {
    title: category.metaTitle || `${category.name} — My Lucky Dates Blog`,
    description: category.metaDescription || category.description || undefined,
    alternates: { canonical: `/blog/category/${category.slug}` },
  };
}

export default async function BlogCategoryPage({ params }: PageProps) {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  const posts = await listPublishedPosts(category.slug);

  return (
    <>
      <Header />
      <main className="min-h-screen bg-background pt-32 pb-24">
        <div className="max-w-3xl mx-auto px-6 md:px-12">
          <Link
            href="/blog"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors mb-8"
          >
            <Icon name="ArrowLeftIcon" size={12} />
            The Blog
          </Link>

          <h1
            className="font-sans font-extrabold text-foreground mb-3"
            style={{
              fontSize: 'clamp(2rem, 5vw, 3rem)',
              letterSpacing: '-0.03em',
              lineHeight: 1.05,
            }}
          >
            {category.name}
          </h1>
          {category.description && (
            <p className="font-serif italic text-lg text-muted-foreground mb-10">
              {category.description}
            </p>
          )}

          {posts.length === 0 ? (
            <p className="text-muted-foreground">Nothing filed here yet.</p>
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
