import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import AdminNav from '@/app/admin/components/AdminNav';
import Icon from '@/components/ui/AppIcon';
import { requireAdmin } from '@/lib/auth';
import { listPages } from '@/lib/content';
import { formatDateTime } from '@/lib/order-status';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Pages — My Lucky Dates admin',
  robots: { index: false, follow: false },
};

export default async function AdminPagesPage() {
  const admin = await requireAdmin('/admin/pages');
  const pages = await listPages();

  return (
    <main className="min-h-screen bg-secondary/20 px-4 md:px-10 py-10">
      <div className="max-w-4xl mx-auto">
        <AdminNav admin={admin} current="pages" />

        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div>
            <p className="text-xs uppercase tracking-widest text-primary font-bold mb-1">
              My Lucky Dates
            </p>
            <h1 className="font-sans font-extrabold text-2xl md:text-3xl text-foreground">Pages</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Standalone pages, each published at its own address.
            </p>
          </div>
          <Link
            href="/admin/pages/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            New page
          </Link>
        </div>

        {pages.length === 0 ? (
          <p className="card-warm p-8 text-sm text-muted-foreground">
            No pages yet. Create one and it appears at its slug straight away.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {pages.map((page) => (
              <li key={page.id}>
                <Link
                  href={`/admin/pages/${page.id}`}
                  className="card-warm p-5 flex flex-wrap items-center gap-4 hover:border-accent/40 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground text-sm">{page.title}</p>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">/{page.slug}</p>
                  </div>
                  <div className="text-right">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        page.status === 'published'
                          ? 'bg-green-50 text-green-700'
                          : 'bg-secondary text-muted-foreground'
                      }`}
                    >
                      {page.status}
                    </span>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDateTime(page.updatedAt)}
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
