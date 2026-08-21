import { NextResponse } from 'next/server';
import { normaliseEmail } from '@/lib/auth-validation';
import { getActiveAdminByEmail } from '@/lib/admin-users';
import { createAdminResetToken } from '@/lib/password-reset';
import { sendMail, adminPasswordResetEmail } from '@/lib/mail';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Same shape as the customer endpoint: always 200, never says who exists. */
const OK = {
  ok: true,
  message: 'If that address has an admin account, a reset link is on its way.',
};

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
    checkRateLimit(`admin-reset-email:${email}`, 3, 60 * 60),
    checkRateLimit(`admin-reset-ip:${ip}`, 10, 60 * 60),
  ]);
  if (!byEmail.allowed || !byIp.allowed) return NextResponse.json(OK);

  try {
    const admin = await getActiveAdminByEmail(email);
    if (admin) {
      const token = await createAdminResetToken(admin.id);
      await sendMail(adminPasswordResetEmail(admin, token));
    }
  } catch (error) {
    console.error('[api/admin/forgot-password] failed', error);
  }

  return NextResponse.json(OK);
}
