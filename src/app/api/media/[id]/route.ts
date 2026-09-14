import { NextResponse } from 'next/server';
import { getMediaBytes } from '@/lib/media';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/media/:id — an uploaded CMS image.
 *
 * Public and immutably cached: the bytes behind an id never change (a new
 * upload is a new id), so browsers and the CDN can keep them for a year.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const id = Number.parseInt(raw, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const media = await getMediaBytes(id);
  if (!media) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  return new NextResponse(new Uint8Array(media.data), {
    headers: {
      'Content-Type': media.contentType,
      'Content-Length': String(media.data.length),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
