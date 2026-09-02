'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { photoSrc, type OrderItemPhoto } from '@/lib/order-photo-types';

/**
 * The photographs of one note: thumbnails inline, the full picture on click.
 *
 * A banknote is bought on its condition, and condition is something you look
 * at. The thumbnail sits beside the note it belongs to so the customer can see
 * at a glance that there is a photo; the overlay is where they actually judge
 * it, so it is as large as the viewport allows and nothing else competes.
 *
 * Deliberately a plain <img>, not next/image: these are private, per-order
 * bytes behind an authorising route, and the image optimiser would both cache
 * them where they do not belong and need the route allow-listed as a remote
 * pattern to fetch them at all.
 */
export default function NotePhotos({
  reference,
  photos,
  label,
  size = 44,
}: {
  reference: string;
  photos: OrderItemPhoto[];
  /** What the note is, for the alt text and the overlay caption. */
  label: string;
  size?: number;
}) {
  const [open, setOpen] = useState<number | null>(null);

  if (!photos.length) return null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        {photos.map((photo, index) => (
          <button
            key={photo.id}
            type="button"
            onClick={() => setOpen(index)}
            title="View photo"
            aria-label={`View photo ${index + 1} of ${label}`}
            className="rounded-lg overflow-hidden border border-border hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 transition-colors"
            style={{ width: size, height: size }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoSrc(reference, photo.id)}
              alt={`${label} — photo ${index + 1}`}
              loading="lazy"
              className="w-full h-full object-cover"
            />
          </button>
        ))}
      </div>

      {open !== null && (
        <Lightbox
          reference={reference}
          photos={photos}
          index={open}
          label={label}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

/**
 * The full-size view.
 *
 * Escape closes and the arrow keys move, because someone comparing the front
 * and back of a note should not have to go back to the mouse for it.
 */
function Lightbox({
  reference,
  photos,
  index,
  label,
  onIndex,
  onClose,
}: {
  reference: string;
  photos: OrderItemPhoto[];
  index: number;
  label: string;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const step = useCallback(
    (delta: number) => onIndex((index + delta + photos.length) % photos.length),
    [index, onIndex, photos.length]
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') step(1);
      if (event.key === 'ArrowLeft') step(-1);
    };
    document.addEventListener('keydown', onKey);
    // The page behind must not scroll while the overlay is up.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose, step]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Photo of ${label}`}
      onClick={onClose}
      className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center p-4 sm:p-8"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close photo"
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors"
      >
        <Icon name="XMarkIcon" size={20} />
      </button>

      {photos.length > 1 && (
        <>
          <Arrow direction="left" onClick={() => step(-1)} />
          <Arrow direction="right" onClick={() => step(1)} />
        </>
      )}

      <figure
        onClick={(event) => event.stopPropagation()}
        className="max-w-full max-h-full flex flex-col items-center gap-3"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoSrc(reference, photos[index].id)}
          alt={`${label} — photo ${index + 1}`}
          className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
        />
        <figcaption className="text-xs text-white/80 text-center">
          {label}
          {photos.length > 1 && ` · ${index + 1} of ${photos.length}`}
        </figcaption>
      </figure>
    </div>
  );
}

function Arrow({ direction, onClick }: { direction: 'left' | 'right'; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={direction === 'left' ? 'Previous photo' : 'Next photo'}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`absolute top-1/2 -translate-y-1/2 ${
        direction === 'left' ? 'left-3' : 'right-3'
      } w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors`}
    >
      <Icon name={direction === 'left' ? 'ChevronLeftIcon' : 'ChevronRightIcon'} size={20} />
    </button>
  );
}
