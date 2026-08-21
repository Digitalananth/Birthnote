import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import AdminNav from '@/app/admin/components/AdminNav';
import ContentEditor from '@/app/admin/components/ContentEditor';
import Icon from '@/components/ui/AppIcon';
import { requireAdmin } from '@/lib/auth';
import { getPageById } from '@/lib/content';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Edit page — BirthNote admin',
  robots: { index: false, follow: false },
};

/**
 * Serves both "create" and "edit": /admin/pages/new is the same screen with
 * nothing loaded, so the editor has one code path rather than two.
 */
export default async function AdminPageEditor({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin('/admin/pages');
  const { id } = await params;

  const creating = id === 'new';
  const page = creating ? null : await getPageById(Number.parseInt(id, 10));
  if (!creating && !page) notFound();

  return (
    <main className="min-h-screen bg-secondary/20 px-4 md:px-10 py-10">
      <div className="max-w-3xl mx-auto">
        <AdminNav admin={admin} />

        <Link
          href="/admin/pages"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <Icon name="ArrowLeftIcon" size={12} />
          All pages
        </Link>

        <h1 className="font-sans font-extrabold text-2xl text-foreground mb-8">
          {creating ? 'New page' : page!.title}
        </h1>

        <ContentEditor kind="page" record={page} />
      </div>
    </main>
  );
}
