import React from 'react';
import type { Metadata } from 'next';
import ProfileForm from '@/app/account/components/ProfileForm';
import { requireUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'My profile — My Lucky Dates',
  robots: { index: false, follow: false },
};

export default async function ProfilePage() {
  const user = await requireUser('/account/profile');

  return (
    <div className="flex flex-col gap-8">
      <section className="card-warm p-8">
        <h2 className="font-sans font-bold text-foreground text-sm uppercase tracking-wide mb-6">
          My profile
        </h2>
        <ProfileForm
          user={{
            name: user.name,
            email: user.email,
            phone: user.phone,
            whatsapp: user.whatsapp,
          }}
        />
      </section>
    </div>
  );
}
