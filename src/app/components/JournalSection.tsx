import React from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import { listPublishedPosts } from '@/lib/content';
import { formatPublished } from '@/components/PostCard';

/**
 * The three most recent posts, teased on the landing page.
 *
 * Renders nothing at all when the journal is empty, so the home page never
 * shows an "articles" heading with a blank space under it. The DB read runs
 * inside the page's ISR window rather than per request; publishing a post
 * revalidates `/` from the admin API, so a new post appears immediately.
 */
export default async function JournalSection() {
  let posts;
  try {
    posts = (await listPublishedPosts()).slice(0, 3);
  } catch (error) {
    // The journal is a nice-to-have here; a database hiccup must not take the
    // landing page down with it.
    console.error('[home] could not load journal posts', error);
    return null;
  }

  if (posts.length === 0) return null;

  return (
    <section id="journal" className="bg-secondary/30 py-20 md:py-28">
      <div className="max-w-7xl mx-auto px-6 md:px-12">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-12">
          <div>
            <span className="text-xs uppercase tracking-widest text-accent font-semibold block mb-4">
              From the journal
            </span>
            <h2
              className="font-sans font-extrabold text-foreground"
              style={{ fontSize: 'clamp(2rem, 5vw, 3.25rem)', lineHeight: 0.95, letterSpacing: '-0.03em' }}
            >
              Notes on the notes
            </h2>
          </div>
          <Link
            href="/blog"
            className="group inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-accent-foreground transition-colors whitespace-nowrap"
          >
            Read the journal
            <Icon name="ArrowRightIcon" size={14} className="group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {posts.map((post) => (
            <article key={post.id} className="card-warm p-6 md:p-7 flex flex-col">
              <div className="flex flex-wrap items-center gap-3 mb-3">
                {post.categoryName && (
                  <span className="px-3 py-1 rounded-full bg-accent/15 border border-accent/25 text-xs font-semibold text-accent-foreground">
                    {post.categoryName}
                  </span>
                )}
                {post.publishedAt && (
                  <time dateTime={post.publishedAt} className="text-xs text-muted-foreground">
                    {formatPublished(post.publishedAt)}
                  </time>
                )}
              </div>

              <h3 className="font-sans font-extrabold text-lg text-foreground mb-2 leading-snug">
                <Link href={`/blog/${post.slug}`} className="hover:text-primary transition-colors">
                  {post.title}
                </Link>
              </h3>

              {post.excerpt && (
                <p className="text-[15px] text-muted-foreground leading-relaxed line-clamp-4">
                  {post.excerpt}
                </p>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
