import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import AdminNav from '@/app/admin/components/AdminNav';
import GalleryManager from '@/app/admin/components/GalleryManager';
import { requireAdmin } from '@/lib/auth';
import { listGalleryPhotos } from '@/lib/gallery';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Gallery — My Lucky Dates admin',
  robots: { index: false, follow: false },
};

export default async function AdminGalleryPage() {
  const admin = await requireAdmin('/admin/gallery');
  const photos = await listGalleryPhotos();

  return (
    <main className="min-h-screen bg-secondary/20 px-4 md:px-10 py-10">
      <div className="max-w-5xl mx-auto">
        <AdminNav admin={admin} current="gallery" />

        <h1 className="font-sans font-extrabold text-2xl text-foreground mb-2">Gallery</h1>
        <p className="text-sm text-muted-foreground mb-8">
          Upload photos of finished gift boxes. Published photos appear in the home page gallery
          (latest six) and on the full{' '}
          <Link href="/gallery" className="underline">
            /gallery
          </Link>{' '}
          page, newest first. Hide a photo to take it down without deleting it.
        </p>

        <GalleryManager photos={photos} />
      </div>
    </main>
  );
}
