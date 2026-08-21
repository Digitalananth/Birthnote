import { NextResponse } from 'next/server';
import { normaliseEmail } from '@/lib/auth-validation';
import { getUserByEmail } from '@/lib/users';
import { createResetToken } from '@/lib/password-reset';
import { sendMail, passwordResetEmail } from '@/lib/mail';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/forgot-password
 *
 * Always answers 200 with the same message, whether or not the address has an
 * account. Anything else tells a stranger who is registered here.
 */
const OK = { ok: true, message: 'If that address has an account, a reset link is on its way.' };

export async function POST(request: Request) {
  let email = '';
  try {
    email = normaliseEmail(String(((await request.json()) as { email?: string }).email || ''));
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  if (!email) {
    return NextResponse.json({ errors: { email: 'Enter your email address' } }, { status: 422 });
  }

  const ip = clientIp(request.headers);
  const [byEmail, byIp] = await Promise.all([
    checkRateLimit(`reset-email:${email}`, 3, 60 * 60),
    checkRateLimit(`reset-ip:${ip}`, 10, 60 * 60),
  ]);
  // Still a 200: a 429 here would leak that this address is being targeted.
  if (!byEmail.allowed || !byIp.allowed) return NextResponse.json(OK);

  try {
    const user = await getUserByEmail(email);
    if (user) {
      const token = await createResetToken(user.id);
      await sendMail(passwordResetEmail(user, token));
    }
  } catch (error) {
    // Logged, not surfaced — the response must not vary.
    console.error('[api/auth/forgot-password] failed', error);
  }

  return NextResponse.json(OK);
}
