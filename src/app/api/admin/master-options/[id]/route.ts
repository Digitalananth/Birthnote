import { NextResponse } from 'next/server';
import { requireOwnerApi } from '@/lib/admin-api';
import { parseId, readJson } from '@/lib/content-admin';
import { deleteOption, moveOption, setOptionActive } from '@/lib/master-options';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * PATCH /api/admin/master-options/[id] — hide, show, or reorder one option.
 *
 * `{ isActive: false }` takes an option out of the customer's dropdown without
 * losing it, which is the honest record of something once offered and now
 * withdrawn. `{ move: 'up' | 'down' }` shuffles it within its list.
 */
export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireOwnerApi();
  if (auth.error) return auth.error;

  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: 'Unknown option.' }, { status: 404 });

  const parsed = await readJson<{ isActive?: boolean; move?: 'up' | 'down' }>(request);
  if (parsed.error) return parsed.error;

  const { isActive, move } = parsed.body;

  if (move === 'up' || move === 'down') {
    // A move that runs off the end of the list is not an error — the option is
    // simply already where it was asked to go.
    await moveOption(id, move);
    return NextResponse.json({ ok: true });
  }

  if (typeof isActive === 'boolean') {
    const changed = await setOptionActive(id, isActive);
    if (!changed) return NextResponse.json({ error: 'Unknown option.' }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
}

/**
 * DELETE /api/admin/master-options/[id] — remove an option for good.
 *
 * Safe because orders store the chosen value as text and never an id into this
 * table: deleting "Uncle" cannot orphan an order that asked for one.
 */
export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireOwnerApi();
  if (auth.error) return auth.error;

  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: 'Unknown option.' }, { status: 404 });

  const removed = await deleteOption(id);
  if (!removed) return NextResponse.json({ error: 'Unknown option.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
