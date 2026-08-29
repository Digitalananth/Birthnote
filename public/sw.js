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
const VERSION = 'v2';
const SHELL_CACHE = `birthnote-shell-${VERSION}`;
const ASSET_CACHE = `birthnote-assets-${VERSION}`;
const OFFLINE_URL = '/offline';

/** Fetched at install so there is always something to show with no network.
 *  The offline page itself is handled by precacheOfflinePage below, which also
 *  picks up its stylesheets. */
const PRECACHE = ['/icons/icon-192.png'];

/**
 * Caches the offline page along with the stylesheets it references.
 *
 * The page alone is not enough: its CSS lives at a content-hashed
 * /_next/static path this file cannot know at build time, so precaching only
 * the HTML meant an unstyled fallback for anyone who installed the app and
 * lost the connection before browsing far enough to warm the asset cache.
 * Reading the hrefs out of the served markup keeps that in step with the build
 * without a generation step.
 */
async function precacheOfflinePage(cache) {
  const response = await fetch(OFFLINE_URL, { cache: 'reload' });
  if (!response.ok) throw new Error(`offline page returned ${response.status}`);

  const html = await response.clone().text();
  await cache.put(OFFLINE_URL, response);

  const hrefs = [];
  const link = /<link[^>]+rel=["']stylesheet["'][^>]*>/gi;
  let tag;
  while ((tag = link.exec(html)) !== null) {
    const href = /href=["']([^"']+)["']/i.exec(tag[0]);
    // Same-origin build output only; a third-party stylesheet is not ours to
    // store and would fail opaquely anyway.
    if (href && href[1].startsWith('/')) hrefs.push(href[1]);
  }

  // One missing stylesheet should not fail the whole install and leave the
  // worker unregistered, so these are settled rather than awaited as a group.
  await Promise.allSettled(hrefs.map((href) => cache.add(href)));
}

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
      .then(async (cache) => {
        await cache.addAll(PRECACHE);
        await precacheOfflinePage(cache);
      })
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
