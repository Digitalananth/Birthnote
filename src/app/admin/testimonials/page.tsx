import React from 'react';
import type { Metadata } from 'next';
import AdminNav from '@/app/admin/components/AdminNav';
import TestimonialsManager from '@/app/admin/components/TestimonialsManager';
import { requireAdmin } from '@/lib/auth';
import { listTestimonials } from '@/lib/testimonials';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Stories — My Lucky Dates admin',
  robots: { index: false, follow: false },
};

export default async function AdminTestimonialsPage() {
  const admin = await requireAdmin('/admin/testimonials');
  const testimonials = await listTestimonials();

  return (
    <main className="min-h-screen bg-secondary/20 px-4 md:px-10 py-10">
      <div className="max-w-3xl mx-auto">
        <AdminNav admin={admin} current="testimonials" />

        <h1 className="font-sans font-extrabold text-2xl text-foreground mb-2">Stories</h1>
        <p className="text-sm text-muted-foreground mb-8">
          Published stories appear in the “Real Stories” section of the home page, lowest order
          first. Set one to draft to hide it without deleting it. The section disappears when none
          are published.
        </p>

        <TestimonialsManager testimonials={testimonials} />
      </div>
    </main>
  );
}
