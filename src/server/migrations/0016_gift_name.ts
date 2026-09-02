import type { Migration } from './types';

/**
 * The recipient's name, per note.
 *
 * "Who is it for" said *Father*, and the box beside it said *Occasion or
 * name* — so the person's actual name was either missing or competing with
 * "Dad's 60th" for the same field. They are two different things, and the
 * parcel note and the admin's search both want the name on its own.
 *
 * Nullable, because every order placed before this column existed has no name
 * to put in it, and an order is a record of what was asked for at the time.
 * New submissions are required to carry one — that rule lives in
 * `validation.ts`, where the form and the API both read it.
 */
export const migration: Migration = {
  version: '0016',
  name: 'gift_name',
  async up(m) {
    await m.execute(
      'ALTER TABLE order_items ADD COLUMN gift_name VARCHAR(160) NULL AFTER gift_relationship'
    );
  },
};
