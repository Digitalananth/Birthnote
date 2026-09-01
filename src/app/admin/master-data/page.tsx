import React from 'react';
import type { Metadata } from 'next';
import AdminNav from '@/app/admin/components/AdminNav';
import MasterListEditor from '@/app/admin/master-data/components/MasterListEditor';
import { requireOwner } from '@/lib/auth';
import { listAllOptions } from '@/lib/master-options';
import { MASTER_LISTS } from '@/lib/master-option-types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Master data — My Lucky Dates admin',
  robots: { index: false, follow: false },
};

/**
 * The lists behind the request form's dropdowns.
 *
 * Owner-only: these decide what a customer can order at all. Staff run the
 * order queue, which is a different job.
 */
export default async function AdminMasterDataPage() {
  const admin = await requireOwner('/admin/master-data');
  const lists = await listAllOptions();

  return (
    <main className="min-h-screen bg-secondary/20 px-4 md:px-10 py-10">
      <div className="max-w-3xl mx-auto">
        <AdminNav admin={admin} current="master-data" />

        <div className="mb-8">
          <p className="text-xs uppercase tracking-widest text-primary font-bold mb-1">
            My Lucky Dates
          </p>
          <h1 className="font-sans font-extrabold text-2xl md:text-3xl text-foreground">
            Master data
          </h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-xl">
            What the request form offers. Changes appear on the form immediately — there is no
            deploy to wait for.
          </p>
        </div>

        <div className="card-warm p-5 mb-6 border-l-4 border-l-accent">
          <p className="text-sm text-foreground font-semibold mb-1">
            Editing a list never changes an order that has already been placed.
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            An order stores the words the customer chose, not a link to this page. Rename “Father”
            to “Dad” and last month’s orders still say “Father”, because that is what was asked for.
            <strong className="font-semibold text-foreground"> Hide</strong> takes an option out of
            the form and keeps it here;{' '}
            <strong className="font-semibold text-foreground">delete</strong> removes it for good.
          </p>
        </div>

        <div className="flex flex-col gap-6">
          {MASTER_LISTS.map((list) => (
            <MasterListEditor
              key={list.key}
              listKey={list.key}
              options={lists[list.key]}
              denominations={lists.denomination
                .filter((option) => option.isActive)
                .map((option) => option.value)}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
