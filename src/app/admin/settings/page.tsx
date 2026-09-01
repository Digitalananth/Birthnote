import React from 'react';
import type { Metadata } from 'next';
import AdminNav from '@/app/admin/components/AdminNav';
import SettingsForm from '@/app/admin/settings/components/SettingsForm';
import Icon from '@/components/ui/AppIcon';
import { requireOwner } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { missingInvoiceSettings } from '@/lib/settings-types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Settings — My Lucky Dates admin',
  robots: { index: false, follow: false },
};

/**
 * Tax, delivery charges, and the business identity printed on invoices.
 *
 * Owner-only, like the master lists: these decide what every customer is
 * charged and whose GSTIN appears on a legal document.
 */
export default async function AdminSettingsPage() {
  const admin = await requireOwner('/admin/settings');
  const settings = await getSettings();
  const missing = missingInvoiceSettings(settings);

  return (
    <main className="min-h-screen bg-secondary/20 px-4 md:px-10 py-10">
      <div className="max-w-3xl mx-auto">
        <AdminNav admin={admin} current="settings" />

        <div className="mb-8">
          <p className="text-xs uppercase tracking-widest text-primary font-bold mb-1">
            My Lucky Dates
          </p>
          <h1 className="font-sans font-extrabold text-2xl md:text-3xl text-foreground">
            Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-xl">
            What an order costs on top of the notes themselves, and what appears on the tax invoice.
          </p>
        </div>

        {/*
          Said here rather than only at the moment an invoice fails, because
          the moment it fails is after a customer has paid.
        */}
        {missing.length > 0 && (
          <div className="card-warm p-5 mb-6 border-l-4 border-l-red-500 flex items-start gap-3">
            <Icon
              name="ExclamationTriangleIcon"
              size={18}
              className="text-red-600 mt-0.5 shrink-0"
            />
            <div>
              <p className="text-sm font-semibold text-foreground mb-1">
                Invoices cannot be issued yet.
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Fill in {missing.map((meta) => meta.label.toLowerCase()).join(', ')} below. Until
                then orders can still be taken and paid for, and an invoice will be raised for each
                of them as soon as these are set.
              </p>
            </div>
          </div>
        )}

        <SettingsForm settings={settings} />
      </div>
    </main>
  );
}
