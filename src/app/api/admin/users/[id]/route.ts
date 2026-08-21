import { NextResponse } from 'next/server';
import { getCurrentAdmin, destroyAllAdminSessions } from '@/lib/auth';
import {
  getAdminById,
  updateAdmin,
  deleteAdmin,
  countOtherActiveOwners,
  ADMIN_ROLES,
  type AdminRole,
} from '@/lib/admin-users';
import { normaliseEmail } from '@/lib/auth-validation';
import { EmailTakenError } from '@/lib/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Context {
  params: Promise<{ id: string }>;
}

/** Owners only, for every method here. */
async function authorise(id: string) {
  const actor = await getCurrentAdmin();
  if (!actor) return { error: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }) };
  if (actor.role !== 'owner') {
    return {
      error: NextResponse.json({ error: 'Only an owner can manage admins.' }, { status: 403 }),
    };
  }

  const targetId = Number.parseInt(id, 10);
  if (!Number.isFinite(targetId)) {
    return { error: NextResponse.json({ error: 'Unknown admin.' }, { status: 400 }) };
  }

  const target = await getAdminById(targetId);
  if (!target) {
    return { error: NextResponse.json({ error: 'Unknown admin.' }, { status: 404 }) };
  }

  return { actor, target };
}

/** PATCH /api/admin/users/:id — rename, change role, activate or deactivate. */
export async function PATCH(request: Request, { params }: Context) {
  const { id } = await params;
  const auth = await authorise(id);
  if (auth.error) return auth.error;
  const { actor, target } = auth;

  let body: { name?: string; email?: string; role?: string; isActive?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const name = (body.name ?? '').trim();
  const email = normaliseEmail(body.email ?? '');
  const role = (body.role ?? target.role) as AdminRole;
  const isActive = body.isActive ?? target.isActive;

  const errors: Record<string, string> = {};
  if (!name) errors.name = 'Enter a name';
  if (!email) errors.email = 'Enter an email address';
  if (!ADMIN_ROLES.includes(role)) errors.role = 'Choose a role';
  if (Object.keys(errors).length) return NextResponse.json({ errors }, { status: 422 });

  // An owner locking themselves out is the one mistake with no way back short
  // of editing the database by hand, so demoting or deactivating yourself is
  // refused outright rather than warned about.
  if (target.id === actor.id && (role !== 'owner' || !isActive)) {
    return NextResponse.json(
      { error: 'You cannot remove your own owner access. Ask another owner to do it.' },
      { status: 409 }
    );
  }

  // Backstop for the same trap. Unreachable while the self-check above stands
  // — any *other* actor here is themselves an active owner, so one always
  // remains — but it is what stops a lockout if that check is ever relaxed.
  if (target.role === 'owner' && (role !== 'owner' || !isActive)) {
    if ((await countOtherActiveOwners(target.id)) === 0) {
      return NextResponse.json(
        { error: 'This is the last active owner. Promote someone else first.' },
        { status: 409 }
      );
    }
  }

  try {
    const updated = await updateAdmin(target.id, { name, email, role, isActive });

    // Losing access has to take effect now, not whenever the session expires.
    if (!isActive) await destroyAllAdminSessions(target.id);

    return NextResponse.json({ admin: updated });
  } catch (error) {
    if (error instanceof EmailTakenError) {
      return NextResponse.json(
        { errors: { email: 'Another admin already uses that email address.' } },
        { status: 409 }
      );
    }
    console.error('[api/admin/users] update failed', error);
    return NextResponse.json({ error: 'We could not save that change.' }, { status: 500 });
  }
}

/** DELETE /api/admin/users/:id — remove an admin account entirely. */
export async function DELETE(_request: Request, { params }: Context) {
  const { id } = await params;
  const auth = await authorise(id);
  if (auth.error) return auth.error;
  const { actor, target } = auth;

  if (target.id === actor.id) {
    return NextResponse.json({ error: 'You cannot delete your own account.' }, { status: 409 });
  }
  // Same backstop as PATCH: redundant while self-deletion is refused, kept so
  // relaxing that rule cannot silently delete the last way in.
  if (target.role === 'owner' && (await countOtherActiveOwners(target.id)) === 0) {
    return NextResponse.json(
      { error: 'This is the last active owner. Promote someone else first.' },
      { status: 409 }
    );
  }

  try {
    // Sessions cascade with the row, but delete them first so access ends even
    // if the row delete is somehow rolled back.
    await destroyAllAdminSessions(target.id);
    await deleteAdmin(target.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[api/admin/users] delete failed', error);
    return NextResponse.json({ error: 'We could not delete that account.' }, { status: 500 });
  }
}
