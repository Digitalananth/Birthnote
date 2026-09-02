import { NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/auth';
import { addItemPhoto, PhotoRejected } from '@/lib/order-photos';
import { PHOTO_MAX_BYTES } from '@/lib/order-photo-types';
import { isValidReference } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/orders/:reference/items/:itemId/photos
 *
 * Uploads one photograph of the note that was found. Multipart, because the
 * browser is sending a file the admin picked or shot on their phone, and
 * base64 in JSON would inflate every upload by a third for nothing.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ reference: string; itemId: string }> }
) {
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

  let file: File | null = null;
  try {
    const form = await request.formData();
    const value = form.get('photo');
    if (value instanceof File) file = value;
  } catch {
    return NextResponse.json({ error: 'Invalid upload.' }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: 'No photo was attached.' }, { status: 400 });

  // Checked before reading the body into memory as well as inside the library,
  // so an oversized file is refused rather than buffered first.
  if (file.size > PHOTO_MAX_BYTES) {
    return NextResponse.json(
      { error: `Photos must be under ${Math.round(PHOTO_MAX_BYTES / (1024 * 1024))}MB.` },
      { status: 413 }
    );
  }

  try {
    const photos = await addItemPhoto(
      reference,
      id,
      { contentType: file.type, data: Buffer.from(await file.arrayBuffer()) },
      admin.email
    );
    if (!photos) return NextResponse.json({ error: 'Order or note not found.' }, { status: 404 });
    return NextResponse.json({ photos });
  } catch (error) {
    if (error instanceof PhotoRejected) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    console.error('[api/admin/orders/items/photos] upload failed', error);
    return NextResponse.json({ error: 'We could not save that photo.' }, { status: 500 });
  }
}
