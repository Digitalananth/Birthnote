import type { Migration } from './types';

/**
 * A photograph of the actual note, per item.
 *
 * The admin finds a note and can now show it: the customer sees the very
 * banknote that is going into the envelope rather than a description of it.
 *
 * The bytes live in MySQL, not on disk. Hostinger prunes the deploy to `.next`
 * and rebuilds it on every release, so anything written under the app
 * directory is gone at the next deploy — a photo uploaded on Tuesday would
 * 404 on Wednesday. There is no object store configured for this project, and
 * the volume here is a handful of small JPEGs per order, so the database is
 * the only place that actually keeps them. MEDIUMBLOB caps a single photo at
 * 16MB; the API caps it far lower still.
 *
 * The row carries `content_type` and `byte_size` because the serving route
 * must answer with a correct Content-Type and Content-Length without reading
 * the blob to work them out, and a listing needs the metadata without the
 * bytes. `sha256` is what makes uploading the same file twice a no-op instead
 * of a duplicate row.
 */
export const migration: Migration = {
  version: '0015',
  name: 'item_photos',
  async up(m) {
    await m.execute(`
      CREATE TABLE IF NOT EXISTS order_item_photos (
        id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        order_item_id BIGINT UNSIGNED NOT NULL,
        order_id      BIGINT UNSIGNED NOT NULL,
        content_type  VARCHAR(60)     NOT NULL,
        byte_size     INT UNSIGNED    NOT NULL,
        sha256        CHAR(64)        NOT NULL,
        data          MEDIUMBLOB      NOT NULL,
        position      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
        uploaded_by   VARCHAR(190)         NULL,
        created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_item_photos_item (order_item_id, position, id),
        KEY idx_item_photos_order (order_id),
        UNIQUE KEY uq_item_photos_digest (order_item_id, sha256),
        CONSTRAINT fk_item_photos_item FOREIGN KEY (order_item_id)
          REFERENCES order_items (id) ON DELETE CASCADE,
        CONSTRAINT fk_item_photos_order FOREIGN KEY (order_id)
          REFERENCES orders (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  },
};
