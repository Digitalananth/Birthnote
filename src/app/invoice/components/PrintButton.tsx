'use client';

import React from 'react';
import Icon from '@/components/ui/AppIcon';

/**
 * Print, which is also how a PDF is made.
 *
 * The browser's own print dialog offers "Save as PDF" on every platform we
 * care about, so there is no PDF renderer on the server to keep fed with
 * fonts — and the resulting file uses the reader's own paper size.
 */
export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
    >
      <Icon name="ArrowDownTrayIcon" size={14} />
      Print or save as PDF
    </button>
  );
}
