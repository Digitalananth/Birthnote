'use client';

import React, { useEffect, useState } from 'react';
import Icon from '@/components/ui/AppIcon';

/**
 * A photo of a real note as a small thumbnail, opening full size on click.
 *
 * The cards in the collection section are drawn, not photographed; this is
 * where a visitor sees what the actual paper looks like. Escape or a click
 * outside the picture closes it, as in the order photo viewer.
 */
export default function NoteThumbnail({ src, label }: { src: string; label: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    // The page behind must not scroll while the overlay is up.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="View the real note"
        aria-label={`View a photo of the ${label} note`}
        className="shrink-0 w-14 md:w-16 aspect-[1.6/1] rounded-md overflow-hidden border border-foreground/15 bg-background shadow-sm hover:border-primary hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all cursor-zoom-in"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={`${label} note`} loading="lazy" className="w-full h-full object-cover" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Photo of the ${label} note`}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center p-4 sm:p-8"
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close photo"
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors"
          >
            <Icon name="XMarkIcon" size={20} />
          </button>
          <figure
            onClick={(event) => event.stopPropagation()}
            className="max-w-full max-h-full flex flex-col items-center gap-3"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={`${label} note`}
              className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
            />
            <figcaption className="text-xs text-white/80 text-center">{label}</figcaption>
          </figure>
        </div>
      )}
    </>
  );
}
