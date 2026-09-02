import 'server-only';
import { createHash } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';
import { query } from '@/lib/db';
import {
  PHOTO_CONTENT_TYPES,
  PHOTO_MAX_BYTES,
  PHOTO_MAX_PER_ITEM,
  type OrderItemPhoto,
} from '@/lib/order-photo-types';

/**
 * Reading and writing the photographs of the notes themselves.
 *
 * Every query here is scoped by the order the photo belongs to, never by the
 * photo id alone: the id is sequential and guessable, the order reference is
 * not, and it is the reference that decides who may look.
 */
interface PhotoRow extends RowDataPacket {
  id: number;
  order_item_id: number;
  content_type: string;
  byte_size: number;
  created_at: Date;
}

function mapPhoto(row: PhotoRow): OrderItemPhoto {
  return {
    id: row.id,
    contentType: row.content_type,
    byteSize: row.byte_size,
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * The photos for a set of orders, as item id → photos.
 *
 * One query for the whole page, and the blob column is left out of it — the
 * admin queue lists 25 orders, and selecting `data` there would move tens of
 * megabytes to render a few thumbnails' worth of markup.
 */
export async function loadPhotosByItem(orderIds: number[]): Promise<Map<number, OrderItemPhoto[]>> {
  const grouped = new Map<number, OrderItemPhoto[]>();
  if (!orderIds.length) return grouped;

  // The ids come from rows just read, so they are numbers; the placeholder
  // list is built from their count, never from their values.
  const placeholders = orderIds.map(() => '?').join(',');
  const rows = await query<PhotoRow[]>(
    `SELECT id, order_item_id, content_type, byte_size, created_at
       FROM order_item_photos
      WHERE order_id IN (${placeholders})
      ORDER BY order_item_id, position, id`,
    orderIds
  );
  for (const row of rows) {
    const list = grouped.get(row.order_item_id) ?? [];
    list.push(mapPhoto(row));
    grouped.set(row.order_item_id, list);
  }
  return grouped;
}

export interface PhotoBytes {
  contentType: string;
  data: Buffer;
}

/** One photo's bytes, but only if it belongs to the order that was asked for. */
export async function getPhotoBytes(
  reference: string,
  photoId: number
): Promise<PhotoBytes | null> {
  const rows = await query<(RowDataPacket & { content_type: string; data: Buffer })[]>(
    `SELECT p.content_type, p.data
       FROM order_item_photos p
       JOIN orders o ON o.id = p.order_id
      WHERE p.id = ? AND o.reference = ?
      LIMIT 1`,
    [photoId, reference.trim().toUpperCase()]
  );
  if (!rows.length) return null;
  return { contentType: rows[0].content_type, data: rows[0].data };
}

/** Why an upload was refused, in words the admin can act on. */
export class PhotoRejected extends Error {}

/**
 * Stores one photograph against one note.
 *
 * Re-uploading a file already on the note is a no-op rather than a duplicate:
 * the unique key is (item, sha256), and a double-submit or a retried request
 * should not leave the customer looking at the same picture twice.
 */
export async function addItemPhoto(
  reference: string,
  itemId: number,
  file: { contentType: string; data: Buffer },
  uploadedBy: string | null
): Promise<OrderItemPhoto[] | null> {
  const contentType = file.contentType.split(';')[0].trim().toLowerCase();
  if (!(PHOTO_CONTENT_TYPES as readonly string[]).includes(contentType)) {
    throw new PhotoRejected('Photos must be a JPEG, PNG or WebP image.');
  }
  if (!file.data.length) throw new PhotoRejected('That file was empty.');
  if (file.data.length > PHOTO_MAX_BYTES) {
    throw new PhotoRejected(
      `Photos must be under ${Math.round(PHOTO_MAX_BYTES / (1024 * 1024))}MB.`
    );
  }

  const owner = await findItem(reference, itemId);
  if (!owner) return null;

  const existing = await query<PhotoRow[]>(
    `SELECT id, order_item_id, content_type, byte_size, created_at
       FROM order_item_photos WHERE order_item_id = ? ORDER BY position, id`,
    [itemId]
  );
  if (existing.length >= PHOTO_MAX_PER_ITEM) {
    throw new PhotoRejected(
      `That note already has ${PHOTO_MAX_PER_ITEM} photos — remove one first.`
    );
  }

  const digest = createHash('sha256').update(file.data).digest('hex');
  await query(
    `INSERT INTO order_item_photos
       (order_item_id, order_id, content_type, byte_size, sha256, data, position, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE id = id`,
    [
      itemId,
      owner.orderId,
      contentType,
      file.data.length,
      digest,
      file.data,
      existing.length,
      uploadedBy,
    ]
  );

  return listItemPhotos(itemId);
}

/** Removes one photo, if it is on the note the caller named. */
export async function deleteItemPhoto(
  reference: string,
  itemId: number,
  photoId: number
): Promise<OrderItemPhoto[] | null> {
  const owner = await findItem(reference, itemId);
  if (!owner) return null;

  await query('DELETE FROM order_item_photos WHERE id = ? AND order_item_id = ?', [
    photoId,
    itemId,
  ]);
  return listItemPhotos(itemId);
}

export async function listItemPhotos(itemId: number): Promise<OrderItemPhoto[]> {
  const rows = await query<PhotoRow[]>(
    `SELECT id, order_item_id, content_type, byte_size, created_at
       FROM order_item_photos WHERE order_item_id = ? ORDER BY position, id`,
    [itemId]
  );
  return rows.map(mapPhoto);
}

/** Confirms the note is on that order, and hands back the order's id. */
async function findItem(
  reference: string,
  itemId: number
): Promise<{ orderId: number } | null> {
  const rows = await query<(RowDataPacket & { order_id: number })[]>(
    `SELECT i.order_id
       FROM order_items i
       JOIN orders o ON o.id = i.order_id
      WHERE i.id = ? AND o.reference = ?
      LIMIT 1`,
    [itemId, reference.trim().toUpperCase()]
  );
  return rows.length ? { orderId: rows[0].order_id } : null;
}
