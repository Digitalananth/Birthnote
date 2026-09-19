import { NextResponse } from 'next/server';
import { getGalleryPhotoById, updateGalleryPhoto, deleteGalleryPhoto } from '@/lib/gallery';
import { validateGalleryPhoto, type GalleryPhotoInput } from '@/lib/content-types';
import { requireContentAdmin, readJson, parseId, revalidateContent } from '@/lib/content-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Context {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: Context) {
  const auth = await requireContentAdmin();
  if (auth.error) return auth.error;

  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: 'Unknown photo.' }, { status: 400 });
  if (!(await getGalleryPhotoById(id))) {
    return NextResponse.json({ error: 'Unknown photo.' }, { status: 404 });
  }

  const parsed = await readJson<Partial<GalleryPhotoInput>>(request);
  if (parsed.error) return parsed.error;

  const { valid, errors } = validateGalleryPhoto(parsed.body);
  if (!valid) return NextResponse.json({ errors }, { status: 422 });

  try {
    const photo = await updateGalleryPhoto(id, parsed.body as GalleryPhotoInput, auth.admin.name);
    revalidateContent(['/', '/gallery']);
    return NextResponse.json({ photo });
  } catch (error) {
    console.error('[api/admin/gallery] update failed', error);
    return NextResponse.json({ error: 'We could not save that photo.' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const auth = await requireContentAdmin();
  if (auth.error) return auth.error;

  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: 'Unknown photo.' }, { status: 400 });

  try {
    await deleteGalleryPhoto(id);
    revalidateContent(['/', '/gallery']);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[api/admin/gallery] delete failed', error);
    return NextResponse.json({ error: 'We could not delete that photo.' }, { status: 500 });
  }
}
