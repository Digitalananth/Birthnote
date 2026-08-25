/**
 * Shared validation for the account forms.
 *
 * Like `validation.ts`, this module imports nothing server-only so the browser
 * and the API route enforce identical rules — the client copy is for fast
 * feedback, the server copy is the one that protects the database.
 *
 * Customers sign in with a one-time code sent to a mobile number or an email
 * address, so the password rules here now serve the admin panel alone — admins
 * still sign in with an address and a password, and `validateNewPassword` is what their reset form
 * and their change-password form check against.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** E.164-ish: optional +, 8–15 digits. Spaces and dashes are stripped first. */
const PHONE_RE = /^\+?\d{8,15}$/;

/** Admin passwords only — customer accounts have none. */
export const PASSWORD_MIN = 8;
/**
 * scrypt cost is linear in input length, so an unbounded password is a cheap
 * way to pin the CPU. 200 characters is far beyond any real passphrase.
 */
export const PASSWORD_MAX = 200;

export type FieldErrors<T> = Partial<Record<keyof T, string>>;

export function normaliseEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** Strips the spaces, dashes and brackets people type into phone fields. */
export function normalisePhone(value: string): string {
  return value.replace(/[\s\-()]/g, '');
}

/**
 * The country code a bare local number is assumed to belong to.
 *
 * Read from the environment through NEXT_PUBLIC_ so this module — which both
 * the browser and the API import — resolves it identically on each side. A
 * number normalised one way in the form and another way on the server would
 * mean the code was sent to one row and looked up against a different one.
 */
export const DEFAULT_COUNTRY_CODE =
  process.env.NEXT_PUBLIC_AUTH_DEFAULT_COUNTRY_CODE?.trim() || '91';

/** Digits only, no leading +. This is what `users.phone` stores. */
export const CANONICAL_PHONE_RE = /^\d{10,15}$/;

/**
 * Reduces anything a person might type into the one form the database keys on.
 *
 * The mobile number is the account identifier now, so "+91 98765 43210",
 * "098765 43210" and "9876543210" have to become the same string — otherwise
 * the same customer ends up with three accounts. Returns null for anything
 * that cannot be a real number, so a typo is rejected at the form rather than
 * sent as an SMS to whoever owns the number it became.
 */
export function normalisePhoneNumber(raw: string | null | undefined): string | null {
  let digits = (raw ?? '').replace(/\D/g, '');
  if (!digits) return null;

  // 00 is the international prefix in much of the world.
  if (digits.startsWith('00')) digits = digits.slice(2);

  // A bare local number gets the default country code. India's mobile numbers
  // are ten digits, which is what makes this unambiguous here.
  if (digits.length === 10) digits = `${DEFAULT_COUNTRY_CODE}${digits}`;

  // A single leading 0 before a local number is a domestic trunk prefix.
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = `${DEFAULT_COUNTRY_CODE}${digits.slice(1)}`;
  }

  return CANONICAL_PHONE_RE.test(digits) ? digits : null;
}

/** Renders a stored number back for display: `919876543210` → `+91 98765 43210`. */
export function formatPhoneNumber(stored: string | null | undefined): string {
  if (!stored) return '';
  const digits = stored.replace(/\D/g, '');
  if (!digits) return '';
  if (
    digits.startsWith(DEFAULT_COUNTRY_CODE) &&
    digits.length === DEFAULT_COUNTRY_CODE.length + 10
  ) {
    const local = digits.slice(DEFAULT_COUNTRY_CODE.length);
    return `+${DEFAULT_COUNTRY_CODE} ${local.slice(0, 5)} ${local.slice(5)}`;
  }
  return `+${digits}`;
}

export const OTP_LENGTH = 6;

/**
 * Which of the two things a person can sign in with they gave us, and
 * therefore where the code is sent.
 */
export type IdentifierChannel = 'sms' | 'email';

export interface IdentifierValues {
  identifier: string;
}

/**
 * Decides whether what someone typed is an address or a number.
 *
 * The `@` is the whole test, and it is enough: no phone number contains one
 * and no address omits it. Guessing any other way — counting digits, say —
 * would send a code for `+91…` to an SMS gateway when the person meant an
 * address like `4155551234@example.com`.
 */
export function identifierChannel(raw: string): IdentifierChannel {
  return raw.includes('@') ? 'email' : 'sms';
}

/**
 * Step one of signing in: the number or address a code will be sent to.
 *
 * Returns the identifier in the exact form the database keys on — canonical
 * digits for a number, lowercased and trimmed for an address — because the
 * code is issued against this string and looked up against it again on the way
 * back. Normalising differently on either side would file the code under one
 * key and check it against another.
 */
export function validateIdentifierEntry(values: Partial<IdentifierValues>): {
  valid: boolean;
  errors: FieldErrors<IdentifierValues>;
  normalised?: { identifier: string; channel: IdentifierChannel };
} {
  const raw = (values.identifier ?? '').trim();
  if (!raw) {
    return { valid: false, errors: { identifier: 'Enter your mobile number or email address' } };
  }

  if (identifierChannel(raw) === 'email') {
    const email = normaliseEmail(raw);
    const emailError = checkEmail(email);
    if (emailError) return { valid: false, errors: { identifier: emailError } };
    return { valid: true, errors: {}, normalised: { identifier: email, channel: 'email' } };
  }

  const phone = normalisePhoneNumber(raw);
  if (!phone) return { valid: false, errors: { identifier: 'Enter a valid mobile number' } };
  return { valid: true, errors: {}, normalised: { identifier: phone, channel: 'sms' } };
}

export interface OtpValues {
  identifier: string;
  code: string;
  name?: string;
  /** The *other* contact detail, offered on a first sign-in. Always optional. */
  email?: string;
  phone?: string;
}

/**
 * Step two: the code, plus the details a brand-new account needs.
 *
 * The identifier is re-validated here rather than trusted from step one — this
 * runs on the server too, where the two steps are separate requests and
 * nothing carries over between them but what the caller sends.
 *
 * Name and the second contact detail are validated only when supplied:
 * someone signing back in sends neither, and both stay optional even on a
 * first sign-in. Whichever of `email`/`phone` the identifier already is takes
 * the identifier's value, so a caller cannot sign in with one address and
 * quietly claim a different one.
 */
export function validateOtpEntry(values: Partial<OtpValues>): {
  valid: boolean;
  errors: FieldErrors<OtpValues>;
  normalised?: {
    identifier: string;
    channel: IdentifierChannel;
    code: string;
    name: string;
    email: string | null;
    phone: string | null;
  };
} {
  const errors: FieldErrors<OtpValues> = {};

  const entry = validateIdentifierEntry({ identifier: values.identifier });
  if (!entry.valid) errors.identifier = entry.errors.identifier;

  const code = (values.code ?? '').replace(/\D/g, '');
  if (!code) errors.code = 'Enter the code we sent you';
  else if (code.length !== OTP_LENGTH) errors.code = `The code is ${OTP_LENGTH} digits`;

  const name = (values.name ?? '').trim();
  if (name) {
    const nameError = checkName(name);
    if (nameError) errors.name = nameError;
  }

  const channel = entry.normalised?.channel;

  let email = channel === 'email' ? (entry.normalised?.identifier ?? '') : '';
  if (channel === 'sms') {
    email = normaliseEmail(values.email ?? '');
    if (email) {
      const emailError = checkEmail(email);
      if (emailError) errors.email = emailError;
    }
  }

  let phone = channel === 'sms' ? (entry.normalised?.identifier ?? null) : null;
  if (channel === 'email' && (values.phone ?? '').trim()) {
    phone = normalisePhoneNumber(values.phone);
    if (!phone) errors.phone = 'Enter a valid mobile number';
  }

  if (Object.keys(errors).length || !entry.normalised) return { valid: false, errors };
  return {
    valid: true,
    errors,
    normalised: {
      identifier: entry.normalised.identifier,
      channel: entry.normalised.channel,
      code,
      name,
      email: email || null,
      phone: phone || null,
    },
  };
}

function checkEmail(email: string): string | undefined {
  if (!email) return 'Enter your email address';
  if (!EMAIL_RE.test(email) || email.length > 190) return 'Enter a valid email address';
  return undefined;
}

function checkPassword(password: string): string | undefined {
  if (!password) return 'Choose a password';
  if (password.length < PASSWORD_MIN) {
    return `Use at least ${PASSWORD_MIN} characters`;
  }
  if (password.length > PASSWORD_MAX) {
    return `Keep it under ${PASSWORD_MAX} characters`;
  }
  return undefined;
}

function checkName(name: string): string | undefined {
  if (!name) return 'Please enter your name';
  if (name.length > 160) return 'Name is too long';
  return undefined;
}

function checkOptionalPhone(phone: string, label: string): string | undefined {
  if (!phone) return undefined;
  if (!PHONE_RE.test(phone)) return `Enter a valid ${label} number`;
  return undefined;
}

/**
 * The editable part of an account.
 *
 * Deliberately no `phone`: the mobile number is the login identifier, so
 * changing it is changing who can sign in. Editing it here would mean anyone
 * with a borrowed open tab could point an account at their own phone and keep
 * it — proving the new number with a code is the only safe way to move it, and
 * until that exists the number is fixed at the value the account was created
 * with.
 *
 * The email address, by contrast, is now an optional extra rather than a
 * credential, so it changes freely and may be cleared.
 */
export interface ProfileValues {
  name: string;
  email?: string;
  whatsapp?: string;
}

export function validateProfile(values: Partial<ProfileValues>): {
  valid: boolean;
  errors: FieldErrors<ProfileValues>;
  normalised?: { name: string; email: string | null; whatsapp: string | null };
} {
  const name = (values.name ?? '').trim();
  const email = normaliseEmail(values.email ?? '');
  const whatsapp = normalisePhone(values.whatsapp ?? '');

  const errors: FieldErrors<ProfileValues> = {};
  const nameError = checkName(name);
  const whatsappError = checkOptionalPhone(whatsapp, 'WhatsApp');
  if (nameError) errors.name = nameError;
  if (whatsappError) errors.whatsapp = whatsappError;
  if (email) {
    const emailError = checkEmail(email);
    if (emailError) errors.email = emailError;
  }

  if (Object.keys(errors).length) return { valid: false, errors };
  return {
    valid: true,
    errors,
    normalised: { name, email: email || null, whatsapp: whatsapp || null },
  };
}

export interface NewPasswordValues {
  password: string;
  confirmPassword: string;
}

export function validateNewPassword(values: Partial<NewPasswordValues>): {
  valid: boolean;
  errors: FieldErrors<NewPasswordValues>;
} {
  const password = values.password ?? '';
  const confirmPassword = values.confirmPassword ?? '';

  const errors: FieldErrors<NewPasswordValues> = {};
  const passwordError = checkPassword(password);
  if (passwordError) errors.password = passwordError;
  else if (password !== confirmPassword) {
    errors.confirmPassword = 'The two passwords do not match';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/** Loose shape check for a reset token before it reaches the database. */
export function isValidResetToken(token: string): boolean {
  return /^[a-f0-9]{64}$/.test(token.trim());
}
