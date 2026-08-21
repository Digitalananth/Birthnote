import React from 'react';
import Link from 'next/link';
import type { BlogPost } from '@/lib/content-types';

/** Formats a publish date. Server-rendered, so the timezone is pinned. */
export function formatPublished(iso: string | null): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(iso));
}

export default function PostCard({ post }: { post: BlogPost }) {
  return (
    <article className="card-warm p-6 md:p-8">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        {post.categoryName && post.categorySlug && (
          <Link
            href={`/blog/category/${post.categorySlug}`}
            className="px-3 py-1 rounded-full bg-accent/15 border border-accent/25 text-xs font-semibold text-accent-foreground hover:bg-accent/25 transition-colors"
          >
            {post.categoryName}
          </Link>
        )}
        {post.publishedAt && (
          <time dateTime={post.publishedAt} className="text-xs text-muted-foreground">
            {formatPublished(post.publishedAt)}
          </time>
        )}
      </div>

      <h2 className="font-sans font-extrabold text-xl text-foreground mb-2 leading-snug">
        <Link href={`/blog/${post.slug}`} className="hover:text-primary transition-colors">
          {post.title}
        </Link>
      </h2>

      {post.excerpt && (
        <p className="text-[15px] text-muted-foreground leading-relaxed">{post.excerpt}</p>
      )}
    </article>
  );
}
