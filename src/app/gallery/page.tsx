import React from 'react';
import type { Metadata } from 'next';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import GalleryGrid from '@/components/GalleryGrid';
import { listPublishedGalleryPhotos } from '@/lib/gallery';

/**
 * Rendering strategy: SSR, like /blog — it lists the whole collection, and
 * admin saves also revalidate it.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Gallery — My Lucky Dates',
  description: 'Gift boxes we have prepared — banknotes from the dates that matter, ready to give.',
  alternates: { canonical: '/gallery' },
};

export default async function GalleryPage() {
  const photos = await listPublishedGalleryPhotos();

  return (
    <>
      <Header />
      <main className="min-h-screen bg-background pt-32 pb-24">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <h1
            className="font-sans font-extrabold text-foreground mb-3"
            style={{
              fontSize: 'clamp(2rem, 5vw, 3rem)',
              letterSpacing: '-0.03em',
              lineHeight: 1.05,
            }}
          >
            Gallery
          </h1>
          <p className="font-serif italic text-lg text-muted-foreground mb-10">
            Gift boxes we&apos;ve prepared, each built around a date that matters.
          </p>

          {photos.length === 0 ? (
            <p className="text-muted-foreground">Photos are on their way — check back soon.</p>
          ) : (
            <GalleryGrid
              photos={photos.map(({ id, imageUrl, caption }) => ({ id, imageUrl, caption }))}
            />
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
