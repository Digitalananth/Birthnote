'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import FormAlert from '@/components/auth/FormAlert';
import {
  validatePage,
  validatePost,
  slugify,
  CONTENT_STATUSES,
  type BlogCategory,
  type BlogPost,
  type ContentErrors,
  type ContentStatus,
  type Page,
} from '@/lib/content-types';

type Kind = 'page' | 'post';

/**
 * The editor for a page or a blog post.
 *
 * One component for both because they differ by three fields, and two
 * near-identical editors is two places to fix every future bug in either.
 */
export default function ContentEditor({
  kind,
  record,
  categories = [],
}: {
  kind: Kind;
  /** Null when creating. */
  record: Page | BlogPost | null;
  categories?: BlogCategory[];
}) {
  const router = useRouter();
  const isPost = kind === 'post';
  const post = isPost ? (record as BlogPost | null) : null;

  const [values, setValues] = useState({
    title: record?.title ?? '',
    slug: record?.slug ?? '',
    bodyMarkdown: record?.bodyMarkdown ?? '',
    metaTitle: record?.metaTitle ?? '',
    metaDescription: record?.metaDescription ?? '',
    status: (record?.status ?? 'draft') as ContentStatus,
    excerpt: post?.excerpt ?? '',
    categoryId: post?.categoryId ? String(post.categoryId) : '',
    coverImageUrl: post?.coverImageUrl ?? '',
  });
  const [errors, setErrors] = useState<ContentErrors>({});
  const [failure, setFailure] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  /** Only true until the author edits the slug themselves. */
  const [slugTracksTitle, setSlugTracksTitle] = useState(!record);

  const base = isPost ? '/api/admin/posts' : '/api/admin/pages';
  const listPath = isPost ? '/admin/blog' : '/admin/pages';
  const publicPath = isPost ? `/blog/${values.slug}` : `/${values.slug}`;

  const payload = () => ({
    title: values.title.trim(),
    slug: values.slug.trim(),
    bodyMarkdown: values.bodyMarkdown,
    metaTitle: values.metaTitle.trim() || null,
    metaDescription: values.metaDescription.trim() || null,
    status: values.status,
    ...(isPost
      ? {
          excerpt: values.excerpt.trim() || null,
          categoryId: values.categoryId ? Number.parseInt(values.categoryId, 10) : null,
          coverImageUrl: values.coverImageUrl.trim() || null,
        }
      : {}),
  });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFailure('');
    setNotice('');

    const body = payload();
    // Same rules the API enforces — this copy only makes the feedback instant.
    const check = isPost ? validatePost(body) : validatePage(body);
    setErrors(check.errors);
    if (!check.valid) return;

    setBusy(true);
    try {
      const response = await fetch(record ? `${base}/${record.id}` : base, {
        method: record ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({}));

      if (result.errors) {
        setErrors(result.errors);
        return;
      }
      if (!response.ok) {
        setFailure(result.error || 'Something went wrong. Please try again.');
        return;
      }

      if (record) {
        setNotice('Saved. The live page has been refreshed.');
        router.refresh();
      } else {
        const created = result.page ?? result.post;
        router.replace(`${listPath}/${created.id}`);
        router.refresh();
      }
    } catch {
      setFailure('We could not reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!record) return;
    setFailure('');
    setBusy(true);
    try {
      const response = await fetch(`${base}/${record.id}`, { method: 'DELETE' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFailure(result.error || 'We could not delete that.');
        return;
      }
      router.replace(listPath);
      router.refresh();
    } catch {
      setFailure('We could not reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const input =
    'w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30';

  const label = (text: string, hint?: string) => (
    <span className="flex flex-col gap-0.5 mb-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {text}
      </span>
      {hint && <span className="text-xs text-muted-foreground/70 normal-case">{hint}</span>}
    </span>
  );

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="card-warm p-6 flex flex-col gap-5">
        <label className="block">
          {label('Title')}
          <input
            value={values.title}
            onChange={(event) => {
              const title = event.target.value;
              setValues((prev) => ({
                ...prev,
                title,
                // The slug follows the title until someone edits it by hand;
                // after that it stays put, because changing a published URL
                // because of a typo fix breaks every link to it.
                slug: slugTracksTitle ? slugify(title) : prev.slug,
              }));
            }}
            className={input}
          />
          {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title}</p>}
        </label>

        <label className="block">
          {label('Slug', isPost ? `/blog/${values.slug || '…'}` : `/${values.slug || '…'}`)}
          <input
            value={values.slug}
            onChange={(event) => {
              setSlugTracksTitle(false);
              setValues((prev) => ({ ...prev, slug: event.target.value }));
            }}
            className={input}
          />
          {errors.slug && <p className="text-xs text-red-500 mt-1">{errors.slug}</p>}
        </label>

        {isPost && (
          <>
            <label className="block">
              {label('Excerpt', 'Shown on the blog index and used as the meta description')}
              <textarea
                rows={2}
                value={values.excerpt}
                onChange={(event) => setValues((p) => ({ ...p, excerpt: event.target.value }))}
                className={`${input} resize-y`}
              />
              {errors.excerpt && <p className="text-xs text-red-500 mt-1">{errors.excerpt}</p>}
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <label className="block">
                {label('Category')}
                <select
                  value={values.categoryId}
                  onChange={(event) => setValues((p) => ({ ...p, categoryId: event.target.value }))}
                  className={input}
                >
                  <option value="">No category</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                {label('Cover image URL', 'Used for social previews')}
                <input
                  value={values.coverImageUrl}
                  onChange={(event) =>
                    setValues((p) => ({ ...p, coverImageUrl: event.target.value }))
                  }
                  className={input}
                />
                {errors.coverImageUrl && (
                  <p className="text-xs text-red-500 mt-1">{errors.coverImageUrl}</p>
                )}
              </label>
            </div>
          </>
        )}

        <label className="block">
          {label('Body', 'Markdown. Raw HTML is escaped, not rendered.')}
          <textarea
            rows={18}
            value={values.bodyMarkdown}
            onChange={(event) => setValues((p) => ({ ...p, bodyMarkdown: event.target.value }))}
            className={`${input} font-mono resize-y leading-relaxed`}
          />
          {errors.bodyMarkdown && (
            <p className="text-xs text-red-500 mt-1">{errors.bodyMarkdown}</p>
          )}
        </label>
      </div>

      <div className="card-warm p-6 flex flex-col gap-5">
        <h2 className="font-sans font-bold text-foreground text-sm uppercase tracking-wide">
          Search engines
        </h2>

        <label className="block">
          {label('Meta title', 'Falls back to the title above when blank')}
          <input
            value={values.metaTitle}
            onChange={(event) => setValues((p) => ({ ...p, metaTitle: event.target.value }))}
            className={input}
          />
          {errors.metaTitle && <p className="text-xs text-red-500 mt-1">{errors.metaTitle}</p>}
        </label>

        <label className="block">
          {label(
            'Meta description',
            `${values.metaDescription.length}/320 — around 155 characters is what Google shows`
          )}
          <textarea
            rows={3}
            value={values.metaDescription}
            onChange={(event) => setValues((p) => ({ ...p, metaDescription: event.target.value }))}
            className={`${input} resize-y`}
          />
          {errors.metaDescription && (
            <p className="text-xs text-red-500 mt-1">{errors.metaDescription}</p>
          )}
        </label>
      </div>

      {failure && <FormAlert tone="error">{failure}</FormAlert>}
      {notice && <FormAlert tone="success">{notice}</FormAlert>}

      <div className="card-warm p-6 flex flex-wrap items-center gap-3">
        <select
          aria-label="Status"
          value={values.status}
          onChange={(event) =>
            setValues((p) => ({ ...p, status: event.target.value as ContentStatus }))
          }
          className={`${input} w-auto`}
        >
          {CONTENT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>

        <button
          type="submit"
          disabled={busy}
          className="px-5 py-2.5 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          {busy ? 'Saving…' : record ? 'Save changes' : 'Create'}
        </button>

        {record && record.status === 'published' && (
          <Link
            href={publicPath}
            target="_blank"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
          >
            View live
            <Icon name="ArrowRightIcon" size={12} />
          </Link>
        )}

        <span className="flex-1" />

        {record && (
          <button
            type="button"
            disabled={busy}
            onClick={handleDelete}
            className="px-4 py-2.5 rounded-xl border border-red-200 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
