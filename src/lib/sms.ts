import 'server-only';
import { env } from '@/lib/env';

/**
 * Outbound SMS, via MSG91.
 *
 * The only message BirthNote sends by SMS is a sign-in code, and the code is
 * ours: it is generated, hashed and checked in `src/lib/otp.ts`, and MSG91 is
 * handed the finished digits to deliver. Their `/api/v5/otp` endpoint accepts
 * an `otp` parameter for exactly this, which is why it is used in preference
 * to their verify endpoint — expiry, attempt limits and single use stay in one
 * place we control, and changing provider means rewriting this file alone.
 *
 * Two things about Indian SMS shape the code:
 *
 * 1. **The wording is fixed by DLT registration.** A template is approved by
 *    the telecom regulator in advance and only its variables can change, so
 *    the template id lives in `.env` and this file supplies just the code.
 * 2. **Each message costs money and can be delayed.** Sends are rate-limited
 *    upstream, and every failure is logged with the reason MSG91 gave.
 *
 * Unlike email, a failure here is *not* swallowed: if the code never left the
 * building the customer cannot sign in, so the caller needs to know and say
 * so rather than leaving them staring at a code entry box.
 */
export interface SmsResult {
  /**
   * MSG91 *accepted* the send. Not proof of delivery, and — because their OTP
   * endpoint validates the template only after responding — not proof that the
   * message is even deliverable. The customer-facing flow treats this as good
   * enough to show the code box, which is the best that can be done without a
   * delivery-report callback.
   */
  sent: boolean;
  /** Present when MSG91 rejected the send — for the log, never for the user. */
  reason?: string;
  /** MSG91's handle for the send, for tracing it in their delivery log. */
  requestId?: string;
}

/**
 * Sends a sign-in code to a number already in canonical form (digits only,
 * country code included — see `normalisePhoneNumber`).
 *
 * With no auth key configured the code is written to the server console and
 * reported as sent, which is what lets the whole flow be exercised locally
 * without an MSG91 account.
 */
export async function sendOtpSms(phone: string, code: string): Promise<SmsResult> {
  if (!env.msg91.enabled()) {
    console.info(
      `[sms:disabled] sign-in code for +${phone} is ${code} ` +
        '(set MSG91_AUTH_KEY and MSG91_TEMPLATE_ID in .env to send it for real)'
    );
    return { sent: true };
  }

  const templateId = env.msg91.templateId();

  // The commonest way this breaks is a DLT template id (a long run of digits,
  // issued by the telecom regulator's portal) being pasted where MSG91 wants
  // its own — a 24-character hex id from SMS -> Templates. Because MSG91
  // accepts the send either way and only rejects it later, that mistake is
  // otherwise invisible until someone reads the delivery log. Warn rather
  // than throw: the format is a strong convention, not a documented
  // guarantee, and a wrong guess here must not be what stops sign-in.
  if (!/^[0-9a-f]{24}$/i.test(templateId)) {
    console.warn(
      `[sms:suspect-template] MSG91_TEMPLATE_ID=${templateId} is not a ` +
        '24-character hex MSG91 template id. If this is the numeric DLT id, ' +
        'MSG91 will accept every send and silently deliver none.'
    );
  }

  const url = new URL('/api/v5/otp', env.msg91.apiBase);
  url.searchParams.set('template_id', templateId);
  url.searchParams.set('mobile', phone);
  url.searchParams.set('otp', code);
  url.searchParams.set('otp_expiry', String(env.msg91.otpExpiryMinutes));
  if (env.msg91.senderId) url.searchParams.set('sender', env.msg91.senderId);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        authkey: env.msg91.authKey(),
        'Content-Type': 'application/json',
      },
      // The endpoint takes its parameters in the query string, but rejects a
      // POST with no body at all.
      body: '{}',
      cache: 'no-store',
    });

    // MSG91 answers 200 with {"type":"error"} for some rejections — a
    // non-whitelisted IP, a malformed request — so the status code alone is
    // not enough.
    //
    // It does NOT do so for a bad template. Verified against the live API on
    // 2026-08-27: a request with a bogus template id, and even one with no
    // `template_id` at all, both come back {"type":"success"} with a
    // request_id. The template is resolved later, at submission, and a
    // failure there appears only in the delivery log in the MSG91 dashboard
    // ("Template ID Missing or Invalid Template"). `realTimeResponse=1` does
    // not change this. There is therefore no synchronous signal here that
    // separates a deliverable send from one that will be dropped.
    const payload = (await response.json().catch(() => null)) as {
      type?: string;
      message?: string;
      request_id?: string;
    } | null;

    if (!response.ok || payload?.type === 'error') {
      const reason = payload?.message || `HTTP ${response.status}`;
      console.error(`[sms:failed] +${phone}: ${reason}`);
      return { sent: false, reason };
    }

    // Acceptance is all that can be claimed here — see above. The operator
    // may still drop the message, and a template fault is invisible until the
    // delivery log. `request_id` is the only handle that log takes, so it is
    // logged unconditionally: without it a "sent but never arrived" report
    // cannot be traced past this line.
    const requestId = payload?.request_id ?? 'none';
    console.info(
      `[sms:accepted] sign-in code for +${phone} accepted by MSG91 ` +
        `(request_id=${requestId}) — acceptance is not delivery; check the ` +
        'MSG91 delivery log against this request_id if it never arrives'
    );
    return { sent: true, requestId };
  } catch (error) {
    // A network failure reaching MSG91 — same outcome for the customer as a
    // rejection, so it is reported the same way.
    const reason = error instanceof Error ? error.message : 'unknown error';
    console.error(`[sms:failed] +${phone}: ${reason}`);
    return { sent: false, reason };
  }
}
