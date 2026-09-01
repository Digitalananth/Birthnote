import 'server-only';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { query } from '@/lib/db';
import {
  MASTER_LIST_KEYS,
  describeCombo,
  masterListMeta,
  parseComboValue,
  type DenominationCombo,
  type MasterListKey,
  type MasterOption,
  type MasterOptionSets,
} from '@/lib/master-option-types';

export type { DenominationCombo, MasterOption, MasterOptionSets } from '@/lib/master-option-types';

/**
 * The option lists behind the request form's dropdowns.
 *
 * Read to *build* a dropdown, never to resolve one: an order stores the value
 * the customer chose, not an id into this table, so editing a list here can
 * never rewrite what an old order says. See `0011_master_options`.
 */

/** Thrown when a list already holds that value. */
export class DuplicateOptionError extends Error {
  constructor() {
    super('That option is already in the list.');
    this.name = 'DuplicateOptionError';
  }
}

interface OptionRow extends RowDataPacket {
  id: number;
  list_key: MasterListKey;
  value: string;
  label: string | null;
  position: number;
  is_active: number;
}

function toOption(row: OptionRow): MasterOption {
  return {
    id: row.id,
    listKey: row.list_key,
    value: row.value,
    label: row.label,
    position: row.position,
    isActive: Boolean(row.is_active),
  };
}

/**
 * Ordering, in one place because the admin list and the customer's dropdown
 * must agree. Numeric lists sort by amount — ₹500 after ₹100, not before it,
 * which is what a plain string sort on a VARCHAR would do.
 */
function orderBy(listKey: MasterListKey): string {
  return masterListMeta(listKey).numeric
    ? 'ORDER BY CAST(value AS UNSIGNED), value'
    : 'ORDER BY position, value';
}

/** Every option in one list, active or not. The admin screen's view. */
export async function listOptions(listKey: MasterListKey): Promise<MasterOption[]> {
  const rows = await query<OptionRow[]>(
    `SELECT id, list_key, value, label, position, is_active
       FROM master_options
      WHERE list_key = ?
      ${orderBy(listKey)}`,
    [listKey]
  );
  return rows.map(toOption);
}

export async function listAllOptions(): Promise<Record<MasterListKey, MasterOption[]>> {
  const lists = await Promise.all(MASTER_LIST_KEYS.map((key) => listOptions(key)));
  return Object.fromEntries(MASTER_LIST_KEYS.map((key, index) => [key, lists[index]])) as Record<
    MasterListKey,
    MasterOption[]
  >;
}

/**
 * The active values of every list, for the request form and for the server's
 * check of what came back from it.
 *
 * A list emptied by an admin returns an empty array rather than falling back
 * to some built-in set: an empty dropdown is a visible mistake somebody will
 * fix, whereas silently offering options nobody chose is one that hides.
 */
export async function getMasterOptionSets(): Promise<MasterOptionSets> {
  const lists = await listAllOptions();
  const active = (key: MasterListKey) => lists[key].filter((option) => option.isActive);

  return {
    denomination: active('denomination').map((option) => option.value),
    denomination_combo: active('denomination_combo').map(toCombo),
    gift_relationship: active('gift_relationship').map((option) => option.value),
    occasion: active('occasion').map((option) => option.value),
    note_condition: active('note_condition').map((option) => option.value),
  };
}

/** Unpacks a stored "10,20,50" into something the form can tick. */
export function toCombo(option: MasterOption): DenominationCombo {
  const denominations = parseComboValue(option.value);
  return {
    id: option.id,
    label: option.label?.trim() || describeCombo(denominations),
    denominations,
  };
}

export async function createOption(
  listKey: MasterListKey,
  value: string,
  label: string | null = null
): Promise<MasterOption> {
  // Appended, not inserted: a new option goes to the bottom of the list where
  // whoever added it will look for it.
  const [row] = await query<(RowDataPacket & { next: number | string })[]>(
    'SELECT COALESCE(MAX(position), -1) + 1 AS next FROM master_options WHERE list_key = ?',
    [listKey]
  );
  // MySQL hands back the sum of an unsigned column as a string; without this
  // the returned option carries a "2" where its type promises a 2.
  const next = Number(row.next);

  try {
    const result = await query<ResultSetHeader>(
      'INSERT INTO master_options (list_key, value, label, position) VALUES (?, ?, ?, ?)',
      [listKey, value, label, next]
    );
    return { id: result.insertId, listKey, value, label, position: next, isActive: true };
  } catch (error) {
    if ((error as { code?: string }).code === 'ER_DUP_ENTRY') throw new DuplicateOptionError();
    throw error;
  }
}

export async function setOptionActive(id: number, isActive: boolean): Promise<boolean> {
  const result = await query<ResultSetHeader>(
    'UPDATE master_options SET is_active = ? WHERE id = ?',
    [isActive ? 1 : 0, id]
  );
  return result.affectedRows > 0;
}

/**
 * Deletes an option outright.
 *
 * Safe in a way it would not be with a foreign key: orders hold the text, so
 * nothing points here and nothing breaks. It still removes the option from
 * every future dropdown, which is why the screen offers "hide" as well —
 * that is the honest choice for something once offered and now withdrawn.
 */
export async function deleteOption(id: number): Promise<boolean> {
  const result = await query<ResultSetHeader>('DELETE FROM master_options WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

/** Moves an option one place up or down its list. */
export async function moveOption(id: number, direction: 'up' | 'down'): Promise<boolean> {
  const rows = await query<OptionRow[]>(
    'SELECT id, list_key, value, label, position, is_active FROM master_options WHERE id = ?',
    [id]
  );
  if (!rows.length) return false;
  const option = toOption(rows[0]);

  const siblings = await listOptions(option.listKey);
  const index = siblings.findIndex((item) => item.id === id);
  const swapWith = siblings[direction === 'up' ? index - 1 : index + 1];
  if (!swapWith) return false;

  // Positions are rewritten for the whole list rather than swapped in place:
  // the seeded rows all start at distinct positions, but a list edited for a
  // while can hold ties, and swapping two equal numbers moves nothing.
  const reordered = [...siblings];
  reordered[index] = swapWith;
  reordered[direction === 'up' ? index - 1 : index + 1] = option;

  for (const [position, item] of reordered.entries()) {
    await query('UPDATE master_options SET position = ? WHERE id = ?', [position, item.id]);
  }
  return true;
}
