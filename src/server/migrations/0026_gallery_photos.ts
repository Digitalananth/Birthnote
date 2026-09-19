import type { Migration } from './types';

/**
 * Photos of finished gift boxes, uploaded from Admin → Gallery and shown on
 * the home page's gallery strip and the full /gallery page, newest first.
 *
 * `image_url` holds the uploaded media URL (/api/media/:id). `status` reuses
 * the CMS draft/published pair so a photo can be hidden without deleting it.
 */
export const migration: Migration = {
  version: '0026',
  name: 'gallery_photos',
  async up(m) {
    await m.execute(`
      CREATE TABLE IF NOT EXISTS gallery_photos (
        id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
        image_url   VARCHAR(500) NOT NULL,
        caption     VARCHAR(200)     NULL,
        status      ENUM('draft','published') NOT NULL DEFAULT 'published',
        updated_by  VARCHAR(190)     NULL,
        created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_gallery_photos_status (status, id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  },
};
