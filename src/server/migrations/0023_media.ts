import type { Migration } from './types';

/**
 * Images uploaded through the CMS — blog cover images, for now.
 *
 * Stored in MySQL for the same reason as `order_item_photos` (0015): Hostinger
 * rebuilds the app directory on every deploy, so a file written to disk would
 * be gone at the next release, and there is no object store. Unlike order
 * photos these are public — a cover is on a published page for anyone to see —
 * so the row belongs to nothing and is served by id alone.
 *
 * `sha256` is unique so uploading the same file twice hands back the existing
 * row instead of storing the bytes again.
 */
export const migration: Migration = {
  version: '0023',
  name: 'media',
  async up(m) {
    await m.execute(`
      CREATE TABLE IF NOT EXISTS media (
        id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        content_type  VARCHAR(60)     NOT NULL,
        byte_size     INT UNSIGNED    NOT NULL,
        sha256        CHAR(64)        NOT NULL,
        data          MEDIUMBLOB      NOT NULL,
        uploaded_by   VARCHAR(190)         NULL,
        created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_media_digest (sha256)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  },
};
