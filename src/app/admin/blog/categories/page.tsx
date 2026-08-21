import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import AdminNav from '@/app/admin/components/AdminNav';
import CategoriesManager from '@/app/admin/components/CategoriesManager';
import Icon from '@/components/ui/AppIcon';
import { requireAdmin } from '@/lib/auth';
import { listCategories } from '@/lib/content';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Blog categories — BirthNote admin',
  robots: { index: false, follow: false },
};

export default async function AdminCategoriesPage() {
  const admin = await requireAdmin('/admin/blog/categories');
  const categories = await listCategories();

  return (
    <main className="min-h-screen bg-secondary/20 px-4 md:px-10 py-10">
      <div className="max-w-3xl mx-auto">
        <AdminNav admin={admin} />

        <Link
          href="/admin/blog"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <Icon name="ArrowLeftIcon" size={12} />
          All posts
        </Link>

        <h1 className="font-sans font-extrabold text-2xl text-foreground mb-2">Categories</h1>
        <p className="text-sm text-muted-foreground mb-8">
          Deleting a category keeps its posts — they simply lose the label.
        </p>

        <CategoriesManager categories={categories} />
      </div>
    </main>
  );
}
