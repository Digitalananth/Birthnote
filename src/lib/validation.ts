/**
 * Shared request validation.
 *
 * This module is deliberately free of server-only imports so the browser form
 * and the API route run the *same* rules — the client copy is for fast
 * feedback, the server copy is the one that actually protects the database.
 */

/**
 * One requested *date*, and every denomination wanted for it.
 *
 * A block is not a note: picking three denominations for one date asks for
 * three banknotes, each sourced, priced and found-or-not independently. The
 * expansion happens in `validateRequest`, so everything downstream — the API,
 * `order_items`, the emails, the admin — still deals in one row per note.
 */
export interface RequestItemValues {
  day: string;
  month: string;
  year: string;
  /** Rupee values as strings, matching what the checkboxes hold. */
  denominations: string[];
  giftRelationship?: string;
  /** The recipient's name. Required on every new request. */
  giftName?: string;
  giftFor?: string;
}

export interface RequestFormValues {
  name: string;
  email: string;
  /** Optional: only used when whatsappOptIn is also true. */
  whatsapp?: string;
  whatsappOptIn?: boolean;
  message?: string;
  items: RequestItemValues[];
}

/**
 * Upper bound on notes per order.
 *
 * Not a business rule so much as a guard: the form posts every row in one
 * request, and each one becomes a row to search by hand.
 *
 * It counts *notes*, not date blocks — twenty dates with one denomination each
 * and four dates with five each are the same twenty searches and the same
 * parcel, so they cost the same allowance.
 */
export const MAX_ITEMS_PER_ORDER = 20;

/**
 * The note values a customer may ask for, in rupees.
 *
 * Single source of truth for the <select> options and the server-side
 * membership check, so the two can never drift apart.
 */
/**
 * The option lists a submission is checked against.
 *
 * They come from the master_options table (see `src/lib/master-options.ts`),
 * not from a constant here, because an admin edits them. Optional: when it is
 * absent — a caller that has not loaded them — the shape of a value is still
 * checked, but not its membership of a list. The API route always passes them,
 * so the server's answer never depends on a caller remembering to.
 */
export interface AllowedOptions {
  denominations: readonly number[];
  giftRelationships: readonly string[];
}

export type RequestItemErrors = Partial<Record<keyof RequestItemValues, string>>;

export interface RequestFormErrors {
  name?: string;
  email?: string;
  whatsapp?: string;
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
  giftName: string | null;
  giftFor: string | null;
}

export interface ValidatedRequest {
  errors: RequestFormErrors;
  valid: boolean;
  /** Present only when valid. */
  normalised?: {
    name: string;
    email: string;
    whatsapp: string | null;
    whatsappOptIn: boolean;
    message: string | null;
    items: NormalisedItem[];
  };
}

/**
 * Validates one date block of the form, and expands it into its notes.
 *
 * Returns an array because one block can ask for several banknotes — the
 * shared date and recipient repeated once per denomination. Exported so the UI
 * can check a block as it changes.
 */
export function validateRequestItem(
  values: Partial<RequestItemValues>,
  now = new Date(),
  allowed?: AllowedOptions
): { errors: RequestItemErrors; normalised?: NormalisedItem[] } {
  const errors: RequestItemErrors = {};

  const dayRaw = (values.day ?? '').trim();
  const monthRaw = (values.month ?? '').trim();
  const yearRaw = (values.year ?? '').trim();
  const giftRelationship = (values.giftRelationship ?? '').trim();
  const giftName = (values.giftName ?? '').trim();
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

  // Ticking the same value twice is not an error, it is one note — a repeat
  // can only come from a mangled payload, and refusing the whole order over it
  // would be pedantry. Sorted so the notes come out in a predictable order
  // whatever sequence the boxes were ticked in.
  const denominations = [
    ...new Set(
      (Array.isArray(values.denominations) ? values.denominations : [])
        .map((value) => Number.parseInt(String(value).trim(), 10))
        .filter((value) => !Number.isNaN(value))
    ),
  ].sort((a, b) => a - b);

  if (!denominations.length) {
    errors.denominations = 'Choose at least one denomination';
  } else if (denominations.some((value) => value < 1)) {
    errors.denominations = 'Choose from the listed denominations';
  } else if (allowed && denominations.some((value) => !allowed.denominations.includes(value))) {
    errors.denominations = 'Choose from the listed denominations';
  }

  // Who the note is for is no longer an afterthought: the three fields below
  // are what goes on the gift card and what the admin searches by, and a note
  // found for nobody in particular is a note nobody can hand over. Required
  // for new requests only — orders placed before this rule keep their blanks.
  if (!giftRelationship) {
    errors.giftRelationship = 'Choose who this note is for';
  } else if (giftRelationship.length > 40) {
    errors.giftRelationship = 'Choose one of the listed options';
  } else if (allowed && !allowed.giftRelationships.includes(giftRelationship)) {
    errors.giftRelationship = 'Choose one of the listed options';
  }
  if (!giftName) {
    errors.giftName = 'Enter their name';
  } else if (giftName.length > 160) {
    errors.giftName = 'Keep this under 160 characters';
  }
  if (!giftFor) {
    errors.giftFor = 'Tell us the occasion';
  } else if (giftFor.length > 160) {
    errors.giftFor = 'Keep this under 160 characters';
  }

  if (Object.keys(errors).length) return { errors };

  const dd = String(day).padStart(2, '0');
  const mm = String(month).padStart(2, '0');
  return {
    errors,
    // One note per denomination, sharing the date and the recipient.
    normalised: denominations.map((denomination) => ({
      noteDate: `${fullYear}-${mm}-${dd}`,
      displayDate: `${dd}/${mm}/${yearRaw}`,
      denomination,
      giftRelationship: giftRelationship || null,
      giftName: giftName || null,
      giftFor: giftFor || null,
    })),
  };
}

export function validateRequest(
  values: Partial<RequestFormValues>,
  now = new Date(),
  allowed?: AllowedOptions
): ValidatedRequest {
  const errors: RequestFormErrors = {};

  const name = (values.name ?? '').trim();
  const email = (values.email ?? '').trim().toLowerCase();
  const message = (values.message ?? '').trim();
  const whatsapp = (values.whatsapp ?? '').replace(/[\s\-()]/g, '');
  // Consent without a number, or a number without consent, are both just "no".
  const whatsappOptIn = Boolean(values.whatsappOptIn) && Boolean(whatsapp);
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

  // Only complain when they actually asked for WhatsApp updates.
  if (values.whatsappOptIn && !whatsapp) {
    errors.whatsapp = 'Add a WhatsApp number, or untick the box';
  } else if (whatsapp && !/^\+?\d{8,15}$/.test(whatsapp)) {
    errors.whatsapp = 'Enter a valid WhatsApp number';
  }

  if (!rows.length) errors.items = 'Add at least one date';

  const itemErrors: Record<number, RequestItemErrors> = {};
  const items: NormalisedItem[] = [];
  // Every block is validated, not just the first twenty: the cap is on notes,
  // and how many notes a block is worth is only known after it has been
  // expanded. Slicing the rows first would have hidden a typo in block 21 of
  // an order that was under the cap anyway.
  rows.forEach((row, index) => {
    const result = validateRequestItem(row, now, allowed);
    if (result.normalised) items.push(...result.normalised);
    else itemErrors[index] = result.errors;
  });
  if (Object.keys(itemErrors).length) errors.itemErrors = itemErrors;

  if (items.length > MAX_ITEMS_PER_ORDER) {
    errors.items =
      `That comes to ${items.length} notes, and we can take ${MAX_ITEMS_PER_ORDER} in one order — ` +
      'remove a date or a denomination, or email us and we will handle it by hand';
  }

  // The same date *and* denomination twice in one order is almost always a
  // mis-click — two blocks for one date — and it would send the admin hunting
  // for a note they already found. Within a block the duplicate is silently
  // collapsed instead; there it can only be a mangled payload, never a
  // deliberate second note.
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
    !errors.name &&
    !errors.email &&
    !errors.whatsapp &&
    !errors.message &&
    !errors.items &&
    !errors.itemErrors;
  if (!valid) return { errors, valid };

  return {
    errors,
    valid,
    normalised: {
      name,
      email,
      whatsapp: whatsapp || null,
      whatsappOptIn,
      message: message || null,
      items,
    },
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
