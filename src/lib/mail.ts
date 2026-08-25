import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '@/lib/env';
import { availableItems, summariseOrder, type Order, type OrderItem } from '@/lib/orders';
import { formatPrice } from '@/lib/validation';

/**
 * Transactional email over plain SMTP (Gmail by default).
 *
 * Gmail requires an *App Password* — your normal account password will be
 * rejected. Create one at myaccount.google.com → Security → App passwords,
 * and note Gmail's ~500 messages/day cap. Set MAIL_ENABLED=false (or leave
 * SMTP_USER blank) to log emails to the console instead of sending them,
 * which is what local development should do.
 */
const globalForMail = globalThis as unknown as { birthnoteMailer?: Transporter };

function getTransport(): Transporter {
  if (!globalForMail.birthnoteMailer) {
    globalForMail.birthnoteMailer = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure, // false for 587 (STARTTLS), true for 465
      auth: { user: env.smtp.user, pass: env.smtp.password },
      pool: true,
      maxConnections: 2,
      rateDelta: 1000,
      rateLimit: 3,
    });
  }
  return globalForMail.birthnoteMailer;
}

interface MailPayload {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Sends an email, never throwing.
 *
 * Email is a side effect of an order, not part of it — a Gmail outage must
 * not roll back a paid order or return a 500 to the customer. Failures are
 * logged for follow-up and the caller carries on.
 */
/**
 * Sends one message. Never throws.
 *
 * Accepts null so a caller can hand over a message that had nowhere to go —
 * accounts identified by mobile number need not have an email address, and
 * `if (payload) await sendMail(payload)` at a dozen call sites is a dozen
 * chances to forget.
 */
export async function sendMail(payload: MailPayload | null): Promise<boolean> {
  if (!payload) return false;
  if (!env.smtp.enabled()) {
    console.info(
      `[mail:disabled] To: ${payload.to}\nSubject: ${payload.subject}\n\n${payload.text}\n`
    );
    return false;
  }
  try {
    await getTransport().sendMail({
      from: env.smtp.from,
      replyTo: env.smtp.replyTo || undefined,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    });
    return true;
  } catch (error) {
    console.error(`[mail:failed] ${payload.subject} → ${payload.to}`, error);
    return false;
  }
}

const BRAND = '#8B5A2B';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function layout(heading: string, bodyHtml: string, cta?: { label: string; url: string }) {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#F7F3EC;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#2B2119;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFDF9;border:1px solid #E8DFD2;border-radius:16px;overflow:hidden;">
        <tr><td style="height:4px;background:${BRAND};"></td></tr>
        <tr><td style="padding:36px 36px 28px;">
          <p style="margin:0 0 20px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${BRAND};font-weight:700;">BirthNote</p>
          <h1 style="margin:0 0 18px;font-size:24px;line-height:1.25;font-weight:800;">${escapeHtml(heading)}</h1>
          ${bodyHtml}
          ${
            cta
              ? `<p style="margin:28px 0 0;"><a href="${cta.url}" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;padding:13px 26px;border-radius:10px;font-weight:600;font-size:14px;">${escapeHtml(cta.label)}</a></p>`
              : ''
          }
        </td></tr>
        <tr><td style="padding:20px 36px 30px;border-top:1px solid #F0E9DE;color:#8A7B69;font-size:12px;line-height:1.6;">
          Questions? Just reply to this email.<br/>© ${new Date().getFullYear()} BirthNote
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/**
 * Renders the notes in an order as a list.
 *
 * Every customer-facing email now describes a set rather than a single date,
 * because an order can hold up to twenty. For a one-note order this reads
 * exactly as the old copy did.
 */
function itemLines(items: OrderItem[]): string[] {
  return items.map((item) => {
    const parts = [item.displayDate];
    if (item.noteDenomination) parts.push(item.noteDenomination);
    else if (item.requestedDenomination) parts.push(`₹${item.requestedDenomination}`);
    if (item.noteCondition) parts.push(item.noteCondition);
    if (item.giftFor) parts.push(`for ${item.giftFor}`);
    const line = parts.join(' · ');
    return item.pricePaise ? `${line} — ${formatPrice(item.pricePaise)}` : line;
  });
}

function itemListHtml(items: OrderItem[]): string {
  return `<ul style="margin:0 0 14px;padding-left:20px;color:#4A3F33;font-size:15px;line-height:1.8;">${itemLines(
    items
  )
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join('')}</ul>`;
}

const p = (text: string) =>
  `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#4A3F33;">${text}</p>`;

const refBlock = (reference: string) =>
  `<div style="margin:22px 0;padding:16px 20px;background:#F7F3EC;border:1px solid #E8DFD2;border-radius:12px;">
     <p style="margin:0 0 4px;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#8A7B69;font-weight:700;">Your reference</p>
     <p style="margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:22px;font-weight:800;letter-spacing:1px;">${escapeHtml(reference)}</p>
   </div>`;

export function requestReceivedEmail(order: Order): MailPayload {
  const trackUrl = `${env.siteUrl}/track-order/${order.reference}`;
  const many = order.items.length > 1;
  const lines = itemLines(order.items);

  const html = layout(
    many ? `We have your ${order.items.length} dates.` : 'We have your date.',
    p(`Hi ${escapeHtml(order.customerName.split(' ')[0])},`) +
      p(
        many
          ? `We're searching our collection for banknotes printed on these ${order.items.length} dates:`
          : `We're searching our collection for a banknote printed on <strong>${escapeHtml(
              order.items[0].displayDate
            )}</strong>.`
      ) +
      (many ? itemListHtml(order.items) : '') +
      refBlock(order.reference) +
      p(
        many
          ? "We usually confirm within a few hours. You'll get a secure payment link for whichever dates we find — you pay nothing for any we can't."
          : "We usually confirm availability within a few hours. If we find your note we'll email you a secure payment link; if we can't, we'll tell you straight away and you pay nothing."
      ),
    { label: 'Track your request', url: trackUrl }
  );
  return {
    to: order.customerEmail,
    subject: `We've received your request — ${order.reference}`,
    html,
    text: `Hi ${order.customerName},

${
  many
    ? `We're searching our collection for banknotes printed on:\n${lines.map((l) => `  - ${l}`).join('\n')}`
    : `We're searching our collection for a banknote printed on ${order.items[0].displayDate}.`
}

Your reference: ${order.reference}
Track it here: ${trackUrl}

We usually confirm within a few hours. You pay nothing for any date we cannot find.

— BirthNote`,
  };
}

export function availabilityConfirmedEmail(order: Order): MailPayload {
  const payUrl = `${env.siteUrl}/payment/${order.reference}`;
  const found = availableItems(order);
  const missing = order.items.filter((item) => item.availability === 'unavailable');
  const many = found.length > 1;

  const html = layout(
    many ? `Good news — we found ${found.length} of them.` : 'Good news — we found it.',
    p(`Hi ${escapeHtml(order.customerName.split(' ')[0])},`) +
      p(
        many
          ? 'These notes are reserved for you:'
          : `We have a genuine banknote printed on <strong>${escapeHtml(
              found[0]?.displayDate ?? ''
            )}</strong> reserved for you.`
      ) +
      itemListHtml(found) +
      // Told plainly rather than left to be noticed on the payment page: the
      // customer asked for these dates and deserves to hear the answer.
      (missing.length
        ? p(
            `We could not find ${missing.length === 1 ? 'a note for' : 'notes for'} ${escapeHtml(
              missing.map((item) => item.displayDate).join(', ')
            )}. You have not been charged for ${missing.length === 1 ? 'it' : 'them'}.`
          )
        : '') +
      p(
        `Total: <strong>${formatPrice(order.pricePaise, order.currency)}</strong>, including tracked delivery anywhere in India and gift packaging.`
      ) +
      refBlock(order.reference) +
      p(`${many ? 'These notes are' : 'This note is'} held for you for 7 days.`),
    { label: 'Complete your order', url: payUrl }
  );
  return {
    to: order.customerEmail,
    subject: `Your ${many ? 'dates are' : 'date is'} available — ${order.reference}`,
    html,
    text: `Hi ${order.customerName},

Good news — we found:
${itemLines(found)
  .map((line) => `  - ${line}`)
  .join('\n')}
${
  missing.length
    ? `\nWe could not find: ${missing.map((item) => item.displayDate).join(', ')}. You have not been charged for these.\n`
    : ''
}
Total: ${formatPrice(order.pricePaise, order.currency)} including tracked delivery anywhere in India.

Complete your order: ${payUrl}
Reference: ${order.reference}

Held for you for 7 days.

— BirthNote`,
  };
}

/**
 * Sent when *none* of the requested dates could be found.
 *
 * A partial result is not this email — that case goes out as an availability
 * confirmation naming what is missing, because there is still something to buy.
 */
export function unavailableEmail(order: Order): MailPayload {
  const many = order.items.length > 1;
  const dates = order.items.map((item) => item.displayDate).join(', ');
  const html = layout(
    many ? 'We could not find your dates.' : 'We could not find your date.',
    p(`Hi ${escapeHtml(order.customerName.split(' ')[0])},`) +
      p(
        `We searched our collection but couldn't find ${many ? 'banknotes' : 'a banknote'} printed on <strong>${escapeHtml(dates)}</strong>.`
      ) +
      p(
        `You have not been charged. We add to the collection every week — reply to this email and we'll keep your ${many ? 'dates' : 'date'} on our watch list.`
      ) +
      refBlock(order.reference),
    { label: 'Try another date', url: `${env.siteUrl}/request-a-banknote` }
  );
  return {
    to: order.customerEmail,
    subject: `Update on your request — ${order.reference}`,
    html,
    text: `Hi ${order.customerName},

We searched our collection but couldn't find ${many ? 'banknotes' : 'a banknote'} printed on ${dates}. You have not been charged.

We add to the collection every week — reply to this email and we'll keep your date on our watch list.

Reference: ${order.reference}

— BirthNote`,
  };
}

export function paymentReceivedEmail(order: Order): MailPayload {
  const trackUrl = `${env.siteUrl}/track-order/${order.reference}`;
  const html = layout(
    'Order confirmed.',
    p(`Hi ${escapeHtml(order.customerName.split(' ')[0])},`) +
      p(
        `We've received your payment of <strong>${formatPrice(order.pricePaise, order.currency)}</strong>. ${
          availableItems(order).length > 1
            ? 'Your notes are being prepared:'
            : `Your note from ${escapeHtml(availableItems(order)[0]?.displayDate ?? '')} is being prepared.`
        }`
      ) +
      (availableItems(order).length > 1 ? itemListHtml(availableItems(order)) : '') +
      refBlock(order.reference) +
      `<ul style="margin:0;padding-left:20px;color:#4A3F33;font-size:15px;line-height:1.8;">
         <li>Packaged in an archival sleeve and gift box within 1–2 working days.</li>
         <li>Dispatched with tracked delivery, arriving in 3–7 working days.</li>
         <li>We'll email your tracking number as soon as it ships.</li>
       </ul>`,
    { label: 'Track your order', url: trackUrl }
  );
  return {
    to: order.customerEmail,
    subject: `Payment received — ${order.reference}`,
    html,
    text: `Hi ${order.customerName},

We've received your payment of ${formatPrice(order.pricePaise, order.currency)}. Being prepared:
${itemLines(availableItems(order))
  .map((line) => `  - ${line}`)
  .join('\n')}

Reference: ${order.reference}
Track it: ${trackUrl}

Everything ships together, packaged within 1-2 working days and delivered in 3-7 working days with tracking.

— BirthNote`,
  };
}

export function shippedEmail(order: Order): MailPayload {
  const shipped = availableItems(order);
  const many = shipped.length > 1;
  const html = layout(
    many ? 'Your notes are on their way.' : 'Your note is on its way.',
    p(`Hi ${escapeHtml(order.customerName.split(' ')[0])},`) +
      p(
        many
          ? `Your ${shipped.length} banknotes were dispatched today, together in one parcel:`
          : `Your banknote from ${escapeHtml(shipped[0]?.displayDate ?? '')} was dispatched today.`
      ) +
      (many ? itemListHtml(shipped) : '') +
      (order.trackingNumber
        ? p(`Tracking number: <strong>${escapeHtml(order.trackingNumber)}</strong>`)
        : '') +
      refBlock(order.reference),
    { label: 'Track your order', url: `${env.siteUrl}/track-order/${order.reference}` }
  );
  return {
    to: order.customerEmail,
    subject: `Dispatched — ${order.reference}`,
    html,
    text: `Hi ${order.customerName},

${
  many
    ? `Your ${shipped.length} banknotes were dispatched today, together in one parcel:\n${itemLines(
        shipped
      )
        .map((line) => `  - ${line}`)
        .join('\n')}`
    : `Your banknote from ${shipped[0]?.displayDate ?? ''} was dispatched today.`
}
${order.trackingNumber ? `Tracking number: ${order.trackingNumber}` : ''}
Reference: ${order.reference}

— BirthNote`,
  };
}

/** Internal heads-up so a new request is not missed. */
export function newRequestAdminEmail(order: Order): MailPayload | null {
  const to = env.smtp.replyTo || env.smtp.user;
  if (!to) return null;
  return {
    to,
    subject: `New request ${order.reference} — ${summariseOrder(order)}`,
    html: layout(
      order.items.length > 1 ? `New request — ${order.items.length} notes` : 'New banknote request',
      itemListHtml(order.items) +
        p(`${escapeHtml(order.customerName)} &lt;${escapeHtml(order.customerEmail)}&gt;`) +
        (order.message ? p(`Message: ${escapeHtml(order.message)}`) : '') +
        refBlock(order.reference),
      { label: 'Open admin', url: `${env.siteUrl}/admin` }
    ),
    text: `New request ${order.reference}
${itemLines(order.items)
  .map((line) => `  - ${line}`)
  .join('\n')}
From: ${order.customerName} <${order.customerEmail}>
${order.message ? `Message: ${order.message}` : ''}

Admin: ${env.siteUrl}/admin`,
  };
}

/**
 * The sign-in code, for someone who gave us an address instead of a number.
 *
 * Deliberately plain: no link to click, nothing to log in through, just the
 * digits. A sign-in email carrying a button is the shape every phishing mail
 * imitates, and teaching customers to click one is worse than the small
 * convenience it buys. The reminder at the end is there because the commonest
 * real attack on code sign-in is asking someone to read their code aloud.
 */
export function signInCodeEmail(
  email: string,
  code: string,
  expiresInMinutes: number
): MailPayload {
  const html = layout(
    'Your sign-in code',
    `<p style="margin:0 0 18px;font-size:15px;line-height:1.6;">Enter this code to sign in to BirthNote:</p>
     <p style="margin:0 0 18px;font-size:34px;letter-spacing:8px;font-weight:800;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${escapeHtml(code)}</p>
     <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#6B5C4A;">It works for ${expiresInMinutes} minutes and once only.</p>
     <p style="margin:0;font-size:14px;line-height:1.6;color:#6B5C4A;">If you did not ask to sign in, ignore this email. Nobody from BirthNote will ever ask you for this code.</p>`
  );
  return {
    to: email,
    subject: `${code} is your BirthNote sign-in code`,
    html,
    text: `Your BirthNote sign-in code is ${code}

It works for ${expiresInMinutes} minutes and once only.

If you did not ask to sign in, ignore this email. Nobody from BirthNote will ever ask you for this code.

— BirthNote`,
  };
}

/** Returns null when the account has no address — see `sendMail`. */
export function welcomeEmail(user: { name: string; email: string | null }): MailPayload | null {
  if (!user.email) return null;
  const accountUrl = `${env.siteUrl}/account`;
  const html = layout(
    'Your BirthNote account is ready.',
    p(`Hi ${escapeHtml(user.name.split(' ')[0])},`) +
      p(
        'Your account is set up. Every request you make from now on appears in one place, with its status and tracking as it moves along.'
      ) +
      p('Any orders you placed earlier with this email address are already there.'),
    { label: 'Go to my account', url: accountUrl }
  );
  return {
    to: user.email,
    subject: 'Welcome to BirthNote',
    html,
    text: `Hi ${user.name},

Your BirthNote account is ready. Every request you make now appears in one place, with its status and tracking.

Any orders you placed earlier with this email address are already there.

${accountUrl}

— BirthNote`,
  };
}

/**
 * Sent after a password actually changes, so a hijack is visible to the owner.
 * Returns null when the account has no address — see `sendMail`.
 */
export function passwordChangedEmail(user: {
  name: string;
  email: string | null;
}): MailPayload | null {
  if (!user.email) return null;
  const html = layout(
    'Your password was changed.',
    p(`Hi ${escapeHtml(user.name.split(' ')[0])},`) +
      p(
        'The password on your BirthNote account has just been changed, and every other signed-in device has been signed out.'
      ) +
      p('If this was not you, reply to this email straight away.')
  );
  return {
    to: user.email,
    subject: 'Your BirthNote password was changed',
    html,
    text: `Hi ${user.name},

The password on your BirthNote account has just been changed, and every other signed-in device has been signed out.

If this was not you, reply to this email straight away.

— BirthNote`,
  };
}

/**
 * An admin's reset link.
 *
 * Kept separate from the customer template because it points at /admin and
 * because the two audiences should never share copy that could send one to the
 * other's login screen.
 */
export function adminPasswordResetEmail(
  admin: { name: string; email: string },
  token: string
): MailPayload {
  const resetUrl = `${env.siteUrl}/admin/reset-password/${token}`;
  const html = layout(
    'Reset your admin password.',
    p(`Hi ${escapeHtml(admin.name.split(' ')[0])},`) +
      p(
        'Use the button below to choose a new password for the BirthNote admin panel. The link works once and expires in one hour.'
      ) +
      p('If you did not ask for this, tell the shop owner — someone tried to reset your access.'),
    { label: 'Choose a new password', url: resetUrl }
  );
  return {
    to: admin.email,
    subject: 'Reset your BirthNote admin password',
    html,
    text: `Hi ${admin.name},

Use this link to choose a new admin password. It works once and expires in one hour.

${resetUrl}

If you did not ask for this, tell the shop owner — someone tried to reset your access.

— BirthNote`,
  };
}

/** Sent when an owner creates an admin account, carrying the first-time link. */
export function adminInviteEmail(
  admin: { name: string; email: string; role: string },
  token: string
): MailPayload {
  const setupUrl = `${env.siteUrl}/admin/reset-password/${token}`;
  const html = layout(
    'You have been given admin access.',
    p(`Hi ${escapeHtml(admin.name.split(' ')[0])},`) +
      p(
        `An account has been created for you on the BirthNote admin panel as <strong>${escapeHtml(admin.role)}</strong>.`
      ) +
      p('Choose your password using the link below. It works once and expires in one hour.'),
    { label: 'Set my password', url: setupUrl }
  );
  return {
    to: admin.email,
    subject: 'Your BirthNote admin account',
    html,
    text: `Hi ${admin.name},

An account has been created for you on the BirthNote admin panel as ${admin.role}.

Set your password here — the link works once and expires in one hour:
${setupUrl}

— BirthNote`,
  };
}
