import type { Migration } from './types';

/**
 * The grades a note can be in, as a list the owner edits.
 *
 * The admin typed this by hand into every order, which meant "UNC", "Unc" and
 * "uncirculated" all sat in the database as different conditions and no report
 * could count them. It is the same job the other master lists do — a list that
 * decides what a dropdown offers — so it rides on `master_options` rather than
 * a table of its own.
 *
 * As with every list there, an order stores the words that were chosen and not
 * an id into this table: renaming a grade here can never rewrite what a note
 * already sold was described as.
 *
 * Seeded with the standard grading scale, best first, since that is the order
 * someone reaches for them in.
 */
const CONDITIONS = [
  'Uncirculated (UNC)',
  'About Uncirculated (AU)',
  'Extremely Fine (XF)',
  'Very Fine (VF)',
  'Fine (F)',
  'Very Good (VG)',
  'Good (G)',
];

export const migration: Migration = {
  version: '0014',
  name: 'note_condition_options',
  async up(m) {
    for (const [index, value] of CONDITIONS.entries()) {
      // INSERT IGNORE against the (list_key, value) unique key, so seeding is
      // safe on a database that already has some of these — a shop that had
      // typed "Fine (F)" into the list by hand keeps its one row.
      await m.execute(
        `INSERT IGNORE INTO master_options (list_key, value, position)
         VALUES ('note_condition', ?, ?)`,
        [value, index]
      );
    }
  },
};
