import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '@/lib/env';
import type { Order } from '@/lib/orders';
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
export async function sendMail(payload: MailPayload): Promise<boolean> {
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

const p = (text: string) =>
  `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#4A3F33;">${text}</p>`;

const refBlock = (reference: string) =>
  `<div style="margin:22px 0;padding:16px 20px;background:#F7F3EC;border:1px solid #E8DFD2;border-radius:12px;">
     <p style="margin:0 0 4px;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#8A7B69;font-weight:700;">Your reference</p>
     <p style="margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:22px;font-weight:800;letter-spacing:1px;">${escapeHtml(reference)}</p>
   </div>`;

export function requestReceivedEmail(order: Order): MailPayload {
  const trackUrl = `${env.siteUrl}/track-order/${order.reference}`;
  const html = layout(
    'We have your date.',
    p(`Hi ${escapeHtml(order.customerName.split(' ')[0])},`) +
      p(
        `We're searching our collection for a banknote printed on <strong>${escapeHtml(order.displayDate)}</strong>.`
      ) +
      refBlock(order.reference) +
      p(
        'We usually confirm availability within a few hours. If we find your note we\'ll email you a secure payment link; if we can\'t, we\'ll tell you straight away and you pay nothing.'
      ),
    { label: 'Track your request', url: trackUrl }
  );
  return {
    to: order.customerEmail,
    subject: `We've received your request — ${order.reference}`,
    html,
    text: `Hi ${order.customerName},

We're searching our collection for a banknote printed on ${order.displayDate}.

Your reference: ${order.reference}
Track it here: ${trackUrl}

We usually confirm availability within a few hours. If we find your note we'll email a secure payment link. If we can't, you pay nothing.

— BirthNote`,
  };
}

export function availabilityConfirmedEmail(order: Order): MailPayload {
  const payUrl = `${env.siteUrl}/payment/${order.reference}`;
  const details = [
    order.noteDenomination && `Denomination: ${order.noteDenomination}`,
    order.noteCountry && `Country: ${order.noteCountry}`,
    order.noteCondition && `Condition: ${order.noteCondition}`,
    order.noteSerial && `Serial prefix: ${order.noteSerial}`,
  ].filter(Boolean) as string[];

  const html = layout(
    'Good news — we found it.',
    p(`Hi ${escapeHtml(order.customerName.split(' ')[0])},`) +
      p(
        `We have a genuine banknote printed on <strong>${escapeHtml(order.displayDate)}</strong> reserved for you.`
      ) +
      (details.length
        ? `<ul style="margin:0 0 14px;padding-left:20px;color:#4A3F33;font-size:15px;line-height:1.8;">${details
            .map((d) => `<li>${escapeHtml(d)}</li>`)
            .join('')}</ul>`
        : '') +
      p(
        `Total: <strong>${formatPrice(order.pricePence, order.currency)}</strong>, including tracked UK delivery and gift packaging.`
      ) +
      refBlock(order.reference) +
      p('This note is held for you for 7 days.'),
    { label: 'Complete your order', url: payUrl }
  );
  return {
    to: order.customerEmail,
    subject: `Your date is available — ${order.reference}`,
    html,
    text: `Hi ${order.customerName},

Good news — we found a genuine banknote printed on ${order.displayDate}.

${details.join('\n')}
Total: ${formatPrice(order.pricePence, order.currency)} including tracked delivery.

Complete your order: ${payUrl}
Reference: ${order.reference}

This note is held for you for 7 days.

— BirthNote`,
  };
}

export function unavailableEmail(order: Order): MailPayload {
  const html = layout(
    'We could not find your date.',
    p(`Hi ${escapeHtml(order.customerName.split(' ')[0])},`) +
      p(
        `We searched our collection but couldn't find a banknote printed on <strong>${escapeHtml(order.displayDate)}</strong>.`
      ) +
      p(
        'You have not been charged. We add to the collection every week — reply to this email and we\'ll keep your date on our watch list.'
      ) +
      refBlock(order.reference),
    { label: 'Try another date', url: `${env.siteUrl}/request-a-banknote` }
  );
  return {
    to: order.customerEmail,
    subject: `Update on your request — ${order.reference}`,
    html,
    text: `Hi ${order.customerName},

We searched our collection but couldn't find a banknote printed on ${order.displayDate}. You have not been charged.

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
        `We've received your payment of <strong>${formatPrice(order.pricePence, order.currency)}</strong>. Your note from ${escapeHtml(order.displayDate)} is being prepared.`
      ) +
      refBlock(order.reference) +
      `<ul style="margin:0;padding-left:20px;color:#4A3F33;font-size:15px;line-height:1.8;">
         <li>Packaged in an archival sleeve and gift box within 1–2 working days.</li>
         <li>Dispatched with tracked delivery, arriving in 3–5 working days.</li>
         <li>We'll email your tracking number as soon as it ships.</li>
       </ul>`,
    { label: 'Track your order', url: trackUrl }
  );
  return {
    to: order.customerEmail,
    subject: `Payment received — ${order.reference}`,
    html,
    text: `Hi ${order.customerName},

We've received your payment of ${formatPrice(order.pricePence, order.currency)}. Your note from ${order.displayDate} is being prepared.

Reference: ${order.reference}
Track it: ${trackUrl}

Packaged within 1-2 working days, delivered in 3-5 working days with tracking.

— BirthNote`,
  };
}

export function shippedEmail(order: Order): MailPayload {
  const html = layout(
    'Your note is on its way.',
    p(`Hi ${escapeHtml(order.customerName.split(' ')[0])},`) +
      p(`Your banknote from ${escapeHtml(order.displayDate)} was dispatched today.`) +
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

Your banknote from ${order.displayDate} was dispatched today.
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
    subject: `New request ${order.reference} — ${order.displayDate}`,
    html: layout(
      'New banknote request',
      p(`<strong>${escapeHtml(order.displayDate)}</strong>`) +
        p(`${escapeHtml(order.customerName)} &lt;${escapeHtml(order.customerEmail)}&gt;`) +
        (order.giftFor ? p(`Gift for: ${escapeHtml(order.giftFor)}`) : '') +
        (order.message ? p(`Message: ${escapeHtml(order.message)}`) : '') +
        refBlock(order.reference),
      { label: 'Open admin', url: `${env.siteUrl}/admin` }
    ),
    text: `New request ${order.reference}
Date: ${order.displayDate}
From: ${order.customerName} <${order.customerEmail}>
${order.giftFor ? `Gift for: ${order.giftFor}` : ''}
${order.message ? `Message: ${order.message}` : ''}

Admin: ${env.siteUrl}/admin`,
  };
}
