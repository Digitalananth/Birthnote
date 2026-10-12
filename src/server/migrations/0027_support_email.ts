import type { Migration } from './types';

/**
 * Moves the support address from support@msphilately.in to
 * support@myluckydates.com in content already in the database.
 *
 * 0022 seeded the footer pages with the old address, and after that the admin
 * is where they live — changing content/pages/ only reaches databases that
 * have not run 0022 yet. Replacing just the address, rather than re-seeding
 * the pages, keeps any other edits the owner has made in the admin.
 */
const OLD = 'support@msphilately.in';
const NEW = 'support@myluckydates.com';

export const migration: Migration = {
  version: '0027',
  name: 'support_email',
  async up(m) {
    for (const table of ['pages', 'blog_posts']) {
      await m.execute(
        `UPDATE ${table}
            SET body_markdown = REPLACE(body_markdown, ?, ?)
          WHERE INSTR(body_markdown, ?) > 0`,
        [OLD, NEW, OLD]
      );
    }
  },
};
