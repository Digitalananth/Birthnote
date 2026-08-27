import { NextResponse } from 'next/server';
import { validateOtpEntry, type OtpValues } from '@/lib/auth-validation';
import {
  getUserByIdentifier,
  getUserByPhone,
  getUserByEmail,
  createUser,
  markPhoneVerified,
  markEmailVerified,
  claimGuestOrders,
  PhoneTakenError,
  EmailTakenError,
} from '@/lib/users';
import { verifyOtp, pruneExpiredOtps } from '@/lib/otp';
import { createSession, sessionCookie, pruneExpiredSessions } from '@/lib/session';
import { sendMail, welcomeEmail } from '@/lib/mail';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';
import { recordError } from '@/server/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/otp/verify — check a code and sign the person in.
 *
 * Step two, and the only place a customer account is created. Signing in and
 * signing up are the same request deliberately: with a one-time code as the
 * only credential there is nothing for a person to remember and therefore
 * nothing for them to get wrong, so asking them which of the two they meant
 * would be asking a question only the database can answer.
 *
 * The code is checked against the identifier *and* the channel it was sent on,
 * so a code texted to a number cannot be spent against an address — see
 * `src/lib/otp.ts`.
 */
export async function POST(request: Request) {
  let body: Partial<OtpValues>;
  try {
    body = (await request.json()) as Partial<OtpValues>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const check = validateOtpEntry(body);
  if (!check.valid || !check.normalised) {
    return NextResponse.json({ errors: check.errors }, { status: 422 });
  }
  const { identifier, channel, code, name, email, phone } = check.normalised;

  // The five-attempt limit on the code itself stops the keyspace being walked
  // with one code; this stops it being walked by requesting a fresh code after
  // every fifth guess.
  const ip = clientIp(request.headers);
  const byIp = await checkRateLimit(`otp-verify-ip:${ip}`, 30, 15 * 60);
  if (!byIp.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again in 15 minutes.' },
      { status: 429 }
    );
  }

  let existing: Awaited<ReturnType<typeof getUserByIdentifier>> = null;
  try {
    // The second contact detail is checked *before* the code is spent.
    // Getting it wrong is a typo, not an attack, and a one-time code that has
    // already been consumed cannot be reused — so doing this afterwards would
    // send someone back for a fresh code to correct a field the server could
    // have rejected while their code was still good. It leaks whether a number
    // or address has an account, but `/request` already answers that with
    // `isNewAccount`, so nothing new is given away. The unique keys below stay
    // the real guard: this check can be raced, they cannot.
    existing = await getUserByIdentifier(identifier, channel);
    const clash =
      channel === 'email'
        ? phone && (await getUserByPhone(phone))
        : email && (await getUserByEmail(email));
    // Someone re-submitting a detail their own account already holds is not a
    // clash — only a detail sitting on somebody else's account is.
    if (clash && clash.id !== existing?.id) {
      return NextResponse.json(
        channel === 'email'
          ? { errors: { phone: 'That mobile number is already on another account.' } }
          : { errors: { email: 'That email address is already on another account.' } },
        { status: 409 }
      );
    }

    const result = await verifyOtp(identifier, channel, code);
    if (!result.ok) {
      const message =
        result.reason === 'locked'
          ? 'Too many wrong codes. Request a new one.'
          : result.reason === 'expired'
            ? 'That code has expired. Request a new one.'
            : 'That code is not right. Check it and try again.';
      return NextResponse.json(
        {
          errors: { code: message },
          // Lets the form drop back to the first step instead of leaving the
          // customer retyping a code that can no longer work.
          expired: result.reason !== 'mismatch',
        },
        { status: 401 }
      );
    }

    const user = existing
      ? // Fills in details the account may not have had, without ever
        // overwriting ones already given.
        ((channel === 'email'
          ? await markEmailVerified(existing.id, { name, phone })
          : await markPhoneVerified(existing.id, { name, email })) ?? existing)
      : await createUser({
          phone,
          name,
          email,
          phoneVerified: channel === 'sms',
          emailVerified: channel === 'email',
        });

    // Orders placed before signing in belong to this person too — matched on
    // whichever of the account's details have been proved by a code. The second
    // contact detail collected above is not one of them: it is typed, not
    // proved, so claiming on it would hand a stranger's order history to
    // whoever typed their address or number.
    await claimGuestOrders(user);

    // Only on a genuinely new account, and only when there is somewhere to
    // send it. A failure here is swallowed inside sendMail: a bounced welcome
    // must never cost someone the session they just earned.
    if (!existing && user.email) {
      await sendMail(welcomeEmail({ name: user.name, email: user.email }));
    }

    const token = await createSession(user.id, request.headers.get('user-agent'));
    await Promise.all([pruneExpiredSessions(), pruneExpiredOtps()]);

    const response = NextResponse.json(
      { user, created: !existing },
      { status: existing ? 200 : 201 }
    );
    response.cookies.set(sessionCookie.name, token, sessionCookie.options);
    return response;
  } catch (error) {
    // Two sign-ins racing on the same brand-new identifier: one insert wins,
    // and the loser is the same person, so sending them back to the start is
    // the right answer — their next attempt finds the account the winner made.
    if (error instanceof PhoneTakenError) {
      return NextResponse.json(
        // Also reached when someone signing in by email adds a number that is
        // already another account's — the same fix either way, and naming the
        // field is what stops them retyping the code instead.
        { errors: { phone: 'That mobile number is already on another account.' } },
        { status: 409 }
      );
    }
    if (error instanceof EmailTakenError) {
      return NextResponse.json(
        { errors: { email: 'That email address is already on another account.' } },
        { status: 409 }
      );
    }
    recordError('api/auth/otp/verify', error, `channel=${channel} existing=${existing ? 'yes' : 'no'}`);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
