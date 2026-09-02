import { NextResponse } from 'next/server';
import { getPhotoBytes } from '@/lib/order-photos';
import { isValidReference } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/orders/:reference/photos/:photoId — the image itself.
 *
 * Public, on the same terms as the tracking page: the reference is the
 * capability, and a photo only answers to the order it belongs to, so a
 * guessed id against someone else's reference is a 404 rather than a leak.
 *
 * Cached privately and immutably — the bytes behind an id never change, only
 * whether the id still exists — which keeps a customer refreshing their order
 * from pulling the same blob out of MySQL again.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reference: string; photoId: string }> }
) {
  const { reference, photoId } = await params;
  if (!isValidReference(reference)) {
    return NextResponse.json({ error: 'Invalid reference number.' }, { status: 400 });
  }
  const id = Number.parseInt(photoId, 10);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const photo = await getPhotoBytes(reference, id);
  if (!photo) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  return new NextResponse(new Uint8Array(photo.data), {
    headers: {
      'Content-Type': photo.contentType,
      'Content-Length': String(photo.data.length),
      'Cache-Control': 'private, max-age=31536000, immutable',
      // Belt and braces: an image route should never be talked into rendering
      // as something else by a browser sniffing the bytes.
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
