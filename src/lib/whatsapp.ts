import 'server-only';
import { env } from '@/lib/env';
import { availableItems, summariseOrder, type Order } from '@/lib/orders';
import { formatPrice } from '@/lib/validation';

/**
 * Order updates over WhatsApp, sent through MSG91.
 *
 * Three things about this API shape the code:
 *
 * 1. **Business-initiated messages must use a template Meta has approved in
 *    advance.** Nothing here can send free text; the wording lives in the
 *    MSG91 dashboard and this file supplies only the placeholder values. Template
 *    names come from `.env` so the two can be kept in step without a deploy.
 * 2. **Body parameters may not contain newlines, tabs, or four or more
 *    consecutive spaces.** Meta rejects the whole message if they do, so
 *    every value goes through `param()`.
 * 3. **Each message costs money.** Sends are limited to customers who ticked
 *    the box, and every send is logged with its outcome.
 *
 * Like email, a failure here is logged and swallowed: a WhatsApp outage must
 * never roll back an order or fail a customer's request.
 */
export interface WhatsAppTemplate {
  to: string;
  template: string;
  /** Body placeholders, in the order the approved template expects them. */
  params: string[];
}

/**
 * Normalises a number to the digits Meta expects.
 *
 * Returns null for anything that cannot be a real number, so a typo is
 * dropped rather than sent to whoever owns the number it became.
 */
export function normaliseWhatsAppNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  // 00 is the international prefix in much of the world; Meta wants neither
  // it nor a leading +.
  if (digits.startsWith('00')) digits = digits.slice(2);

  // A bare local number gets the default country code. India's mobile numbers
  // are ten digits, which is what makes this unambiguous here.
  if (digits.length === 10) digits = `${env.whatsapp.defaultCountryCode}${digits}`;

  // A single leading 0 before a local number is a domestic trunk prefix.
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = `${env.whatsapp.defaultCountryCode}${digits.slice(1)}`;
  }

  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

/** Meta rejects a template whose parameters contain newlines or long runs of spaces. */
function param(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 1024);
}

/**
 * Sends a template message. Never throws.
 *
 * Returns true only when MSG91 accepted the message.
 */
export async function sendWhatsApp(message: WhatsAppTemplate): Promise<boolean> {
  const to = normaliseWhatsAppNumber(message.to);
  if (!to) {
    console.warn(`[whatsapp:skipped] "${message.to}" is not a usable number`);
    return false;
  }

  // MSG91's outbound shape: variables are keyed body_1, body_2, … in the
  // order of the template's {{1}}, {{2}}, … placeholders.
  const components = Object.fromEntries(
    message.params.map((text, i) => [`body_${i + 1}`, { type: 'text', value: param(text) }])
  );
  const body = {
    content_type: 'template',
    payload: {
      messaging_product: 'whatsapp',
      type: 'template',
      template: {
        name: message.template,
        language: { code: env.whatsapp.languageCode, policy: 'deterministic' },
        ...(env.whatsapp.namespace ? { namespace: env.whatsapp.namespace } : {}),
        to_and_components: [{ to: [to], components }],
      },
    },
  };

  if (!env.whatsapp.enabled()) {
    console.info(
      `[whatsapp:disabled] To: ${to}\nTemplate: ${message.template}\nParams: ${JSON.stringify(
        components
      )}\n`
    );
    return false;
  }

  try {
    const response = await fetch(
      `${env.whatsapp.apiBase}/api/v5/whatsapp/whatsapp-outbound-message/bulk/`,
      {
        method: 'POST',
        headers: {
          authkey: env.msg91.authKey(),
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ integrated_number: env.whatsapp.integratedNumber(), ...body }),
        // Without this a hung MSG91 request would hold an order route open.
        signal: AbortSignal.timeout(10_000),
      }
    );

    // MSG91 can answer 200 with {"status":"fail"}, so read the body as well.
    const detail = await response.text().catch(() => '');
    if (!response.ok || /"(status|type)"\s*:\s*"(fail|error)"/i.test(detail)) {
      console.error(
        `[whatsapp:failed] ${message.template} to ${to} — ${response.status} ${detail.slice(0, 500)}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.error(`[whatsapp:failed] ${message.template} to ${to}`, error);
    return false;
  }
}

/**
 * The number to message for an order, or null.
 *
 * Null whenever the customer did not opt in — the check lives here so no
 * caller can send by forgetting it.
 */
export function whatsAppRecipient(order: Order): string | null {
  if (!order.whatsappOptIn) return null;
  return normaliseWhatsAppNumber(order.whatsapp);
}

function firstName(order: Order): string {
  return order.customerName.split(' ')[0];
}

/*
 * The templates below must exist in the MSG91 dashboard with matching names and
 * the same number of body placeholders, in the same order. Suggested wording
 * is in docs/phase-5-pwa-whatsapp.md.
 */

export function orderReceivedWhatsApp(order: Order): WhatsAppTemplate {
  return {
    to: order.whatsapp ?? '',
    template: env.whatsapp.templates.received,
    // {{1}} name  {{2}} what they asked for  {{3}} reference
    params: [firstName(order), summariseOrder(order), order.reference],
  };
}

export function orderConfirmedWhatsApp(order: Order): WhatsAppTemplate {
  const found = availableItems(order);
  return {
    to: order.whatsapp ?? '',
    template: env.whatsapp.templates.confirmed,
    // {{1}} name  {{2}} what we found  {{3}} total  {{4}} reference
    params: [
      firstName(order),
      found.length === 1 ? found[0].displayDate : `${found.length} of your dates`,
      formatPrice(order.pricePaise, order.currency),
      order.reference,
    ],
  };
}

export function orderUnavailableWhatsApp(order: Order): WhatsAppTemplate {
  return {
    to: order.whatsapp ?? '',
    template: env.whatsapp.templates.unavailable,
    // {{1}} name  {{2}} the dates  {{3}} reference
    params: [
      firstName(order),
      order.items.map((item) => item.displayDate).join(', '),
      order.reference,
    ],
  };
}

export function orderPaidWhatsApp(order: Order): WhatsAppTemplate {
  return {
    to: order.whatsapp ?? '',
    template: env.whatsapp.templates.paid,
    // {{1}} name  {{2}} amount  {{3}} reference
    params: [firstName(order), formatPrice(order.pricePaise, order.currency), order.reference],
  };
}

export function orderShippedWhatsApp(order: Order): WhatsAppTemplate {
  return {
    to: order.whatsapp ?? '',
    template: env.whatsapp.templates.shipped,
    // {{1}} name  {{2}} tracking number  {{3}} reference
    params: [firstName(order), order.trackingNumber || 'on its way', order.reference],
  };
}
