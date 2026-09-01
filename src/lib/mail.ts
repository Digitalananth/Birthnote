import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '@/lib/env';
import { availableItems, summariseOrder, type Order, type OrderItem } from '@/lib/orders';
import { formatPrice } from '@/lib/validation';
import { HOLD_DAYS } from '@/lib/order-types';

/**
 * Transactional email over plain SMTP (Gmail by default).
 *
 * Gmail requires an *App Password* — your normal account password will be
 * rejected. Create one at myaccount.google.com → Security → App passwords,
 * and note Gmail's ~500 messages/day cap. Set MAIL_ENABLED=false (or leave
 * SMTP_USER blank) to log emails to the console instead of sending them,
 * which is what local development should do.
 */
const globalForMail = globalThis as unknown as { myLuckyDatesMailer?: Transporter };

function getTransport(): Transporter {
  if (!globalForMail.myLuckyDatesMailer) {
    globalForMail.myLuckyDatesMailer = nodemailer.createTransport({
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
  return globalForMail.myLuckyDatesMailer;
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
          <p style="margin:0 0 20px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${BRAND};font-weight:700;">My Lucky Dates</p>
          <h1 style="margin:0 0 18px;font-size:24px;line-height:1.25;font-weight:800;">${escapeHtml(heading)}</h1>
          ${bodyHtml}
          ${
            cta
              ? `<p style="margin:28px 0 0;"><a href="${cta.url}" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;padding:13px 26px;border-radius:10px;font-weight:600;font-size:14px;">${escapeHtml(cta.label)}</a></p>`
              : ''
          }
        </td></tr>
        <tr><td style="padding:20px 36px 30px;border-top:1px solid #F0E9DE;color:#8A7B69;font-size:12px;line-height:1.6;">
          Questions? Just reply to this email.<br/>© ${new Date().getFullYear()} My Lucky Dates
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/**
 * Renders the notes in an order as a list.
 *
 * Every customer-facing email now describes a set rather than a single note,
 * because an order can hold up to twenty — and several of them may share a
 * date, since a date can be asked for in more than one denomination. That is
 * why these lines count notes and not dates. For a one-note order this reads
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

/**
 * The hold deadline as a date a customer can act on.
 *
 * In Asia/Kolkata, because "until 3 September" must mean the same day to the
 * reader as it does to the sweep that enforces it.
 */
function holdDeadline(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'long',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(iso));
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
    many ? `We have your ${order.items.length} notes.` : 'We have your date.',
    p(`Hi ${escapeHtml(order.customerName.split(' ')[0])},`) +
      p(
        many
          ? `We're searching our collection for these ${order.items.length} banknotes:`
          : `We're searching our collection for a banknote printed on <strong>${escapeHtml(
              order.items[0].displayDate
            )}</strong>.`
      ) +
      (many ? itemListHtml(order.items) : '') +
      refBlock(order.reference) +
      p(
        many
          ? "We usually confirm within a few hours. You'll get a secure payment link for whichever notes we find — you pay nothing for any we can't."
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
    ? `We're searching our collection for these banknotes:\n${lines.map((l) => `  - ${l}`).join('\n')}`
    : `We're searching our collection for a banknote printed on ${order.items[0].displayDate}.`
}

Your reference: ${order.reference}
Track it here: ${trackUrl}

We usually confirm within a few hours. You pay nothing for any note we cannot find.

— My Lucky Dates`,
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
      // customer asked for these notes and deserves to hear the answer.
      //
      // Listed by note and not by date. One date can be asked for in several
      // denominations, so naming the date alone produces "we found 31/03/90"
      // above and "we could not find 31/03/90" here — a flat contradiction to
      // anyone reading it.
      (missing.length
        ? p(
            `We could not find ${missing.length === 1 ? 'a note' : 'notes'} for ${escapeHtml(
              itemLines(missing).join(', ')
            )}. You have not been charged for ${missing.length === 1 ? 'it' : 'them'}.`
          )
        : '') +
      p(
        `Total: <strong>${formatPrice(order.totalPaise, order.currency)}</strong>, including GST, tracked delivery anywhere in India and gift packaging.`
      ) +
      refBlock(order.reference) +
      p(
        `${many ? 'These notes are' : 'This note is'} held for you for ${HOLD_DAYS} days${
          order.heldUntil ? `, until ${holdDeadline(order.heldUntil)}` : ''
        }.`
      ),
    { label: 'Complete your order', url: payUrl }
  );
  return {
    to: order.customerEmail,
    subject: `Your ${many ? 'notes are' : 'date is'} available — ${order.reference}`,
    html,
    text: `Hi ${order.customerName},

Good news — we found:
${itemLines(found)
  .map((line) => `  - ${line}`)
  .join('\n')}
${
  missing.length
    ? `\nWe could not find: ${itemLines(missing).join(', ')}. You have not been charged for these.\n`
    : ''
}
Total: ${formatPrice(order.totalPaise, order.currency)} including GST and tracked delivery anywhere in India.

Complete your order: ${payUrl}
Reference: ${order.reference}

Held for you for ${HOLD_DAYS} days${order.heldUntil ? `, until ${holdDeadline(order.heldUntil)}` : ''}.

— My Lucky Dates`,
  };
}

/**
 * A nudge while the hold is still running.
 *
 * Deliberately short and free of pressure tactics: it states what is held,
 * what it costs, when the hold runs out, and gives one button. Someone who
 * has already been told the good news does not need to be sold to again.
 */
export function holdReminderEmail(order: Order, daysLeft: number): MailPayload {
  const payUrl = `${env.siteUrl}/payment/${order.reference}`;
  const found = availableItems(order);
  const many = found.length > 1;
  const when = daysLeft <= 1 ? 'tomorrow' : `in ${daysLeft} days`;
  const deadline = order.heldUntil ? holdDeadline(order.heldUntil) : null;

  return {
    to: order.customerEmail,
    subject:
      daysLeft <= 1
        ? `Last day — your ${many ? 'notes are' : 'note is'} held until tomorrow (${order.reference})`
        : `Still held for you — ${order.reference}`,
    html: layout(
      many ? `Your notes are still waiting` : 'Your note is still waiting',
      p(`Hi ${escapeHtml(order.customerName.split(' ')[0])},`) +
        p(
          `Just so it does not slip by: ${
            many ? 'these notes are' : 'this note is'
          } still reserved for you, and the hold ends ${when}${
            deadline ? ` (${escapeHtml(deadline)})` : ''
          }.`
        ) +
        itemListHtml(found) +
        p(
          `Total: <strong>${formatPrice(order.totalPaise, order.currency)}</strong>, including GST, tracked delivery and gift packaging.`
        ) +
        refBlock(order.reference) +
        p('If you have changed your mind, you can simply ignore this — nothing will be charged.'),
      { label: 'Complete your order', url: payUrl }
    ),
    text: `Hi ${order.customerName},

Just so it does not slip by: ${many ? 'these notes are' : 'this note is'} still reserved for you, and the hold ends ${when}${deadline ? ` (${deadline})` : ''}.

${itemLines(found)
  .map((line) => `  - ${line}`)
  .join('\n')}

Total: ${formatPrice(order.totalPaise, order.currency)} including GST and tracked delivery.

Complete your order: ${payUrl}
Reference: ${order.reference}

If you have changed your mind, ignore this — nothing will be charged.

— My Lucky Dates`,
  };
}

/**
 * Sent once the hold has run out.
 *
 * The note is not gone — the order is still payable and a human decides
 * whether to re-sell it — so this says the hold has ended, not that the
 * chance has. Promising a hold and then quietly keeping it would be the same
 * dishonesty in the other direction.
 */
export function holdLapsedEmail(order: Order): MailPayload {
  const payUrl = `${env.siteUrl}/payment/${order.reference}`;
  const found = availableItems(order);
  const many = found.length > 1;

  return {
    to: order.customerEmail,
    subject: `Your ${HOLD_DAYS}-day hold has ended — ${order.reference}`,
    html: layout(
      'Your hold has ended',
      p(`Hi ${escapeHtml(order.customerName.split(' ')[0])},`) +
        p(
          `The ${HOLD_DAYS}-day hold on ${
            many ? 'your notes' : 'your note'
          } has now ended, so we can no longer promise ${many ? 'they are' : 'it is'} set aside.`
        ) +
        p(
          `${
            many ? 'They are' : 'It is'
          } still here as we write this, though — if you would still like ${
            many ? 'them' : 'it'
          }, complete the order and we will send ${many ? 'them' : 'it'} straight out.`
        ) +
        itemListHtml(found) +
        refBlock(order.reference) +
        p('If you would rather not, there is nothing to do and nothing to pay.'),
      { label: 'Complete your order', url: payUrl }
    ),
    text: `Hi ${order.customerName},

The ${HOLD_DAYS}-day hold on ${many ? 'your notes' : 'your note'} has now ended, so we can no longer promise ${many ? 'they are' : 'it is'} set aside.

${many ? 'They are' : 'It is'} still here as we write this — if you would still like ${many ? 'them' : 'it'}, complete the order and we will send ${many ? 'them' : 'it'} straight out.

Complete your order: ${payUrl}
Reference: ${order.reference}

If you would rather not, there is nothing to do and nothing to pay.

— My Lucky Dates`,
  };
}

/**
 * Sent when a payment attempt failed.
 *
 * The single most important sentence is that no money was taken: someone whose
 * card was declined does not know whether they have been charged, and silence
 * is where that turns into a support email or an abandoned order.
 */
export function paymentFailedEmail(order: Order): MailPayload {
  const payUrl = `${env.siteUrl}/payment/${order.reference}`;
  return {
    to: order.customerEmail,
    subject: `Your payment did not go through — ${order.reference}`,
    html: layout(
      'That payment did not go through',
      p(`Hi ${escapeHtml(order.customerName.split(' ')[0])},`) +
        p(
          '<strong>You have not been charged.</strong> Your bank declined the payment, which usually means a card limit, an expired card, or a verification step that timed out.'
        ) +
        p(
          `${
            order.heldUntil
              ? `Your order is still reserved until ${escapeHtml(holdDeadline(order.heldUntil))}. `
              : 'Your order is still reserved. '
          }You can try again whenever suits — the link below opens a fresh, secure checkout.`
        ) +
        refBlock(order.reference),
      { label: 'Try the payment again', url: payUrl }
    ),
    text: `Hi ${order.customerName},

You have not been charged. Your bank declined the payment — usually a card limit, an expired card, or a verification step that timed out.

${order.heldUntil ? `Your order is still reserved until ${holdDeadline(order.heldUntil)}. ` : 'Your order is still reserved. '}You can try again whenever suits:

${payUrl}
Reference: ${order.reference}

— My Lucky Dates`,
  };
}

/**
 * Sent when a Stripe checkout session expired unused.
 *
 * Distinct from a failed payment: nothing was attempted, the customer simply
 * left the tab. So this reassures rather than explains, and does not imply
 * their card was refused.
 */
export function checkoutExpiredEmail(order: Order): MailPayload {
  const payUrl = `${env.siteUrl}/payment/${order.reference}`;
  return {
    to: order.customerEmail,
    subject: `Your checkout expired — ${order.reference}`,
    html: layout(
      'Your checkout page expired',
      p(`Hi ${escapeHtml(order.customerName.split(' ')[0])},`) +
        p(
          'The secure checkout you opened has expired, as they do after a day. Nothing was charged and nothing is lost.'
        ) +
        p(
          `${
            order.heldUntil
              ? `Your order is still reserved until ${escapeHtml(holdDeadline(order.heldUntil))}. `
              : 'Your order is still reserved. '
          }The link below opens a new one whenever you are ready.`
        ) +
        refBlock(order.reference),
      { label: 'Open a new checkout', url: payUrl }
    ),
    text: `Hi ${order.customerName},

The secure checkout you opened has expired, as they do after a day. Nothing was charged and nothing is lost.

${order.heldUntil ? `Your order is still reserved until ${holdDeadline(order.heldUntil)}. ` : 'Your order is still reserved. '}Open a new one whenever you are ready:

${payUrl}
Reference: ${order.reference}

— My Lucky Dates`,
  };
}

/** Sent when a payment has been refunded. */
export function refundedEmail(order: Order): MailPayload {
  return {
    to: order.customerEmail,
    subject: `Your refund is on its way — ${order.reference}`,
    html: layout(
      'Your refund is on its way',
      p(`Hi ${escapeHtml(order.customerName.split(' ')[0])},`) +
        p(
          `We have refunded <strong>${formatPrice(order.totalPaise, order.currency)}</strong> to the card you paid with.`
        ) +
        p(
          'Banks usually take five to ten working days to show it, and it returns to the original card — there is nothing you need to do.'
        ) +
        refBlock(order.reference)
    ),
    text: `Hi ${order.customerName},

We have refunded ${formatPrice(order.totalPaise, order.currency)} to the card you paid with.

Banks usually take five to ten working days to show it, and it returns to the original card. There is nothing you need to do.

Reference: ${order.reference}

— My Lucky Dates`,
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
  // Deduplicated: one date asked for in three denominations is three items
  // but one date, and listing it three times reads as a mistake on our side.
  const dates = [...new Set(order.items.map((item) => item.displayDate))].join(', ');
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

— My Lucky Dates`,
  };
}

/**
 * The receipt. `invoiceNumber` is passed in rather than looked up, because
 * mail.ts knows nothing about the database and the caller has just issued it.
 */
export function paymentReceivedEmail(order: Order, invoiceNumber?: string | null): MailPayload {
  const trackUrl = `${env.siteUrl}/track-order/${order.reference}`;
  const invoiceUrl = `${env.siteUrl}/invoice/${order.reference}`;
  const html = layout(
    'Order confirmed.',
    p(`Hi ${escapeHtml(order.customerName.split(' ')[0])},`) +
      p(
        `We've received your payment of <strong>${formatPrice(order.totalPaise, order.currency)}</strong>. ${
          availableItems(order).length > 1
            ? 'Your notes are being prepared:'
            : `Your note from ${escapeHtml(availableItems(order)[0]?.displayDate ?? '')} is being prepared.`
        }`
      ) +
      (availableItems(order).length > 1 ? itemListHtml(availableItems(order)) : '') +
      refBlock(order.reference) +
      `<ul style="margin:0;padding-left:20px;color:#4A3F33;font-size:15px;line-height:1.8;">
         <li>Packaged in an archival sleeve and gift box within 1–2 working days.</li>
         <li>Dispatched with tracked delivery, arriving in 3–5 days.</li>
         <li>We'll email your tracking number as soon as it ships.</li>
       </ul>` +
      (invoiceNumber
        ? p(
            `Your tax invoice <strong>${escapeHtml(invoiceNumber)}</strong> is ready — <a href="${invoiceUrl}" style="color:#8B4513;">view or download it here</a>.`
          )
        : ''),
    { label: 'Track your order', url: trackUrl }
  );
  return {
    to: order.customerEmail,
    subject: `Payment received — ${order.reference}`,
    html,
    text: `Hi ${order.customerName},

We've received your payment of ${formatPrice(order.totalPaise, order.currency)}. Being prepared:
${itemLines(availableItems(order))
  .map((line) => `  - ${line}`)
  .join('\n')}

Reference: ${order.reference}
Track it: ${trackUrl}
${invoiceNumber ? `Tax invoice ${invoiceNumber}: ${invoiceUrl}` : ''}

Everything ships together, packaged within 1-2 working days and delivered in 3-5 days with tracking.

— My Lucky Dates`,
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

— My Lucky Dates`,
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
      { label: 'Open admin', url: `${env.siteUrl}/admin/orders/${order.reference}` }
    ),
    text: `New request ${order.reference}
${itemLines(order.items)
  .map((line) => `  - ${line}`)
  .join('\n')}
From: ${order.customerName} <${order.customerEmail}>
${order.message ? `Message: ${order.message}` : ''}

Admin: ${env.siteUrl}/admin/orders/${order.reference}`,
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
    `<p style="margin:0 0 18px;font-size:15px;line-height:1.6;">Enter this code to sign in to My Lucky Dates:</p>
     <p style="margin:0 0 18px;font-size:34px;letter-spacing:8px;font-weight:800;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${escapeHtml(code)}</p>
     <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#6B5C4A;">It works for ${expiresInMinutes} minutes and once only.</p>
     <p style="margin:0;font-size:14px;line-height:1.6;color:#6B5C4A;">If you did not ask to sign in, ignore this email. Nobody from My Lucky Dates will ever ask you for this code.</p>`
  );
  return {
    to: email,
    subject: `${code} is your My Lucky Dates sign-in code`,
    html,
    text: `Your My Lucky Dates sign-in code is ${code}

It works for ${expiresInMinutes} minutes and once only.

If you did not ask to sign in, ignore this email. Nobody from My Lucky Dates will ever ask you for this code.

— My Lucky Dates`,
  };
}

/** Returns null when the account has no address — see `sendMail`. */
export function welcomeEmail(user: { name: string; email: string | null }): MailPayload | null {
  if (!user.email) return null;
  const accountUrl = `${env.siteUrl}/account`;
  const html = layout(
    'Your My Lucky Dates account is ready.',
    p(`Hi ${escapeHtml(user.name.split(' ')[0])},`) +
      p(
        'Your account is set up. Every request you make from now on appears in one place, with its status and tracking as it moves along.'
      ) +
      p('Any orders you placed earlier with this email address are already there.'),
    { label: 'Go to my account', url: accountUrl }
  );
  return {
    to: user.email,
    subject: 'Welcome to My Lucky Dates',
    html,
    text: `Hi ${user.name},

Your My Lucky Dates account is ready. Every request you make now appears in one place, with its status and tracking.

Any orders you placed earlier with this email address are already there.

${accountUrl}

— My Lucky Dates`,
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
        'The password on your My Lucky Dates account has just been changed, and every other signed-in device has been signed out.'
      ) +
      p('If this was not you, reply to this email straight away.')
  );
  return {
    to: user.email,
    subject: 'Your My Lucky Dates password was changed',
    html,
    text: `Hi ${user.name},

The password on your My Lucky Dates account has just been changed, and every other signed-in device has been signed out.

If this was not you, reply to this email straight away.

— My Lucky Dates`,
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
        'Use the button below to choose a new password for the My Lucky Dates admin panel. The link works once and expires in one hour.'
      ) +
      p('If you did not ask for this, tell the shop owner — someone tried to reset your access.'),
    { label: 'Choose a new password', url: resetUrl }
  );
  return {
    to: admin.email,
    subject: 'Reset your My Lucky Dates admin password',
    html,
    text: `Hi ${admin.name},

Use this link to choose a new admin password. It works once and expires in one hour.

${resetUrl}

If you did not ask for this, tell the shop owner — someone tried to reset your access.

— My Lucky Dates`,
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
        `An account has been created for you on the My Lucky Dates admin panel as <strong>${escapeHtml(admin.role)}</strong>.`
      ) +
      p('Choose your password using the link below. It works once and expires in one hour.'),
    { label: 'Set my password', url: setupUrl }
  );
  return {
    to: admin.email,
    subject: 'Your My Lucky Dates admin account',
    html,
    text: `Hi ${admin.name},

An account has been created for you on the My Lucky Dates admin panel as ${admin.role}.

Set your password here — the link works once and expires in one hour:
${setupUrl}

— My Lucky Dates`,
  };
}
