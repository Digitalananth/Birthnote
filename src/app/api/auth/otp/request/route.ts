import { NextResponse } from 'next/server';
import { validateIdentifierEntry, type IdentifierValues } from '@/lib/auth-validation';
import { getUserByIdentifier } from '@/lib/users';
import { issueOtp, resendCooldown } from '@/lib/otp';
import { sendOtpSms } from '@/lib/sms';
import { sendMail, signInCodeEmail } from '@/lib/mail';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/otp/request — send a sign-in code to a mobile number or an
 * email address.
 *
 * Step one of the only way customers sign in. Which of the two they typed is
 * decided by `validateIdentifierEntry` and nothing else; whether it already
 * has an account makes no difference here, since the account is created, if it
 * needs to be, once the code comes back verified.
 *
 * Every code lands somewhere that may not belong to the person asking — and by
 * SMS it also costs money — so this endpoint is defended in three independent
 * ways: a per-identifier cooldown, a per-identifier hourly cap, and a per-IP
 * hourly cap. Any one alone leaves a hole: the IP limits do not stop a botnet
 * hammering one number, and the identifier limits do not stop one host working
 * through a list.
 */
export async function POST(request: Request) {
  let body: Partial<IdentifierValues>;
  try {
    body = (await request.json()) as Partial<IdentifierValues>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const check = validateIdentifierEntry(body);
  if (!check.valid || !check.normalised) {
    return NextResponse.json({ errors: check.errors }, { status: 422 });
  }
  const { identifier, channel } = check.normalised;

  const ip = clientIp(request.headers);
  const [byIp, byIdentifier] = await Promise.all([
    checkRateLimit(`otp-ip:${ip}`, 20, 60 * 60),
    checkRateLimit(`otp-id:${channel}:${identifier}`, 5, 60 * 60),
  ]);
  if (!byIp.allowed || !byIdentifier.allowed) {
    return NextResponse.json(
      { error: 'Too many codes requested. Please try again in an hour.' },
      { status: 429 }
    );
  }

  const wait = await resendCooldown(identifier, channel);
  if (wait > 0) {
    return NextResponse.json(
      { error: `Please wait ${wait} seconds before asking for another code.`, retryAfter: wait },
      { status: 429 }
    );
  }

  try {
    const { code, expiresInSeconds } = await issueOtp(identifier, channel);

    if (channel === 'sms') {
      const result = await sendOtpSms(identifier, code);
      if (!result.sent) {
        // This failure cannot be swallowed the way an order confirmation can:
        // without the message there is no way to finish signing in, so say so
        // rather than leaving the customer at a code box waiting for something
        // that never comes. The reason MSG91 gave stays in the log — it names
        // infrastructure.
        return NextResponse.json(
          { error: 'We could not send your code right now. Please try again in a moment.' },
          { status: 502 }
        );
      }
    } else {
      const delivered = await sendMail(
        signInCodeEmail(identifier, code, Math.round(expiresInSeconds / 60))
      );
      // `sendMail` also returns false with SMTP switched off, having printed
      // the code to the console — that is how the flow is exercised locally,
      // so it must not read as a delivery failure.
      if (!delivered && env.smtp.enabled()) {
        return NextResponse.json(
          { error: 'We could not send your code right now. Please try again in a moment.' },
          { status: 502 }
        );
      }
    }

    // Whether this identifier is new decides one thing in the form: whether to
    // ask for a name on the next step. It does tell a caller which numbers and
    // addresses have accounts — the rate limits above are what keep that from
    // being a usable way to enumerate customers, and knowing it is worth more
    // to the person signing in than to an attacker who already has both.
    const existing = await getUserByIdentifier(identifier, channel);

    return NextResponse.json({
      sent: true,
      identifier,
      channel,
      isNewAccount: !existing,
      expiresInSeconds,
      resendInSeconds: env.auth.otpResendSeconds,
    });
  } catch (error) {
    console.error('[api/auth/otp/request] failed', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
