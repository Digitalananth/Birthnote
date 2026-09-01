import type { Migration } from './types';

/**
 * Combinations: one tick that asks for several notes.
 *
 * "₹10 to ₹500" is how the admin talks about a set, and until now a customer
 * had to tick six boxes to say it. A combination is a shortcut, not a new kind
 * of thing: choosing one ticks its denominations, and the order still holds
 * one item per note. Nothing downstream — pricing, availability, the queue,
 * the reports — learns a new concept.
 *
 * It rides on `master_options` rather than a table of its own, because it is
 * the same job: a list an owner edits to decide what the form offers. The one
 * thing it needs that the other lists do not is a name, so `label` is added
 * here — NULL for every existing row, and for any list that has nothing to say
 * beyond its value.
 *
 * The value is the denominations, comma-separated and ascending: "10,20,50".
 * Not a foreign key to the denomination rows, for the reason the whole table
 * avoids them — a combination is remembered as the amounts it stood for, and
 * removing ₹20 from the shop later must not silently rewrite it.
 */
const COMBOS: { label: string; value: string }[] = [
  { label: '₹10 to ₹500', value: '10,20,50,100,200,500' },
  { label: '₹100 to ₹500', value: '100,200,500' },
];

export const migration: Migration = {
  version: '0012',
  name: 'denomination_combos',
  async up(m) {
    if (!(await m.columnExists('master_options', 'label'))) {
      await m.execute('ALTER TABLE master_options ADD COLUMN label VARCHAR(80) NULL AFTER value');
    }

    // The two the admin asked for, as a starting point they can edit or
    // delete. INSERT IGNORE, so a re-run cannot resurrect a deleted one.
    for (const [index, combo] of COMBOS.entries()) {
      await m.execute(
        `INSERT IGNORE INTO master_options (list_key, value, label, position)
         VALUES ('denomination_combo', ?, ?, ?)`,
        [combo.value, combo.label, index]
      );
    }
  },
};
