'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import FormAlert from '@/components/auth/FormAlert';
import {
  validateCategory,
  slugify,
  type BlogCategory,
  type ContentErrors,
} from '@/lib/content-types';

const BLANK = { name: '', slug: '', description: '', metaTitle: '', metaDescription: '' };

/**
 * Add, rename and remove blog categories.
 *
 * Editing happens in place rather than on a separate screen: a category is
 * five short fields, and a whole page per record would be more navigation
 * than content.
 */
export default function CategoriesManager({ categories }: { categories: BlogCategory[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(BLANK);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editing, setEditing] = useState(BLANK);
  const [errors, setErrors] = useState<ContentErrors>({});
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);

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

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    const body = { ...creating, slug: creating.slug.trim() || slugify(creating.name) };
    const check = validateCategory(body);
    setErrors(check.errors);
    if (!check.valid) return;
    if (await send('/api/admin/categories', 'POST', body)) setCreating(BLANK);
  };

  const save = async (id: number) => {
    const body = { ...editing, slug: editing.slug.trim() || slugify(editing.name) };
    const check = validateCategory(body);
    setErrors(check.errors);
    if (!check.valid) return;
    if (await send(`/api/admin/categories/${id}`, 'PATCH', body)) setEditingId(null);
  };

  const remove = async (id: number) => {
    await send(`/api/admin/categories/${id}`, 'DELETE');
  };

  const fields = (values: typeof BLANK, set: (patch: Partial<typeof BLANK>) => void) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
          aria-label="Slug"
          placeholder={`Slug — /blog/category/${slugify(values.name) || '…'}`}
          value={values.slug}
          onChange={(event) => set({ slug: event.target.value })}
          className={input}
        />
        {errors.slug && <p className="text-xs text-red-500 mt-1">{errors.slug}</p>}
      </div>
      <div className="sm:col-span-2">
        <input
          aria-label="Description"
          placeholder="Description — shown at the top of the category page"
          value={values.description}
          onChange={(event) => set({ description: event.target.value })}
          className={input}
        />
      </div>
      <input
        aria-label="Meta title"
        placeholder="Meta title (optional)"
        value={values.metaTitle}
        onChange={(event) => set({ metaTitle: event.target.value })}
        className={input}
      />
      <input
        aria-label="Meta description"
        placeholder="Meta description (optional)"
        value={values.metaDescription}
        onChange={(event) => set({ metaDescription: event.target.value })}
        className={input}
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-8">
      {failure && <FormAlert tone="error">{failure}</FormAlert>}

      <section className="card-warm p-6">
        <h2 className="font-sans font-bold text-foreground text-sm uppercase tracking-wide mb-4">
          Add a category
        </h2>
        <form onSubmit={create} className="flex flex-col gap-3">
          {fields(creating, (patch) => setCreating((p) => ({ ...p, ...patch })))}
          <button
            type="submit"
            disabled={busy}
            className="self-start px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {busy ? 'Saving…' : 'Add category'}
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-sans font-bold text-foreground text-sm uppercase tracking-wide">
          Categories ({categories.length})
        </h2>

        {categories.length === 0 && (
          <p className="card-warm p-6 text-sm text-muted-foreground">
            None yet. Posts can be published without one.
          </p>
        )}

        {categories.map((category) =>
          editingId === category.id ? (
            <div key={category.id} className="card-warm p-5 flex flex-col gap-3">
              {fields(editing, (patch) => setEditing((p) => ({ ...p, ...patch })))}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => save(category.id)}
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
            <div key={category.id} className="card-warm p-5 flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground text-sm">{category.name}</p>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">
                  /blog/category/{category.slug}
                </p>
                {category.description && (
                  <p className="text-xs text-muted-foreground mt-1">{category.description}</p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setErrors({});
                    setEditingId(category.id);
                    setEditing({
                      name: category.name,
                      slug: category.slug,
                      description: category.description ?? '',
                      metaTitle: category.metaTitle ?? '',
                      metaDescription: category.metaDescription ?? '',
                    });
                  }}
                  className="px-3 py-2 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                >
                  Edit
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => remove(category.id)}
                  title="Posts filed here keep their writing and lose the label."
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
