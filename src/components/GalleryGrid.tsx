'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Icon from '@/components/ui/AppIcon';

export interface GalleryGridPhoto {
  id: number;
  imageUrl: string;
  caption: string | null;
}

/**
 * A masonry grid of gift-box photos, each shown whole at its own aspect
 * ratio; clicking one opens it full size. Arrow keys
 * step through, Escape closes.
 */
export default function GalleryGrid({ photos }: { photos: GalleryGridPhoto[] }) {
  const [open, setOpen] = useState<number | null>(null);

  const step = useCallback(
    (delta: number) =>
      setOpen((i) => (i === null ? i : (i + delta + photos.length) % photos.length)),
    [photos.length]
  );

  useEffect(() => {
    if (open === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(null);
      if (event.key === 'ArrowRight') step(1);
      if (event.key === 'ArrowLeft') step(-1);
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, step]);

  const current = open === null ? null : photos[open];

  return (
    <>
      <div className="columns-2 md:columns-3 gap-3 md:gap-5">
        {photos.map((photo, i) => (
          <button
            key={photo.id}
            type="button"
            onClick={() => setOpen(i)}
            className="group relative mb-3 md:mb-5 block w-full break-inside-avoid overflow-hidden rounded-2xl bg-secondary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={photo.caption ? `View photo: ${photo.caption}` : 'View photo'}
          >
            {/* Plain <img>: uploads are served from /api/media. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.imageUrl}
              alt={photo.caption ?? 'A My Lucky Dates gift box'}
              loading="lazy"
              className="block w-full h-auto transition-transform duration-500 group-hover:scale-105"
            />
            {photo.caption && (
              <span className="absolute inset-x-0 bottom-0 p-3 text-left text-xs md:text-sm font-medium text-white bg-gradient-to-t from-black/60 to-transparent">
                {photo.caption}
              </span>
            )}
          </button>
        ))}
      </div>

      {current && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Photo viewer"
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setOpen(null)}
        >
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(null)}
            className="absolute top-4 right-4 p-2 text-white/80 hover:text-white"
          >
            <Icon name="XMarkIcon" size={28} />
          </button>
          {photos.length > 1 && (
            <>
              <button
                type="button"
                aria-label="Previous photo"
                onClick={(event) => {
                  event.stopPropagation();
                  step(-1);
                }}
                className="absolute left-2 md:left-6 p-2 text-white/80 hover:text-white"
              >
                <Icon name="ChevronLeftIcon" size={32} />
              </button>
              <button
                type="button"
                aria-label="Next photo"
                onClick={(event) => {
                  event.stopPropagation();
                  step(1);
                }}
                className="absolute right-2 md:right-6 p-2 text-white/80 hover:text-white"
              >
                <Icon name="ChevronRightIcon" size={32} />
              </button>
            </>
          )}
          <figure
            className="max-w-5xl w-full flex flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={current.imageUrl}
              alt={current.caption ?? 'A My Lucky Dates gift box'}
              className="max-h-[80vh] w-auto max-w-full object-contain rounded-xl"
            />
            {current.caption && (
              <figcaption className="text-sm text-white/85 text-center">
                {current.caption}
              </figcaption>
            )}
          </figure>
        </div>
      )}
    </>
  );
}
