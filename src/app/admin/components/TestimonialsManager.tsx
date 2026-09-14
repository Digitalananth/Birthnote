'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import FormAlert from '@/components/auth/FormAlert';
import {
  validateTestimonial,
  type ContentStatus,
  type Testimonial,
  type TestimonialErrors,
} from '@/lib/content-types';
import { PHOTO_ACCEPT, PHOTO_MAX_BYTES } from '@/lib/order-photo-types';

type Values = {
  quote: string;
  name: string;
  role: string;
  location: string;
  imageUrl: string;
  dateLabel: string;
  sortOrder: string;
  status: ContentStatus;
};

const BLANK: Values = {
  quote: '',
  name: '',
  role: '',
  location: '',
  imageUrl: '',
  dateLabel: '',
  sortOrder: '',
  status: 'published',
};

function toValues(t: Testimonial): Values {
  return {
    quote: t.quote,
    name: t.name,
    role: t.role ?? '',
    location: t.location ?? '',
    imageUrl: t.imageUrl ?? '',
    dateLabel: t.dateLabel ?? '',
    sortOrder: String(t.sortOrder),
    status: t.status,
  };
}

function toPayload(v: Values) {
  const order = v.sortOrder.trim();
  return {
    quote: v.quote.trim(),
    name: v.name.trim(),
    role: v.role.trim() || null,
    location: v.location.trim() || null,
    imageUrl: v.imageUrl.trim() || null,
    dateLabel: v.dateLabel.trim() || null,
    sortOrder: order === '' ? 0 : Number(order),
    status: v.status,
  };
}

/**
 * Add, edit, hide and remove the home page's customer stories. Edited in
 * place like CategoriesManager — a story is a handful of short fields.
 */
export default function TestimonialsManager({ testimonials }: { testimonials: Testimonial[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState<Values>(BLANK);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Values>(BLANK);
  const [errors, setErrors] = useState<TestimonialErrors>({});
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const input =
    'w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30';

  const send = async (url: string, method: string, body?: unknown) => {
    setFailure('');
    setErrors({});
    setBusy(true);
    try {
      const response = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const result = await response.json().catch(() => ({}));
      if (result.errors) {
        setErrors(result.errors);
        return false;
      }
      if (!response.ok) {
        setFailure(result.error || 'Something went wrong.');
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setFailure('We could not reach the server. Try again.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submit = async (values: Values, url: string, method: string) => {
    const body = toPayload(values);
    const check = validateTestimonial(body);
    setErrors(check.errors);
    if (!check.valid) return false;
    return send(url, method, body);
  };

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (await submit(creating, '/api/admin/testimonials', 'POST')) setCreating(BLANK);
  };

  const save = async (id: number) => {
    if (await submit(editing, `/api/admin/testimonials/${id}`, 'PATCH')) setEditingId(null);
  };

  const remove = async (t: Testimonial) => {
    if (!window.confirm(`Delete the story from ${t.name}? This cannot be undone.`)) return;
    await send(`/api/admin/testimonials/${t.id}`, 'DELETE');
  };

  const upload = async (file: File, set: (patch: Partial<Values>) => void) => {
    setErrors((prev) => ({ ...prev, imageUrl: undefined }));
    if (file.size > PHOTO_MAX_BYTES) {
      setErrors((prev) => ({
        ...prev,
        imageUrl: `Images must be under ${Math.round(PHOTO_MAX_BYTES / (1024 * 1024))}MB.`,
      }));
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch('/api/admin/media', { method: 'POST', body });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrors((prev) => ({ ...prev, imageUrl: result.error || 'We could not upload that image.' }));
        return;
      }
      set({ imageUrl: result.url });
    } catch {
      setErrors((prev) => ({ ...prev, imageUrl: 'We could not reach the server. Try again.' }));
    } finally {
      setUploading(false);
    }
  };

  const fields = (values: Values, set: (patch: Partial<Values>) => void) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="sm:col-span-2">
        <textarea
          aria-label="Quote"
          placeholder="What they said"
          rows={4}
          value={values.quote}
          onChange={(event) => set({ quote: event.target.value })}
          className={input}
        />
        {errors.quote && <p className="text-xs text-red-500 mt-1">{errors.quote}</p>}
      </div>
      <div>
        <input
          aria-label="Name"
          placeholder="Name"
          value={values.name}
          onChange={(event) => set({ name: event.target.value })}
          className={input}
        />
        {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
      </div>
      <div>
        <input
          aria-label="Location"
          placeholder="Location (optional)"
          value={values.location}
          onChange={(event) => set({ location: event.target.value })}
          className={input}
        />
        {errors.location && <p className="text-xs text-red-500 mt-1">{errors.location}</p>}
      </div>
      <div className="sm:col-span-2">
        <input
          aria-label="Role"
          placeholder="Who they are — e.g. “Son, gave for his mother's 60th birthday” (optional)"
          value={values.role}
          onChange={(event) => set({ role: event.target.value })}
          className={input}
        />
        {errors.role && <p className="text-xs text-red-500 mt-1">{errors.role}</p>}
      </div>
      <div>
        <input
          aria-label="Date on the note"
          placeholder="Date badge — e.g. 14/03/65 (optional)"
          value={values.dateLabel}
          onChange={(event) => set({ dateLabel: event.target.value })}
          className={input}
        />
        {errors.dateLabel && <p className="text-xs text-red-500 mt-1">{errors.dateLabel}</p>}
      </div>
      <div className="flex gap-3">
        <input
          aria-label="Order"
          placeholder="Order"
          inputMode="numeric"
          value={values.sortOrder}
          onChange={(event) => set({ sortOrder: event.target.value })}
          className={`${input} w-24`}
        />
        <select
          aria-label="Status"
          value={values.status}
          onChange={(event) => set({ status: event.target.value as ContentStatus })}
          className={input}
        >
          <option value="published">Published</option>
          <option value="draft">Draft (hidden)</option>
        </select>
      </div>
      {errors.sortOrder && <p className="text-xs text-red-500 sm:col-span-2">{errors.sortOrder}</p>}
      <div className="sm:col-span-2">
        <div className="flex gap-2">
          <input
            aria-label="Photo URL"
            placeholder="Photo — https://… or upload (optional)"
            value={values.imageUrl}
            onChange={(event) => set({ imageUrl: event.target.value })}
            className={input}
          />
          <label
            className={`shrink-0 inline-flex items-center px-4 rounded-xl border border-border text-xs font-semibold text-foreground cursor-pointer hover:bg-secondary/50 transition-colors ${uploading ? 'opacity-60 pointer-events-none' : ''}`}
          >
            {uploading ? 'Uploading…' : 'Upload'}
            <input
              type="file"
              accept={PHOTO_ACCEPT}
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) upload(file, set);
              }}
            />
          </label>
        </div>
        {errors.imageUrl && <p className="text-xs text-red-500 mt-1">{errors.imageUrl}</p>}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-8">
      {failure && <FormAlert tone="error">{failure}</FormAlert>}

      <section className="card-warm p-6">
        <h2 className="font-sans font-bold text-foreground text-sm uppercase tracking-wide mb-4">
          Add a story
        </h2>
        <form onSubmit={create} className="flex flex-col gap-3">
          {fields(creating, (patch) => setCreating((p) => ({ ...p, ...patch })))}
          <button
            type="submit"
            disabled={busy || uploading}
            className="self-start px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {busy ? 'Saving…' : 'Add story'}
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-sans font-bold text-foreground text-sm uppercase tracking-wide">
          Stories ({testimonials.length})
        </h2>

        {testimonials.length === 0 && (
          <p className="card-warm p-6 text-sm text-muted-foreground">
            None yet. The home page hides the section until one is published.
          </p>
        )}

        {testimonials.map((t) =>
          editingId === t.id ? (
            <div key={t.id} className="card-warm p-5 flex flex-col gap-3">
              {fields(editing, (patch) => setEditing((p) => ({ ...p, ...patch })))}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy || uploading}
                  onClick={() => save(t.id)}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="px-4 py-2 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div key={t.id} className="card-warm p-5 flex flex-wrap items-start gap-4">
              {t.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.imageUrl} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground text-sm">
                  {t.name}
                  <span
                    className={`ml-2 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wide font-semibold ${
                      t.status === 'published'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-secondary text-muted-foreground'
                    }`}
                  >
                    {t.status === 'published' ? 'Live' : 'Draft'}
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground font-mono">#{t.sortOrder}</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">“{t.quote}”</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setErrors({});
                    setEditingId(t.id);
                    setEditing(toValues(t));
                  }}
                  className="px-3 py-2 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                >
                  Edit
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => remove(t)}
                  className="px-3 py-2 rounded-lg border border-red-200 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                >
                  Delete
                </button>
              </div>
            </div>
          )
        )}
      </section>
    </div>
  );
}
