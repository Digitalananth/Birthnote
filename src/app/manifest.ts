import type { MetadataRoute } from 'next';

/**
 * The PWA manifest, served at /manifest.webmanifest.
 *
 * `start_url` is the request form rather than the home page: someone who has
 * installed the app has already read the pitch, and what they came back for is
 * to look up another date.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'My Lucky Dates — a banknote from your date',
    short_name: 'My Lucky Dates',
    description:
      'Find a genuine banknote printed on the date that matters, and follow your order from request to doorstep.',
    start_url: '/request-a-banknote',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F7F3EC',
    theme_color: '#8B5A2B',
    categories: ['shopping', 'lifestyle'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // A maskable icon is padded so Android can crop it to whatever shape the
      // launcher uses without clipping the artwork.
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      { name: 'Request a banknote', url: '/request-a-banknote' },
      { name: 'Track an order', url: '/track-order' },
      { name: 'My account', url: '/account' },
    ],
  };
}
