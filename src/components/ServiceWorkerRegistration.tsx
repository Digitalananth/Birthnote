'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker.
 *
 * Renders nothing. Registration is deferred until after `load` so it never
 * competes with the first paint for bandwidth, and it is skipped in
 * development, where a stale worker caching build output is a debugging trap
 * rather than a feature.
 */
export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch((error) => {
        // A failed registration costs the offline page and nothing else.
        console.error('[sw] registration failed', error);
      });
    };

    if (document.readyState === 'complete') {
      register();
      return;
    }
    window.addEventListener('load', register);
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
