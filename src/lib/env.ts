/**
 * Centralised, validated access to server environment variables.
 *
 * Every server module reads config through here so a missing variable fails
 * loudly at the call site instead of producing a confusing runtime error
 * deep inside mysql2 / nodemailer / stripe.
 */

function optional(name: string, fallback = ''): string {
  return process.env[name]?.trim() || fallback;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env and fill it in.`
    );
  }
  return value;
}

function int(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw === 'true' || raw === '1' || raw === 'yes';
}

export const env = {
  siteUrl: optional('NEXT_PUBLIC_SITE_URL', 'http://localhost:4028').replace(/\/+$/, ''),

  mysql: {
    host: optional('MYSQL_HOST', 'localhost'),
    port: int('MYSQL_PORT', 3306),
    database: () => required('MYSQL_DATABASE'),
    user: () => required('MYSQL_USER'),
    password: optional('MYSQL_PASSWORD'),
    connectionLimit: int('MYSQL_CONNECTION_LIMIT', 5),
  },

  stripe: {
    secretKey: () => required('STRIPE_SECRET_KEY'),
    webhookSecret: () => required('STRIPE_WEBHOOK_SECRET'),
    configured: () => Boolean(optional('STRIPE_SECRET_KEY')),
  },

  smtp: {
    host: optional('SMTP_HOST', 'smtp.gmail.com'),
    port: int('SMTP_PORT', 587),
    secure: bool('SMTP_SECURE', false),
    user: optional('SMTP_USER'),
    password: optional('SMTP_PASSWORD'),
    from: optional('MAIL_FROM', 'BirthNote <no-reply@birthnote.com>'),
    replyTo: optional('MAIL_REPLY_TO'),
    /** When false (or credentials missing) emails are logged, not sent. */
    enabled: () => bool('MAIL_ENABLED', true) && Boolean(optional('SMTP_USER')),
  },

  /**
   * Bootstrap credentials for the very first admin account.
   *
   * Read only by scripts/migrate.mjs, and only when admin_users is empty.
   * Admins are real records now — there is no shared password, and admin
   * sessions carry an opaque token, so there is nothing left to sign.
   */
  admin: {
    bootstrapEmail: () => optional('ADMIN_EMAIL'),
    bootstrapPassword: () => optional('ADMIN_PASSWORD'),
  },

  /**
   * WhatsApp via the Meta Cloud API.
   *
   * Business-initiated messages must use templates approved by Meta in
   * advance, so the template *names* live here: the wording is edited in
   * Meta's dashboard, and this code only supplies the placeholder values.
   * Leave WHATSAPP_ACCESS_TOKEN blank to log messages instead of sending
   * them, exactly as MAIL_ENABLED does for email.
   */
  whatsapp: {
    /**
     * Overridable so the integration can be pointed at a local stub in tests
     * or at an outbound proxy, without touching the sending code.
     */
    apiBase: optional('WHATSAPP_API_BASE', 'https://graph.facebook.com').replace(/\/+$/, ''),
    apiVersion: optional('WHATSAPP_API_VERSION', 'v21.0'),
    phoneNumberId: () => required('WHATSAPP_PHONE_NUMBER_ID'),
    accessToken: () => required('WHATSAPP_ACCESS_TOKEN'),
    languageCode: optional('WHATSAPP_LANGUAGE', 'en'),
    /** Most numbers here are Indian, so a bare 10-digit number gets +91. */
    defaultCountryCode: optional('WHATSAPP_DEFAULT_COUNTRY_CODE', '91'),
    templates: {
      received: optional('WHATSAPP_TEMPLATE_RECEIVED', 'order_received'),
      confirmed: optional('WHATSAPP_TEMPLATE_CONFIRMED', 'order_confirmed'),
      unavailable: optional('WHATSAPP_TEMPLATE_UNAVAILABLE', 'order_unavailable'),
      paid: optional('WHATSAPP_TEMPLATE_PAID', 'order_paid'),
      shipped: optional('WHATSAPP_TEMPLATE_SHIPPED', 'order_shipped'),
    },
    enabled: () =>
      bool('WHATSAPP_ENABLED', true) &&
      Boolean(optional('WHATSAPP_ACCESS_TOKEN')) &&
      Boolean(optional('WHATSAPP_PHONE_NUMBER_ID')),
  },

  /** Order total in paise. ₹2,499 by default — set the real price in .env. */
  pricePaise: int('BANKNOTE_PRICE_PAISE', 249900),
};
