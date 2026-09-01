/**
 * The master lists, and the rules for what may go in them.
 *
 * No `server-only` here on purpose: the admin editor is a client component and
 * needs the same labels and the same validation the API applies, so a bad
 * value is refused before the round trip and refused again after it.
 */

export const MASTER_LIST_KEYS = [
  'denomination',
  'denomination_combo',
  'gift_relationship',
  'occasion',
] as const;

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
  /**
   * A set of denominations rather than a single value: stored as an ascending
   * comma-separated list, and shown with a name of its own.
   */
  combo?: boolean;
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
    key: 'denomination_combo',
    label: 'Combinations',
    field: 'Denominations',
    description:
      'A shortcut that ticks several denominations at once — “₹10 to ₹500” instead of six taps. Each note in the set is still a separate note on the order.',
    combo: true,
    placeholder: '10,20,50,100,200,500',
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

/**
 * The most notes one combination may stand for.
 *
 * Matches MAX_ITEMS_PER_ORDER in `validation.ts`: a combination that could not
 * fit in an order even on its own is not a shortcut, it is a dead end.
 */
export const MAX_COMBO_SIZE = 20;

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
  /** A combination's name. Null for the plain lists, which are their own name. */
  label: string | null;
  position: number;
  isActive: boolean;
}

/** A combination, unpacked into something the form can tick. */
export interface DenominationCombo {
  id: number;
  label: string;
  denominations: number[];
}

/**
 * Every list's active values, in order. What the request form is handed.
 *
 * Combinations are unpacked; the rest are the values as stored.
 */
export interface MasterOptionSets {
  denomination: string[];
  denomination_combo: DenominationCombo[];
  gift_relationship: string[];
  occasion: string[];
}

/**
 * The denominations a combination stands for.
 *
 * Tolerant on the way in — spaces, ₹ signs and any order are all fine — and
 * strict on the way out: unique, ascending, numbers only. Returns an empty
 * array for anything it cannot read, and the caller decides whether that is an
 * error or simply a combination with nothing in it.
 */
export function parseComboValue(raw: string): number[] {
  return [
    ...new Set(
      (raw ?? '')
        .split(/[,\s]+/)
        .map((part) => part.replace(/[₹]/g, '').trim())
        .filter(Boolean)
        .map((part) => Number.parseInt(part, 10))
        .filter((value) => Number.isFinite(value) && value > 0)
    ),
  ].sort((a, b) => a - b);
}

/** "₹10 to ₹500" when nobody named it, so a combination is never nameless. */
export function describeCombo(denominations: number[]): string {
  if (!denominations.length) return 'Empty combination';
  if (denominations.length === 1) return `₹${denominations[0]}`;
  return `₹${denominations[0]} to ₹${denominations[denominations.length - 1]}`;
}

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

  if (masterListMeta(listKey).combo) {
    const denominations = parseComboValue(trimmed);
    if (denominations.length < 2) {
      return { error: 'List at least two amounts, e.g. 100,200,500' };
    }
    if (denominations.length > MAX_COMBO_SIZE) {
      return { error: `A combination can hold at most ${MAX_COMBO_SIZE} notes` };
    }
    if (denominations.some((value) => value > 100000)) {
      return { error: 'That is larger than any banknote' };
    }
    return { value: denominations.join(',') };
  }

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
