/**
 * Shared request validation.
 *
 * This module is deliberately free of server-only imports so the browser form
 * and the API route run the *same* rules — the client copy is for fast
 * feedback, the server copy is the one that actually protects the database.
 */

/** One requested note. An order carries one or more of these. */
export interface RequestItemValues {
  day: string;
  month: string;
  year: string;
  denomination: string;
  giftRelationship?: string;
  giftFor?: string;
}

export interface RequestFormValues {
  name: string;
  email: string;
  message?: string;
  items: RequestItemValues[];
}

/**
 * Upper bound on notes per order.
 *
 * Not a business rule so much as a guard: the form posts every row in one
 * request, and each one becomes a row to search by hand.
 */
export const MAX_ITEMS_PER_ORDER = 20;

/**
 * The note values a customer may ask for, in rupees.
 *
 * Single source of truth for the <select> options and the server-side
 * membership check, so the two can never drift apart.
 */
export const DENOMINATIONS = [1, 2, 5, 10, 20, 50, 100, 200, 500] as const;

export const GIFT_RELATIONSHIPS = [
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
] as const;

export type GiftRelationship = (typeof GIFT_RELATIONSHIPS)[number];

export type RequestItemErrors = Partial<Record<keyof RequestItemValues, string>>;

export interface RequestFormErrors {
  name?: string;
  email?: string;
  message?: string;
  /** Whole-order problems: no rows, too many, duplicates. */
  items?: string;
  /** Per-row errors, keyed by the row's index in the form. */
  itemErrors?: Record<number, RequestItemErrors>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Expands a two-digit year to a four-digit one.
 *
 * Banknote dates are historical, so a two-digit year that would land in the
 * future is read as the previous century: in 2026, "87" is 1987 and "24" is
 * 2024, but "99" is 1999 rather than 2099.
 */
export function expandYear(twoDigit: string, now = new Date()): number {
  const yy = Number.parseInt(twoDigit, 10);
  const currentCentury = Math.floor(now.getFullYear() / 100) * 100;
  const candidate = currentCentury + yy;
  return candidate > now.getFullYear() ? candidate - 100 : candidate;
}

/** True only for dates that actually exist — rejects 31/02 and 31/04. */
export function isRealDate(day: number, month: number, fullYear: number): boolean {
  const date = new Date(Date.UTC(fullYear, month - 1, day));
  return (
    date.getUTCFullYear() === fullYear &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export interface NormalisedItem {
  /** YYYY-MM-DD, for the DATE column. */
  noteDate: string;
  /** DD/MM/YY, the format shown to the customer. */
  displayDate: string;
  denomination: number;
  giftRelationship: string | null;
  giftFor: string | null;
}

export interface ValidatedRequest {
  errors: RequestFormErrors;
  valid: boolean;
  /** Present only when valid. */
  normalised?: {
    name: string;
    email: string;
    message: string | null;
    items: NormalisedItem[];
  };
}

/** Validates one row of the form. Exported so the UI can check a row as it changes. */
export function validateRequestItem(
  values: Partial<RequestItemValues>,
  now = new Date()
): { errors: RequestItemErrors; normalised?: NormalisedItem } {
  const errors: RequestItemErrors = {};

  const dayRaw = (values.day ?? '').trim();
  const monthRaw = (values.month ?? '').trim();
  const yearRaw = (values.year ?? '').trim();
  const denominationRaw = (values.denomination ?? '').trim();
  const giftRelationship = (values.giftRelationship ?? '').trim();
  const giftFor = (values.giftFor ?? '').trim();

  const day = Number.parseInt(dayRaw, 10);
  const month = Number.parseInt(monthRaw, 10);

  if (!dayRaw || Number.isNaN(day) || day < 1 || day > 31) {
    errors.day = 'Enter a valid day (01–31)';
  }
  if (!monthRaw || Number.isNaN(month) || month < 1 || month > 12) {
    errors.month = 'Enter a valid month (01–12)';
  }
  if (!/^\d{2}$/.test(yearRaw)) {
    errors.year = 'Enter a 2-digit year (e.g. 87)';
  }

  let fullYear = 0;
  if (!errors.day && !errors.month && !errors.year) {
    fullYear = expandYear(yearRaw, now);
    if (!isRealDate(day, month, fullYear)) {
      errors.day = 'That date does not exist';
    } else if (Date.UTC(fullYear, month - 1, day) > now.getTime()) {
      errors.year = 'Choose a date in the past';
    }
  }

  const denomination = Number.parseInt(denominationRaw, 10);
  if (!denominationRaw) {
    errors.denomination = 'Choose a denomination';
  } else if (!DENOMINATIONS.includes(denomination as (typeof DENOMINATIONS)[number])) {
    errors.denomination = 'Choose one of the listed denominations';
  }

  if (giftRelationship && !GIFT_RELATIONSHIPS.includes(giftRelationship as GiftRelationship)) {
    errors.giftRelationship = 'Choose one of the listed options';
  }
  if (giftFor.length > 160) {
    errors.giftFor = 'Keep this under 160 characters';
  }

  if (Object.keys(errors).length) return { errors };

  const dd = String(day).padStart(2, '0');
  const mm = String(month).padStart(2, '0');
  return {
    errors,
    normalised: {
      noteDate: `${fullYear}-${mm}-${dd}`,
      displayDate: `${dd}/${mm}/${yearRaw}`,
      denomination,
      giftRelationship: giftRelationship || null,
      giftFor: giftFor || null,
    },
  };
}

export function validateRequest(
  values: Partial<RequestFormValues>,
  now = new Date()
): ValidatedRequest {
  const errors: RequestFormErrors = {};

  const name = (values.name ?? '').trim();
  const email = (values.email ?? '').trim().toLowerCase();
  const message = (values.message ?? '').trim();
  const rows = Array.isArray(values.items) ? values.items : [];

  if (!name) {
    errors.name = 'Please enter your name';
  } else if (name.length > 160) {
    errors.name = 'Name is too long';
  }

  if (!email) {
    errors.email = 'Enter your email address';
  } else if (!EMAIL_RE.test(email) || email.length > 190) {
    errors.email = 'Enter a valid email address';
  }

  if (message.length > 2000) {
    errors.message = 'Keep your message under 2000 characters';
  }

  if (!rows.length) {
    errors.items = 'Add at least one date';
  } else if (rows.length > MAX_ITEMS_PER_ORDER) {
    errors.items = `That is more than ${MAX_ITEMS_PER_ORDER} notes — email us and we will handle it by hand`;
  }

  const itemErrors: Record<number, RequestItemErrors> = {};
  const items: NormalisedItem[] = [];
  rows.slice(0, MAX_ITEMS_PER_ORDER).forEach((row, index) => {
    const result = validateRequestItem(row, now);
    if (result.normalised) items.push(result.normalised);
    else itemErrors[index] = result.errors;
  });
  if (Object.keys(itemErrors).length) errors.itemErrors = itemErrors;

  // The same date twice in one order is almost always a mis-click, and it
  // would send the admin hunting for a note they already found.
  const seen = new Set<string>();
  for (const item of items) {
    const key = `${item.noteDate}|${item.denomination}`;
    if (seen.has(key)) {
      errors.items = 'That order lists the same date and denomination more than once';
      break;
    }
    seen.add(key);
  }

  const valid =
    !errors.name && !errors.email && !errors.message && !errors.items && !errors.itemErrors;
  if (!valid) return { errors, valid };

  return {
    errors,
    valid,
    normalised: { name, email, message: message || null, items },
  };
}

/** Loose shape check for a reference before it reaches the database. */
export function isValidReference(reference: string): boolean {
  return /^BN-\d{6}-[A-Z0-9]{4,8}$/.test(reference.trim().toUpperCase());
}

/**
 * Formats a minor-unit amount (paise) as rupees.
 *
 * en-IN gives the Indian digit grouping — ₹1,24,900, not ₹124,900 — which is
 * what a customer here expects to see.
 */
export function formatPrice(paise: number, currency = 'INR'): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: paise % 100 === 0 ? 0 : 2,
  }).format(paise / 100);
}
