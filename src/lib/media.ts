import 'server-only';
import { createHash } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';
import { query } from '@/lib/db';
import { PHOTO_CONTENT_TYPES, PHOTO_MAX_BYTES } from '@/lib/order-photo-types';

/**
 * Public images uploaded through the CMS (blog covers). Same limits as order
 * photos — JPEG, PNG or WebP, 5MB — so both upload paths accept the same files.
 */

/** Why an upload was refused, in words the admin can act on. */
export class MediaRejected extends Error {}

/** Where an uploaded image is served from. */
export function mediaSrc(id: number): string {
  return `/api/media/${id}`;
}

/**
 * Stores one image and returns its id. Uploading a file that is already
 * stored returns the existing id rather than a second copy of the bytes.
 */
export async function addMedia(
  file: { contentType: string; data: Buffer },
  uploadedBy: string | null
): Promise<number> {
  const contentType = file.contentType.split(';')[0].trim().toLowerCase();
  if (!(PHOTO_CONTENT_TYPES as readonly string[]).includes(contentType)) {
    throw new MediaRejected('Images must be a JPEG, PNG or WebP file.');
  }
  if (!file.data.length) throw new MediaRejected('That file was empty.');
  if (file.data.length > PHOTO_MAX_BYTES) {
    throw new MediaRejected(
      `Images must be under ${Math.round(PHOTO_MAX_BYTES / (1024 * 1024))}MB.`
    );
  }

  const digest = createHash('sha256').update(file.data).digest('hex');
  await query(
    `INSERT INTO media (content_type, byte_size, sha256, data, uploaded_by)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE id = id`,
    [contentType, file.data.length, digest, file.data, uploadedBy]
  );
  const rows = await query<(RowDataPacket & { id: number })[]>(
    'SELECT id FROM media WHERE sha256 = ? LIMIT 1',
    [digest]
  );
  return rows[0].id;
}

export async function getMediaBytes(
  id: number
): Promise<{ contentType: string; data: Buffer } | null> {
  const rows = await query<(RowDataPacket & { content_type: string; data: Buffer })[]>(
    'SELECT content_type, data FROM media WHERE id = ? LIMIT 1',
    [id]
  );
  if (!rows.length) return null;
  return { contentType: rows[0].content_type, data: rows[0].data };
}
