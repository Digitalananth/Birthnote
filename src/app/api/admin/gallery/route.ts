import { NextResponse } from 'next/server';
import { createGalleryPhoto } from '@/lib/gallery';
import { validateGalleryPhoto, type GalleryPhotoInput } from '@/lib/content-types';
import { requireContentAdmin, readJson, revalidateContent } from '@/lib/content-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await requireContentAdmin();
  if (auth.error) return auth.error;

  const parsed = await readJson<Partial<GalleryPhotoInput>>(request);
  if (parsed.error) return parsed.error;

  const { valid, errors } = validateGalleryPhoto(parsed.body);
  if (!valid) return NextResponse.json({ errors }, { status: 422 });

  try {
    const photo = await createGalleryPhoto(parsed.body as GalleryPhotoInput, auth.admin.name);
    revalidateContent(['/', '/gallery']);
    return NextResponse.json({ photo }, { status: 201 });
  } catch (error) {
    console.error('[api/admin/gallery] create failed', error);
    return NextResponse.json({ error: 'We could not save that photo.' }, { status: 500 });
  }
}
