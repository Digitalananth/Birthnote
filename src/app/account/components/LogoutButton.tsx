'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';

export default function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const handleLogout = async () => {
    setBusy(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      // refresh() clears the cached server render of the signed-in pages, so
      // going back does not show a stale account view.
      router.replace('/');
      router.refresh();
    }
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={busy}
      className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors whitespace-nowrap disabled:opacity-60"
    >
      <Icon name="ArrowRightOnRectangleIcon" size={16} />
      {busy ? 'Signing out…' : 'Log out'}
    </button>
  );
}
