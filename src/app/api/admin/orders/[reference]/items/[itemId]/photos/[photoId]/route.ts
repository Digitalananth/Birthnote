import { NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/auth';
import { deleteItemPhoto } from '@/lib/order-photos';
import { isValidReference } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * DELETE /api/admin/orders/:reference/items/:itemId/photos/:photoId
 *
 * Removes a photo — the wrong note, a blurred shot. Deleting the picture never
 * touches the note's availability or price: those are separate decisions.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ reference: string; itemId: string; photoId: string }> }
) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

  const { reference, itemId, photoId } = await params;
  if (!isValidReference(reference)) {
    return NextResponse.json({ error: 'Invalid reference.' }, { status: 400 });
  }
  const id = Number.parseInt(itemId, 10);
  const photo = Number.parseInt(photoId, 10);
  if (!Number.isFinite(id) || !Number.isFinite(photo)) {
    return NextResponse.json({ error: 'Unknown photo.' }, { status: 400 });
  }

  try {
    const photos = await deleteItemPhoto(reference, id, photo);
    if (!photos) return NextResponse.json({ error: 'Order or note not found.' }, { status: 404 });
    return NextResponse.json({ photos });
  } catch (error) {
    console.error('[api/admin/orders/items/photos] delete failed', error);
    return NextResponse.json({ error: 'We could not remove that photo.' }, { status: 500 });
  }
}
