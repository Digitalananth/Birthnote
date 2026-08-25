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
  sent: boolean;
  /** Present when MSG91 rejected the send — for the log, never for the user. */
  reason?: string;
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

  const url = new URL('/api/v5/otp', env.msg91.apiBase);
  url.searchParams.set('template_id', env.msg91.templateId());
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

    // MSG91 answers 200 with {"type":"error"} for a bad template or an
    // unreachable number, so the status code alone is not enough.
    const payload = (await response.json().catch(() => null)) as {
      type?: string;
      message?: string;
    } | null;

    if (!response.ok || payload?.type === 'error') {
      const reason = payload?.message || `HTTP ${response.status}`;
      console.error(`[sms:failed] +${phone}: ${reason}`);
      return { sent: false, reason };
    }

    console.info(`[sms:sent] sign-in code to +${phone}`);
    return { sent: true };
  } catch (error) {
    // A network failure reaching MSG91 — same outcome for the customer as a
    // rejection, so it is reported the same way.
    const reason = error instanceof Error ? error.message : 'unknown error';
    console.error(`[sms:failed] +${phone}: ${reason}`);
    return { sent: false, reason };
  }
}
