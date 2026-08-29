import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import AdminNav from '@/app/admin/components/AdminNav';
import ContentEditor from '@/app/admin/components/ContentEditor';
import Icon from '@/components/ui/AppIcon';
import { requireAdmin } from '@/lib/auth';
import { getPostById, listCategories } from '@/lib/content';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Edit post — BirthNote admin',
  robots: { index: false, follow: false },
};

/** Serves both "create" and "edit" — see /admin/pages/[id]. */
export default async function AdminPostEditor({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin('/admin/blog');
  const { id } = await params;

  const creating = id === 'new';
  const [post, categories] = await Promise.all([
    creating ? Promise.resolve(null) : getPostById(Number.parseInt(id, 10)),
    listCategories(),
  ]);
  if (!creating && !post) notFound();

  return (
    <main className="min-h-screen bg-secondary/20 px-4 md:px-10 py-10">
      <div className="max-w-3xl mx-auto">
        <AdminNav admin={admin} current="blog" />

        <Link
          href="/admin/blog"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <Icon name="ArrowLeftIcon" size={12} />
          All posts
        </Link>

        <h1 className="font-sans font-extrabold text-2xl text-foreground mb-8">
          {creating ? 'New post' : post!.title}
        </h1>

        <ContentEditor kind="post" record={post} categories={categories} />
      </div>
    </main>
  );
}
