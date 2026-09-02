/**
 * The photo vocabulary, kept out of `order-photos.ts` because that module is
 * `server-only` and the thumbnail strip is a client component.
 *
 * A photo is described here, never carried: the bytes stay in the database and
 * reach the browser through `photoSrc` below, so an order payload does not
 * grow by a megabyte per note.
 */
export interface OrderItemPhoto {
  id: number;
  contentType: string;
  byteSize: number;
  createdAt: string;
}

/** What a browser may upload, and how much of it. */
export const PHOTO_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
/** Enough for a front and a back, and a spare. */
export const PHOTO_MAX_PER_ITEM = 4;

export const PHOTO_ACCEPT = PHOTO_CONTENT_TYPES.join(',');

/**
 * Where the bytes are served from.
 *
 * Scoped by order reference, which is the capability the tracking and payment
 * pages already run on: whoever holds the reference may see that order's
 * photos, and the id alone opens nothing.
 */
export function photoSrc(reference: string, photoId: number): string {
  return `/api/orders/${encodeURIComponent(reference)}/photos/${photoId}`;
}
