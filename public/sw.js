/*
 * BirthNote service worker.
 *
 * Deliberately small. It exists so an installed app opens instantly and says
 * something sensible with no connection — not to make the site work offline,
 * which it cannot: every page that matters after the marketing copy is an
 * order, an account or a payment.
 *
 * THE RULE THAT MATTERS: nothing personal is ever cached. A phone is often
 * shared, and a cached /track-order page would show one person's order to the
 * next — or show its owner a status that changed hours ago. The deny-list
 * below is the whole reason this file needs care.
 */
const VERSION = 'v1';
const SHELL_CACHE = `birthnote-shell-${VERSION}`;
const ASSET_CACHE = `birthnote-assets-${VERSION}`;
const OFFLINE_URL = '/offline';

/** Fetched at install so there is always something to show with no network. */
const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png'];

/**
 * Paths whose responses must never be stored.
 *
 * Personal (orders, accounts, payments), privileged (admin) or changing
 * (API). Anything matching this is passed straight to the network, and a
 * failure is a failure — better a browser error than a stale order status.
 */
const NEVER_CACHE = [
  '/api/',
  '/admin',
  '/account',
  '/payment/',
  '/track-order/',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password/',
];

function isPrivate(pathname) {
  return NEVER_CACHE.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      // Take over as soon as this version is ready rather than waiting for
      // every tab to close.
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== ASSET_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only GET is ever cacheable, and only our own origin.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isPrivate(url.pathname)) return;

  // Navigations: network first, so published content is never stale, with the
  // offline page as the fallback rather than a browser error screen.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(request);
        return cached || caches.match(OFFLINE_URL);
      })
    );
    return;
  }

  // Build output and icons are content-hashed or effectively immutable, so
  // they can be served from cache and refreshed in the background.
  const isStaticAsset =
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/assets/');

  if (!isStaticAsset) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
