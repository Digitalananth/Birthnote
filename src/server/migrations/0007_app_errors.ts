import type { Migration } from './types';

/**
 * Server-side failures, kept in the database.
 *
 * On Hostinger the running app's stdout is unreadable, so an error a route
 * handler logs is lost the moment it is thrown. A row here survives restarts
 * and is visible from every worker process, which an in-memory ring is not.
 * Messages are stored with quoted values redacted — see recordError — so the
 * table never holds customer data.
 */
export const migration: Migration = {
  version: '0007',
  name: 'app_errors',
  async up(m) {
    await m.execute(
      `CREATE TABLE IF NOT EXISTS app_errors (
         id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
         scope       VARCHAR(80)     NOT NULL,
         code        VARCHAR(40)          NULL,
         message     VARCHAR(500)    NOT NULL,
         detail      VARCHAR(500)         NULL,
         created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
         PRIMARY KEY (id),
         KEY idx_app_errors_created (created_at)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    );
  },
};
