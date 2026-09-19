'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import FormAlert from '@/components/auth/FormAlert';
import type { GalleryPhoto } from '@/lib/content-types';
import { PHOTO_ACCEPT, PHOTO_MAX_BYTES } from '@/lib/order-photo-types';

/**
 * Upload, caption, hide and remove gallery photos. Several files can be
 * picked at once; each is stored as media and then added as a published
 * photo, so a finished gift box goes live in one step.
 */
export default function GalleryManager({ photos }: { photos: GalleryPhoto[] }) {
  const router = useRouter();
  const [failure, setFailure] = useState('');
  const [progress, setProgress] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [captions, setCaptions] = useState<Record<number, string>>({});

  const maxMb = Math.round(PHOTO_MAX_BYTES / (1024 * 1024));

  const uploadAll = async (files: File[]) => {
    setFailure('');
    const problems: string[] = [];
    for (const [i, file] of files.entries()) {
      setProgress(`Uploading ${i + 1} of ${files.length}…`);
      if (file.size > PHOTO_MAX_BYTES) {
        problems.push(`${file.name}: images must be under ${maxMb}MB.`);
        continue;
      }
      try {
        const body = new FormData();
        body.append('file', file);
        const media = await fetch('/api/admin/media', { method: 'POST', body });
        const uploaded = await media.json().catch(() => ({}));
        if (!media.ok) {
          problems.push(`${file.name}: ${uploaded.error || 'upload failed.'}`);
          continue;
        }
        const saved = await fetch('/api/admin/gallery', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageUrl: uploaded.url, caption: null, status: 'published' }),
        });
        if (!saved.ok) {
          const result = await saved.json().catch(() => ({}));
          problems.push(`${file.name}: ${result.error || 'could not be added.'}`);
        }
      } catch {
        problems.push(`${file.name}: we could not reach the server.`);
      }
    }
    setProgress('');
    if (problems.length) setFailure(problems.join(' '));
    router.refresh();
  };

  const update = async (photo: GalleryPhoto, patch: Partial<GalleryPhoto>) => {
    setFailure('');
    setBusyId(photo.id);
    try {
      const next = { ...photo, ...patch };
      const response = await fetch(`/api/admin/gallery/${photo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: next.imageUrl,
          caption: next.caption?.trim() || null,
          status: next.status,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFailure(
          result.error || Object.values(result.errors ?? {})[0] || 'Something went wrong.'
        );
        return;
      }
      router.refresh();
    } catch {
      setFailure('We could not reach the server. Try again.');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (photo: GalleryPhoto) => {
    if (!window.confirm('Delete this photo from the gallery? This cannot be undone.')) return;
    setFailure('');
    setBusyId(photo.id);
    try {
      const response = await fetch(`/api/admin/gallery/${photo.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        setFailure(result.error || 'Something went wrong.');
        return;
      }
      router.refresh();
    } catch {
      setFailure('We could not reach the server. Try again.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      {failure && <FormAlert tone="error">{failure}</FormAlert>}

      <section className="card-warm p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-sans font-bold text-foreground text-sm uppercase tracking-wide">
            Add photos
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            JPEG, PNG or WebP, under {maxMb}MB each. You can pick several at once.
          </p>
        </div>
        <label
          className={`inline-flex items-center px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors cursor-pointer ${progress ? 'opacity-60 pointer-events-none' : ''}`}
        >
          {progress || 'Upload photos'}
          <input
            type="file"
            accept={PHOTO_ACCEPT}
            multiple
            className="sr-only"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = '';
              if (files.length) uploadAll(files);
            }}
          />
        </label>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-sans font-bold text-foreground text-sm uppercase tracking-wide">
          Photos ({photos.length})
        </h2>

        {photos.length === 0 && (
          <p className="card-warm p-6 text-sm text-muted-foreground">
            None yet. The home page hides the gallery until one is published.
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {photos.map((photo) => {
            const caption = captions[photo.id] ?? photo.caption ?? '';
            const dirty = caption.trim() !== (photo.caption ?? '');
            const busy = busyId === photo.id;
            return (
              <div key={photo.id} className="card-warm p-3 flex flex-col gap-3">
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.imageUrl}
                    alt={photo.caption ?? ''}
                    loading="lazy"
                    className={`w-full aspect-square object-cover rounded-xl ${photo.status === 'draft' ? 'opacity-50' : ''}`}
                  />
                  <span
                    className={`absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wide font-semibold ${
                      photo.status === 'published'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-secondary text-muted-foreground'
                    }`}
                  >
                    {photo.status === 'published' ? 'Live' : 'Hidden'}
                  </span>
                </div>
                <input
                  aria-label="Caption"
                  placeholder="Caption (optional)"
                  maxLength={200}
                  value={caption}
                  onChange={(event) =>
                    setCaptions((prev) => ({ ...prev, [photo.id]: event.target.value }))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <div className="flex flex-wrap gap-2">
                  {dirty && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => update(photo, { caption })}
                      className="px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
                    >
                      Save caption
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      update(photo, {
                        status: photo.status === 'published' ? 'draft' : 'published',
                      })
                    }
                    className="px-3 py-2 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                  >
                    {photo.status === 'published' ? 'Hide' : 'Publish'}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => remove(photo)}
                    className="px-3 py-2 rounded-lg border border-red-200 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
