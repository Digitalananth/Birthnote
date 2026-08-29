import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import AdminNav from '@/app/admin/components/AdminNav';
import Icon from '@/components/ui/AppIcon';
import { requireAdmin } from '@/lib/auth';
import { listAllPosts } from '@/lib/content';
import { formatDateTime } from '@/lib/order-status';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Blog — BirthNote admin',
  robots: { index: false, follow: false },
};

export default async function AdminBlogPage() {
  const admin = await requireAdmin('/admin/blog');
  const posts = await listAllPosts();

  return (
    <main className="min-h-screen bg-secondary/20 px-4 md:px-10 py-10">
      <div className="max-w-4xl mx-auto">
        <AdminNav admin={admin} current="blog" />

        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div>
            <p className="text-xs uppercase tracking-widest text-primary font-bold mb-1">
              BirthNote
            </p>
            <h1 className="font-sans font-extrabold text-2xl md:text-3xl text-foreground">
              The Blog
            </h1>
          </div>
          <div className="flex gap-2">
            <Link
              href="/admin/blog/categories"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              Categories
            </Link>
            <Link
              href="/admin/blog/new"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              New post
            </Link>
          </div>
        </div>

        {posts.length === 0 ? (
          <p className="card-warm p-8 text-sm text-muted-foreground">Nothing written yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {posts.map((post) => (
              <li key={post.id}>
                <Link
                  href={`/admin/blog/${post.id}`}
                  className="card-warm p-5 flex flex-wrap items-center gap-4 hover:border-accent/40 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground text-sm">{post.title}</p>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">
                      /blog/{post.slug}
                      {post.categoryName && (
                        <span className="font-sans"> · {post.categoryName}</span>
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        post.status === 'published'
                          ? 'bg-green-50 text-green-700'
                          : 'bg-secondary text-muted-foreground'
                      }`}
                    >
                      {post.status}
                    </span>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDateTime(post.updatedAt)}
                    </p>
                  </div>
                  <Icon name="ArrowRightIcon" size={14} className="text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
