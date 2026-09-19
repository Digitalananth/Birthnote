import 'server-only';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { query } from '@/lib/db';
import type { ContentStatus, GalleryPhoto, GalleryPhotoInput } from '@/lib/content-types';

export type { GalleryPhoto, GalleryPhotoInput } from '@/lib/content-types';

interface GalleryPhotoRow extends RowDataPacket {
  id: number;
  image_url: string;
  caption: string | null;
  status: ContentStatus;
  created_at: Date | string;
}

function mapPhoto(row: GalleryPhotoRow): GalleryPhoto {
  return {
    id: row.id,
    imageUrl: row.image_url,
    caption: row.caption,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/** Newest first — the latest gift box is the one worth showing off. */
const ORDER = 'ORDER BY id DESC';

export async function listGalleryPhotos(): Promise<GalleryPhoto[]> {
  const rows = await query<GalleryPhotoRow[]>(`SELECT * FROM gallery_photos ${ORDER}`);
  return rows.map(mapPhoto);
}

export async function listPublishedGalleryPhotos(limit?: number): Promise<GalleryPhoto[]> {
  // Inlined, not a `?`: prepared statements reject a bound LIMIT on MySQL.
  const cap = limit && Number.isInteger(limit) && limit > 0 ? ` LIMIT ${limit}` : '';
  const rows = await query<GalleryPhotoRow[]>(
    `SELECT * FROM gallery_photos WHERE status = 'published' ${ORDER}${cap}`
  );
  return rows.map(mapPhoto);
}

export async function getGalleryPhotoById(id: number): Promise<GalleryPhoto | null> {
  const rows = await query<GalleryPhotoRow[]>('SELECT * FROM gallery_photos WHERE id = ? LIMIT 1', [
    id,
  ]);
  return rows.length ? mapPhoto(rows[0]) : null;
}

function params(input: GalleryPhotoInput, actor: string) {
  return [input.imageUrl.trim(), input.caption?.trim() || null, input.status, actor];
}

export async function createGalleryPhoto(
  input: GalleryPhotoInput,
  actor: string
): Promise<GalleryPhoto> {
  const result = await query<ResultSetHeader>(
    `INSERT INTO gallery_photos (image_url, caption, status, updated_by) VALUES (?, ?, ?, ?)`,
    params(input, actor)
  );
  const created = await getGalleryPhotoById(result.insertId);
  if (!created) throw new Error('Gallery photo vanished immediately after insert.');
  return created;
}

export async function updateGalleryPhoto(
  id: number,
  input: GalleryPhotoInput,
  actor: string
): Promise<GalleryPhoto | null> {
  await query(
    `UPDATE gallery_photos SET image_url = ?, caption = ?, status = ?, updated_by = ? WHERE id = ?`,
    [...params(input, actor), id]
  );
  return getGalleryPhotoById(id);
}

export async function deleteGalleryPhoto(id: number): Promise<void> {
  await query('DELETE FROM gallery_photos WHERE id = ?', [id]);
}
