'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';

export default function LogoutButton() {
  const router = useRouter();

  const logout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.replace('/admin/login');
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={logout}
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
    >
      <Icon name="ArrowLeftIcon" size={12} />
      Sign out
    </button>
  );
}
