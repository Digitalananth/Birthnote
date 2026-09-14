import { NextResponse } from 'next/server';
import { requireContentAdmin } from '@/lib/content-admin';
import { addMedia, mediaSrc, MediaRejected } from '@/lib/media';
import { PHOTO_MAX_BYTES } from '@/lib/order-photo-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/media — uploads one image (multipart field `file`) and
 * answers with the URL it is served from, ready to paste into a cover field.
 */
export async function POST(request: Request) {
  const auth = await requireContentAdmin();
  if (auth.error) return auth.error;

  let file: File | null = null;
  try {
    const form = await request.formData();
    const value = form.get('file');
    if (value instanceof File) file = value;
  } catch {
    return NextResponse.json({ error: 'Invalid upload.' }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: 'No image was attached.' }, { status: 400 });

  // Refused before the body is buffered, as well as inside addMedia.
  if (file.size > PHOTO_MAX_BYTES) {
    return NextResponse.json(
      { error: `Images must be under ${Math.round(PHOTO_MAX_BYTES / (1024 * 1024))}MB.` },
      { status: 413 }
    );
  }

  try {
    const id = await addMedia(
      { contentType: file.type, data: Buffer.from(await file.arrayBuffer()) },
      auth.admin.email
    );
    return NextResponse.json({ id, url: mediaSrc(id) }, { status: 201 });
  } catch (error) {
    if (error instanceof MediaRejected) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    console.error('[api/admin/media] upload failed', error);
    return NextResponse.json({ error: 'We could not save that image.' }, { status: 500 });
  }
}
