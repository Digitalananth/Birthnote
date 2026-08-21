/**
 * Shared validation for the account forms.
 *
 * Like `validation.ts`, this module imports nothing server-only so the browser
 * and the API route enforce identical rules — the client copy is for fast
 * feedback, the server copy is the one that protects the database.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** E.164-ish: optional +, 8–15 digits. Spaces and dashes are stripped first. */
const PHONE_RE = /^\+?\d{8,15}$/;

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

export interface SignupValues {
  name: string;
  email: string;
  password: string;
  phone?: string;
}

export interface ValidatedSignup {
  valid: boolean;
  errors: FieldErrors<SignupValues>;
  normalised?: { name: string; email: string; password: string; phone: string | null };
}

export function validateSignup(values: Partial<SignupValues>): ValidatedSignup {
  const name = (values.name ?? '').trim();
  const email = normaliseEmail(values.email ?? '');
  const password = values.password ?? '';
  const phone = normalisePhone(values.phone ?? '');

  const errors: FieldErrors<SignupValues> = {};
  const nameError = checkName(name);
  const emailError = checkEmail(email);
  const passwordError = checkPassword(password);
  const phoneError = checkOptionalPhone(phone, 'phone');
  if (nameError) errors.name = nameError;
  if (emailError) errors.email = emailError;
  if (passwordError) errors.password = passwordError;
  if (phoneError) errors.phone = phoneError;

  if (Object.keys(errors).length) return { valid: false, errors };
  return {
    valid: true,
    errors,
    normalised: { name, email, password, phone: phone || null },
  };
}

export interface LoginValues {
  email: string;
  password: string;
}

export function validateLogin(values: Partial<LoginValues>): {
  valid: boolean;
  errors: FieldErrors<LoginValues>;
  normalised?: { email: string; password: string };
} {
  const email = normaliseEmail(values.email ?? '');
  const password = values.password ?? '';

  const errors: FieldErrors<LoginValues> = {};
  if (!email) errors.email = 'Enter your email address';
  if (!password) errors.password = 'Enter your password';

  if (Object.keys(errors).length) return { valid: false, errors };
  return { valid: true, errors, normalised: { email, password } };
}

export interface ProfileValues {
  name: string;
  phone?: string;
  whatsapp?: string;
}

export function validateProfile(values: Partial<ProfileValues>): {
  valid: boolean;
  errors: FieldErrors<ProfileValues>;
  normalised?: { name: string; phone: string | null; whatsapp: string | null };
} {
  const name = (values.name ?? '').trim();
  const phone = normalisePhone(values.phone ?? '');
  const whatsapp = normalisePhone(values.whatsapp ?? '');

  const errors: FieldErrors<ProfileValues> = {};
  const nameError = checkName(name);
  const phoneError = checkOptionalPhone(phone, 'phone');
  const whatsappError = checkOptionalPhone(whatsapp, 'WhatsApp');
  if (nameError) errors.name = nameError;
  if (phoneError) errors.phone = phoneError;
  if (whatsappError) errors.whatsapp = whatsappError;

  if (Object.keys(errors).length) return { valid: false, errors };
  return {
    valid: true,
    errors,
    normalised: { name, phone: phone || null, whatsapp: whatsapp || null },
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
