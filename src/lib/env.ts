/**
 * Centralised, validated access to server environment variables.
 *
 * Every server module reads config through here so a missing variable fails
 * loudly at the call site instead of producing a confusing runtime error
 * deep inside mysql2 / nodemailer / the PhonePe client.
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

  /**
   * PhonePe, which takes the money.
   *
   * All five values are secret, which is the first difference from the
   * gateway this replaced: Razorpay's key id went to the browser to open a
   * modal, but PhonePe hosts the payment page itself and the browser is only
   * ever handed a URL. Nothing here is `NEXT_PUBLIC_` and nothing here should
   * ever become so.
   *
   * `clientVersion` is not a version of ours. PhonePe issues it alongside the
   * id and secret, and sending the wrong one fails the token request rather
   * than falling back to a default — so it is `required`, not optional with a
   * guess of `1`.
   *
   * The webhook credentials are a *different* pair from the client ones: they
   * are whatever was typed into the dashboard when the webhook endpoint was
   * registered. PhonePe hashes them into a constant Authorization header.
   * Using the client secret for either verifies nothing and fails closed,
   * which is the good case; the bad case is assuming they are the same and
   * never testing it.
   */
  phonepe: {
    clientId: () => required('PHONEPE_CLIENT_ID'),
    clientSecret: () => required('PHONEPE_CLIENT_SECRET'),
    clientVersion: () => required('PHONEPE_CLIENT_VERSION'),
    webhookUsername: () => required('PHONEPE_WEBHOOK_USERNAME'),
    webhookPassword: () => required('PHONEPE_WEBHOOK_PASSWORD'),
    configured: () =>
      Boolean(optional('PHONEPE_CLIENT_ID')) && Boolean(optional('PHONEPE_CLIENT_SECRET')),
    /**
     * Which PhonePe the site is talking to.
     *
     * Sandbox payments look perfect and settle nothing, and unlike Razorpay —
     * whose test keys were prefixed `rzp_test_` and so gave themselves away —
     * PhonePe credentials carry no mark saying which environment they belong
     * to. Nothing in the app can tell the difference at runtime: a sandbox
     * payment succeeds. So it is stated explicitly rather than inferred, and
     * published on /api/health beside the MSG91 template-id check, which
     * exists for the same reason.
     *
     * Defaulting to sandbox is the safe direction of the two: a live site
     * left unconfigured refuses money it cannot settle, rather than accepting
     * money that was never real.
     */
    mode: (): 'production' | 'sandbox' =>
      optional('PHONEPE_ENV', 'sandbox').toLowerCase() === 'production' ? 'production' : 'sandbox',
  },

  smtp: {
    host: optional('SMTP_HOST', 'smtp.gmail.com'),
    port: int('SMTP_PORT', 587),
    secure: bool('SMTP_SECURE', false),
    user: optional('SMTP_USER'),
    password: optional('SMTP_PASSWORD'),
    from: optional('MAIL_FROM', 'My Lucky Dates <no-reply@birthnote.com>'),
    replyTo: optional('MAIL_REPLY_TO'),
    /** When false (or credentials missing) emails are logged, not sent. */
    enabled: () => bool('MAIL_ENABLED', true) && Boolean(optional('SMTP_USER')),
    /**
     * Whether the domain we send *as* is the domain we authenticate *as*.
     *
     * Gmail signs outgoing mail with DKIM for the authenticated account's
     * domain. Put a MAIL_FROM on a different domain and the signature no
     * longer aligns with the From header, which is exactly the condition
     * DMARC exists to catch and the commonest reason otherwise-ordinary mail
     * is filed as spam. Nothing in the app can detect that at send time —
     * SMTP accepts the message either way — so the comparison is published on
     * /api/health, where it can be checked against a message that landed in
     * a spam folder.
     */
    fromAligned: (): boolean | null => {
      const domainOf = (value: string) => value.match(/[^\s<@]+@([^\s>]+)/)?.[1]?.toLowerCase();
      const user = optional('SMTP_USER');
      const from = optional('MAIL_FROM', 'My Lucky Dates <no-reply@birthnote.com>');
      const userDomain = user ? domainOf(user) : undefined;
      const fromDomain = domainOf(from);
      if (!userDomain || !fromDomain) return null;
      return userDomain === fromDomain;
    },
  },

  /**
   * Bootstrap credentials for the very first admin account.
   *
   * Read only by src/server/bootstrap.ts, and only when admin_users is empty.
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

  /**
   * MSG91, which delivers the one-time codes people sign in with.
   *
   * The code itself is generated and verified here, not by MSG91: their OTP
   * endpoint accepts an `otp` parameter, so we keep the hash, the expiry and
   * the attempt limit in our own database and use MSG91 purely as the
   * delivery channel. That keeps sign-in working the same way whichever SMS
   * provider is in front of it.
   *
   * Leave MSG91_AUTH_KEY blank and codes are logged to the server console
   * instead of sent, exactly as MAIL_ENABLED does for email — which is what
   * makes local development possible without spending money on SMS.
   */
  msg91: {
    /** Overridable so tests can point at a stub instead of the real API. */
    apiBase: optional('MSG91_API_BASE', 'https://control.msg91.com').replace(/\/+$/, ''),
    authKey: () => required('MSG91_AUTH_KEY'),
    /** The DLT-approved OTP template registered in the MSG91 dashboard. */
    templateId: () => required('MSG91_TEMPLATE_ID'),
    senderId: optional('MSG91_SENDER_ID'),
    /** Sent as `otp_expiry` so MSG91's own text matches what we enforce. */
    otpExpiryMinutes: int('MSG91_OTP_EXPIRY_MINUTES', 10),
    /**
     * Whether MSG91_TEMPLATE_ID has the shape MSG91 wants: their own 24-hex
     * template id, not the long numeric DLT id issued by the regulator.
     *
     * This is the commonest way sign-in by SMS breaks silently — MSG91 accepts
     * every send with a wrong id and drops it at submission — and the warning
     * `sendOtpSms` prints goes to stdout, which Hostinger does not expose. So
     * the same judgement is published on /api/health, where it can actually be
     * read. 'unset' rather than false when there is no id at all, because the
     * two have different fixes.
     */
    templateIdFormat: (): 'ok' | 'suspect' | 'unset' => {
      const id = optional('MSG91_TEMPLATE_ID');
      if (!id) return 'unset';
      return /^[0-9a-f]{24}$/i.test(id) ? 'ok' : 'suspect';
    },
    enabled: () =>
      bool('MSG91_ENABLED', true) &&
      Boolean(optional('MSG91_AUTH_KEY')) &&
      Boolean(optional('MSG91_TEMPLATE_ID')),
  },

  /**
   * Sign-in by one-time code.
   *
   * `defaultCountryCode` is what makes a bare ten-digit Indian mobile number
   * unambiguous — see `normalisePhoneNumber` in src/lib/auth-validation.ts.
   */
  auth: {
    // NEXT_PUBLIC_ because the login form normalises the number before it is
    // sent, so the browser and the API must agree on the country code. One
    // variable rather than two keeps them from drifting apart.
    defaultCountryCode: optional('NEXT_PUBLIC_AUTH_DEFAULT_COUNTRY_CODE', '91'),
    otpTtlSeconds: int('AUTH_OTP_TTL_SECONDS', 10 * 60),
    otpMaxAttempts: int('AUTH_OTP_MAX_ATTEMPTS', 5),
    /** How long before the same number may ask for another code. */
    otpResendSeconds: int('AUTH_OTP_RESEND_SECONDS', 45),
  },

  /**
   * Shiprocket, which moves the parcels.
   *
   * There are no API keys: you post the dashboard login to /auth/login and get
   * a bearer token good for about ten days. Repeated logins are throttled
   * hard, so the token is cached in `app_settings` where every worker can see
   * it — see src/lib/shiprocket.ts. The password stays here and is never
   * written to the database.
   *
   * `webhookToken` is whatever you type into Shiprocket's webhook settings
   * page; they send it back as an `x-api-key` header. It is a shared secret
   * compared byte for byte, not a signature over the body — there is nothing
   * to verify cryptographically, which is worth knowing when reasoning about
   * what the webhook actually proves.
   */
  shiprocket: {
    /** Overridable so tests can point at a stub instead of the real API. */
    apiBase: optional('SHIPROCKET_API_BASE', 'https://apiv2.shiprocket.in/v1/external').replace(
      /\/+$/,
      ''
    ),
    email: () => required('SHIPROCKET_EMAIL'),
    password: () => required('SHIPROCKET_PASSWORD'),
    webhookToken: () => required('SHIPROCKET_WEBHOOK_TOKEN'),
    /**
     * Whether the webhook has a secret at all.
     *
     * Separate from `configured` because the webhook is reachable whether or
     * not the rest of Shiprocket is set up, and `webhookToken()` throws when
     * unset. Reading it inside the handler without checking this first turns
     * an unauthenticated request into a 500 — which tells the caller the
     * endpoint exists and is misconfigured, and makes Shiprocket retry a
     * request that can never succeed. The route refuses everything instead,
     * exactly as /api/cron/sweep does with its own secret.
     */
    webhookEnabled: () => Boolean(optional('SHIPROCKET_WEBHOOK_TOKEN')),
    configured: () =>
      Boolean(optional('SHIPROCKET_EMAIL')) && Boolean(optional('SHIPROCKET_PASSWORD')),
  },

  /**
   * The shared secret the scheduled sweep authenticates with.
   *
   * The sweep runs over HTTP because Hostinger prunes the deployment to .next
   * and node_modules — there is no scripts/ directory on the server to run a
   * job from, and the app is the only thing holding the database credentials.
   * `enabled` is false when unset, and the route then refuses every request
   * rather than running unauthenticated.
   */
  cron: {
    secret: () => required('CRON_SECRET'),
    enabled: () => Boolean(optional('CRON_SECRET')),
  },

  /** Order total in paise. ₹2,499 by default — set the real price in .env. */
  pricePaise: int('BANKNOTE_PRICE_PAISE', 249900),
};
