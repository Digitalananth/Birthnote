import { NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/auth';
import { updateOrderItem, PaidOrderError, type ItemAvailability } from '@/lib/orders';
import { isValidReference } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Context {
  params: Promise<{ reference: string; itemId: string }>;
}

const AVAILABILITIES: ItemAvailability[] = ['pending', 'available', 'unavailable'];

/**
 * PATCH /api/admin/orders/:reference/items/:itemId
 *
 * Marks one note found or not found, prices it, and records what was actually
 * pulled from the collection. The order total is recomputed from the priced,
 * available items — the admin never types a total.
 */
export async function PATCH(request: Request, { params }: Context) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const { reference, itemId } = await params;
  if (!isValidReference(reference)) {
    return NextResponse.json({ error: 'Invalid reference.' }, { status: 400 });
  }
  const id = Number.parseInt(itemId, 10);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: 'Unknown note.' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const availability = body.availability as ItemAvailability | undefined;
  if (availability !== undefined && !AVAILABILITIES.includes(availability)) {
    return NextResponse.json(
      { error: `availability must be one of: ${AVAILABILITIES.join(', ')}` },
      { status: 422 }
    );
  }

  const str = (key: string) =>
    body[key] === undefined ? undefined : String(body[key] ?? '').trim() || null;

  try {
    const order = await updateOrderItem(reference, id, {
      availability,
      pricePaise:
        body.pricePaise === undefined
          ? undefined
          : typeof body.pricePaise === 'number' && body.pricePaise > 0
            ? Math.round(body.pricePaise)
            : null,
      noteDenomination: str('noteDenomination'),
      noteCondition: str('noteCondition'),
      noteSerial: str('noteSerial'),
      noteCountry: str('noteCountry'),
    });

    if (!order) return NextResponse.json({ error: 'Order or note not found.' }, { status: 404 });
    return NextResponse.json({ order });
  } catch (error) {
    if (error instanceof PaidOrderError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('[api/admin/orders/items] update failed', error);
    return NextResponse.json({ error: 'We could not save that change.' }, { status: 500 });
  }
}
