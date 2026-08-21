'use client';

import React from 'react';
import Icon from '@/components/ui/AppIcon';

export default function SubmitButton({
  busy,
  busyLabel,
  children,
}: {
  busy: boolean;
  busyLabel: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="group w-full flex items-center justify-center gap-3 px-8 py-4 bg-primary text-primary-foreground rounded-xl font-bold text-base hover:bg-primary/90 transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {busy ? (
        <>
          <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
          {busyLabel}
        </>
      ) : (
        <>
          {children}
          <Icon
            name="ArrowRightIcon"
            size={18}
            className="group-hover:translate-x-1 transition-transform"
          />
        </>
      )}
    </button>
  );
}
