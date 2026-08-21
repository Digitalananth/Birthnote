import { NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/auth';
import { createAdmin, ADMIN_ROLES, type AdminRole } from '@/lib/admin-users';
import { createAdminResetToken } from '@/lib/password-reset';
import { sendMail, adminInviteEmail } from '@/lib/mail';
import { normaliseEmail } from '@/lib/auth-validation';
import { EmailTakenError } from '@/lib/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/users — create an admin account. Owners only.
 *
 * No password is set here. The new admin is emailed a one-time link and
 * chooses their own, so nobody ever has to send a password by email or know
 * a colleague's.
 */
export async function POST(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (admin.role !== 'owner') {
    return NextResponse.json({ error: 'Only an owner can manage admins.' }, { status: 403 });
  }

  let body: { name?: string; email?: string; role?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const name = (body.name ?? '').trim();
  const email = normaliseEmail(body.email ?? '');
  const role = (body.role ?? 'staff') as AdminRole;

  const errors: Record<string, string> = {};
  if (!name) errors.name = 'Enter a name';
  else if (name.length > 160) errors.name = 'Name is too long';
  if (!email) errors.email = 'Enter an email address';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 190) {
    errors.email = 'Enter a valid email address';
  }
  if (!ADMIN_ROLES.includes(role)) errors.role = 'Choose a role';
  if (Object.keys(errors).length) return NextResponse.json({ errors }, { status: 422 });

  try {
    // A random placeholder password: the account cannot be signed into until
    // the invite link is used, and no human ever knows this value.
    const created = await createAdmin({
      name,
      email,
      role,
      password: `unset-${crypto.randomUUID()}`,
    });

    const token = await createAdminResetToken(created.id);
    await sendMail(adminInviteEmail({ ...created, role: created.role }, token));

    return NextResponse.json({ admin: created }, { status: 201 });
  } catch (error) {
    if (error instanceof EmailTakenError) {
      return NextResponse.json(
        { errors: { email: 'An admin with that email already exists.' } },
        { status: 409 }
      );
    }
    console.error('[api/admin/users] create failed', error);
    return NextResponse.json({ error: 'We could not create that account.' }, { status: 500 });
  }
}
