/**
 * The master lists, and the rules for what may go in them.
 *
 * No `server-only` here on purpose: the admin editor is a client component and
 * needs the same labels and the same validation the API applies, so a bad
 * value is refused before the round trip and refused again after it.
 */

export const MASTER_LIST_KEYS = ['denomination', 'gift_relationship', 'occasion'] as const;

export type MasterListKey = (typeof MASTER_LIST_KEYS)[number];

export interface MasterListMeta {
  key: MasterListKey;
  /** What this list is called on the admin screen. */
  label: string;
  /** The form field it fills, in the words the customer sees. */
  field: string;
  description: string;
  /** Denominations are rupee amounts, and are stored and sorted as numbers. */
  numeric?: boolean;
  placeholder: string;
}

export const MASTER_LISTS: readonly MasterListMeta[] = [
  {
    key: 'denomination',
    label: 'Denominations',
    field: 'Denominations',
    description:
      'The note values someone can ask for, in rupees. Numbers only — they are shown as ₹ amounts and ordered smallest first.',
    numeric: true,
    placeholder: '1000',
  },
  {
    key: 'gift_relationship',
    label: 'Who is it for',
    field: 'Who is it for (optional)',
    description: 'The relationships offered in the dropdown beside each date.',
    placeholder: 'Godmother',
  },
  {
    key: 'occasion',
    label: 'Occasions',
    field: 'Occasion or name (optional)',
    description:
      'Suggestions only. That field stays free text, so a customer can still type a name or an occasion that is not on this list.',
    placeholder: 'Naming day',
  },
];

export function masterListMeta(key: MasterListKey): MasterListMeta {
  return MASTER_LISTS.find((list) => list.key === key) as MasterListMeta;
}

export function isMasterListKey(value: unknown): value is MasterListKey {
  return MASTER_LIST_KEYS.includes(value as MasterListKey);
}

export interface MasterOption {
  id: number;
  listKey: MasterListKey;
  value: string;
  position: number;
  isActive: boolean;
}

/** Every list's active values, in order. What the request form is handed. */
export type MasterOptionSets = Record<MasterListKey, string[]>;

/**
 * Checks one option value for its list.
 *
 * Returns the cleaned value, because a denomination typed as "₹1,000" is a
 * perfectly clear request that only needs tidying, not refusing.
 */
export function validateOptionValue(
  listKey: MasterListKey,
  raw: string
): { value?: string; error?: string } {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { error: 'Enter a value' };

  if (masterListMeta(listKey).numeric) {
    const digits = trimmed.replace(/[₹,\s]/g, '');
    if (!/^\d+$/.test(digits)) return { error: 'Denominations are whole numbers, in rupees' };
    const amount = Number.parseInt(digits, 10);
    if (amount < 1) return { error: 'Enter an amount of ₹1 or more' };
    // Wider than any note ever printed, and narrow enough that a slipped key
    // cannot put a nine-digit "denomination" in front of a customer.
    if (amount > 100000) return { error: 'That is larger than any banknote' };
    return { value: String(amount) };
  }

  if (trimmed.length > 40) return { error: 'Keep it under 40 characters' };
  return { value: trimmed };
}
