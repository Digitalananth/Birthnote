/**
 * Shared request validation.
 *
 * This module is deliberately free of server-only imports so the browser form
 * and the API route run the *same* rules — the client copy is for fast
 * feedback, the server copy is the one that actually protects the database.
 */

export interface RequestFormValues {
  day: string;
  month: string;
  year: string;
  name: string;
  email: string;
  giftFor?: string;
  message?: string;
}

export type RequestFormErrors = Partial<Record<keyof RequestFormValues, string>>;

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

export interface ValidatedRequest {
  errors: RequestFormErrors;
  valid: boolean;
  /** Present only when valid. */
  normalised?: {
    day: string;
    month: string;
    year: string;
    fullYear: number;
    /** YYYY-MM-DD, for the DATE column. */
    noteDate: string;
    /** DD/MM/YY, the format shown to the customer. */
    displayDate: string;
    name: string;
    email: string;
    giftFor: string | null;
    message: string | null;
  };
}

export function validateRequest(
  values: Partial<RequestFormValues>,
  now = new Date()
): ValidatedRequest {
  const errors: RequestFormErrors = {};

  const dayRaw = (values.day ?? '').trim();
  const monthRaw = (values.month ?? '').trim();
  const yearRaw = (values.year ?? '').trim();
  const name = (values.name ?? '').trim();
  const email = (values.email ?? '').trim().toLowerCase();
  const giftFor = (values.giftFor ?? '').trim();
  const message = (values.message ?? '').trim();

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
    } else {
      const requested = Date.UTC(fullYear, month - 1, day);
      if (requested > now.getTime()) {
        errors.year = 'Choose a date in the past';
      }
    }
  }

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

  if (giftFor.length > 160) {
    errors.giftFor = 'Keep this under 160 characters';
  }
  if (message.length > 2000) {
    errors.message = 'Keep your message under 2000 characters';
  }

  const valid = Object.keys(errors).length === 0;
  if (!valid) return { errors, valid };

  const dd = String(day).padStart(2, '0');
  const mm = String(month).padStart(2, '0');

  return {
    errors,
    valid,
    normalised: {
      day: dd,
      month: mm,
      year: yearRaw,
      fullYear,
      noteDate: `${fullYear}-${mm}-${dd}`,
      displayDate: `${dd}/${mm}/${yearRaw}`,
      name,
      email,
      giftFor: giftFor || null,
      message: message || null,
    },
  };
}

/** Loose shape check for a reference before it reaches the database. */
export function isValidReference(reference: string): boolean {
  return /^BN-\d{6}-[A-Z0-9]{4,8}$/.test(reference.trim().toUpperCase());
}

export function formatPrice(pence: number, currency = 'GBP'): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(pence / 100);
}
