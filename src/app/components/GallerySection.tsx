import React from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import GalleryGrid from '@/components/GalleryGrid';
import { listPublishedGalleryPhotos } from '@/lib/gallery';

/**
 * The latest six gift-box photos, with a link to the full gallery. Photos are
 * managed in Admin → Gallery; saving one revalidates `/`. Renders nothing when
 * none are published or the database is unreachable.
 */
export default async function GallerySection() {
  let photos;
  try {
    photos = await listPublishedGalleryPhotos(6);
  } catch (error) {
    console.error('[home] could not load gallery photos', error);
    return null;
  }

  if (photos.length === 0) return null;

  return (
    <section id="gallery" className="bg-background py-20 md:py-28">
      <div className="max-w-7xl mx-auto px-6 md:px-12">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-12">
          <div>
            <span className="text-xs uppercase tracking-widest text-accent font-semibold block mb-4">
              Gallery
            </span>
            <h2
              className="font-sans font-extrabold text-foreground"
              style={{
                fontSize: 'clamp(2rem, 5vw, 3.25rem)',
                lineHeight: 0.95,
                letterSpacing: '-0.03em',
              }}
            >
              Boxes we&apos;ve{' '}
              <span className="font-serif font-light italic text-primary">packed.</span>
            </h2>
          </div>
          <Link
            href="/gallery"
            className="group inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-accent-foreground transition-colors whitespace-nowrap"
          >
            View all
            <Icon
              name="ArrowRightIcon"
              size={14}
              className="group-hover:translate-x-1 transition-transform"
            />
          </Link>
        </div>

        <GalleryGrid
          photos={photos.map(({ id, imageUrl, caption }) => ({ id, imageUrl, caption }))}
        />
      </div>
    </section>
  );
}
