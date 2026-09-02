'use client';

import React, { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import NotePhotos from '@/components/NotePhotos';
import {
  PHOTO_ACCEPT,
  PHOTO_MAX_PER_ITEM,
  type OrderItemPhoto,
} from '@/lib/order-photo-types';

/**
 * Photographs of one note, as the admin manages them.
 *
 * The same thumbnails the customer sees, plus the two things only the admin
 * needs: adding a picture and removing one. Uploading is its own request
 * rather than part of saving the note — the admin photographs a note when they
 * have it in hand, which is not always the moment they price it, and a failed
 * upload must never take the price down with it.
 *
 * The list comes back from the server on every change and is held here, so the
 * strip updates immediately; `router.refresh()` then brings the rest of the
 * page (and the customer-facing copy of the same photos) back in line.
 */
export default function ItemPhotos({
  reference,
  itemId,
  label,
  photos: initial,
  locked,
}: {
  reference: string;
  itemId: number;
  label: string;
  photos: OrderItemPhoto[];
  /** Paid or shipped: the record is closed, so the pictures are too. */
  locked: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [photos, setPhotos] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);

  const base = `/api/admin/orders/${reference}/items/${itemId}/photos`;

  const run = async (request: () => Promise<Response>) => {
    setError('');
    setBusy(true);
    try {
      const response = await request();
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'That did not work.');
      setPhotos(payload.photos ?? []);
      startTransition(() => router.refresh());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    // One at a time, in the order they were picked, so the numbering the
    // customer sees matches the order they were taken in.
    for (const file of Array.from(files)) {
      const body = new FormData();
      body.append('photo', file);
      await run(() => fetch(base, { method: 'POST', body }));
    }
    if (input.current) input.current.value = '';
  };

  const full = photos.length >= PHOTO_MAX_PER_ITEM;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Photos of this note
      </span>

      <div className="flex flex-wrap items-center gap-2">
        {photos.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {photos.map((photo) => (
              <div key={photo.id} className="relative">
                <NotePhotos reference={reference} photos={[photo]} label={label} size={56} />
                {!locked && (
                  <button
                    type="button"
                    disabled={busy}
                    aria-label="Remove this photo"
                    title="Remove this photo"
                    onClick={() =>
                      run(() => fetch(`${base}/${photo.id}`, { method: 'DELETE' }))
                    }
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center shadow hover:bg-red-700 transition-colors disabled:opacity-40"
                  >
                    <Icon name="XMarkIcon" size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {!locked && !full && (
          <>
            <input
              ref={input}
              type="file"
              accept={PHOTO_ACCEPT}
              multiple
              className="hidden"
              onChange={(event) => upload(event.target.files)}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => input.current?.click()}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary transition-colors disabled:opacity-40"
            >
              <Icon name="PhotoIcon" size={14} />
              {busy ? 'Uploading…' : photos.length ? 'Add another' : 'Add a photo'}
            </button>
          </>
        )}
      </div>

      {photos.length === 0 && locked && (
        <p className="text-xs text-muted-foreground">No photos were added to this note.</p>
      )}
      {full && !locked && (
        <p className="text-[11px] text-muted-foreground">
          {PHOTO_MAX_PER_ITEM} photos is the limit — remove one to add another.
        </p>
      )}

      {error && (
        <p role="alert" className="flex items-start gap-2 text-xs text-red-600">
          <Icon name="ExclamationTriangleIcon" size={14} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
