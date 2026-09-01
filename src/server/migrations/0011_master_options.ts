import type { Migration } from './types';

/**
 * Phase 8: the request form's dropdowns become data.
 *
 * Denominations, "who is it for" and the occasion suggestions were three
 * hard-coded arrays in `src/lib/validation.ts`, so adding a ₹1000 note or the
 * word "Godmother" meant a deploy. They now live in one table an admin edits.
 *
 * DELIBERATELY NOT A FOREIGN KEY. `order_items` keeps storing the *value* the
 * customer chose — the text, or the number — and never an id into this table.
 * Two reasons, and the second is the important one:
 *
 *   * An option can be renamed or deleted without rewriting history, and
 *     without a stale id in an order pointing at a row that no longer says
 *     what it said when the order was placed.
 *   * An order is a record of what someone actually asked for. "Father" on an
 *     order from March must still read "Father" after the admin renames that
 *     option to "Dad" in June. A join would quietly rewrite the past.
 *
 * The table is therefore only ever read to *build a dropdown*, never to
 * resolve one.
 *
 * `list_key` names the list; the pair (list_key, value) is unique, so the same
 * word can appear in two different lists but not twice in one. `position`
 * orders the dropdown, `is_active` hides an option from the form without
 * losing it — which is the difference between "we no longer offer this" and
 * "this was a mistake", and only the second deserves a DELETE.
 */
const SEEDS: Record<string, string[]> = {
  denomination: ['1', '2', '5', '10', '20', '50', '100', '200', '500'],
  gift_relationship: [
    'Self',
    'Father',
    'Mother',
    'Wife',
    'Husband',
    'Son',
    'Daughter',
    'Brother',
    'Sister',
    'Uncle',
    'Aunt',
    'Friend',
    'Someone else',
  ],
  occasion: [
    'Birthday',
    'Anniversary',
    'Wedding',
    'Retirement',
    'Graduation',
    'New baby',
    'Housewarming',
    'Farewell',
  ],
};

export const migration: Migration = {
  version: '0011',
  name: 'master_options',
  async up(m) {
    await m.execute(`
      CREATE TABLE IF NOT EXISTS master_options (
        id         BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
        list_key   VARCHAR(32)       NOT NULL,
        value      VARCHAR(120)      NOT NULL,
        position   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
        is_active  TINYINT(1)        NOT NULL DEFAULT 1,
        created_at DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP
                                              ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_master_options (list_key, value),
        KEY idx_master_options_list (list_key, is_active, position)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Seeded with exactly what the hard-coded arrays held, so the form offers
    // the same choices the moment this runs and nothing has to be re-entered.
    // INSERT IGNORE, so a re-run against a database an admin has already
    // edited cannot resurrect an option they deleted.
    for (const [listKey, values] of Object.entries(SEEDS)) {
      for (const [index, value] of values.entries()) {
        await m.execute(
          `INSERT IGNORE INTO master_options (list_key, value, position)
           VALUES (?, ?, ?)`,
          [listKey, value, index]
        );
      }
    }
  },
};
