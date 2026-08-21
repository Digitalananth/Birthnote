import { NextResponse } from 'next/server';
import {
  getCategoryById,
  updateCategory,
  deleteCategory,
  SlugTakenError,
  type CategoryInput,
} from '@/lib/content';
import { validateCategory, slugify } from '@/lib/content-types';
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
  if (!id) return NextResponse.json({ error: 'Unknown category.' }, { status: 400 });

  const existing = await getCategoryById(id);
  if (!existing) return NextResponse.json({ error: 'Unknown category.' }, { status: 404 });

  const parsed = await readJson<Partial<CategoryInput>>(request);
  if (parsed.error) return parsed.error;

  const input = {
    ...parsed.body,
    slug: (parsed.body.slug || slugify(parsed.body.name ?? '')).trim(),
  };

  const { valid, errors } = validateCategory({
    name: input.name,
    slug: input.slug,
    description: input.description ?? undefined,
  });
  if (!valid) return NextResponse.json({ errors }, { status: 422 });

  try {
    const category = await updateCategory(id, input as CategoryInput);
    revalidateContent([
      '/blog',
      `/blog/category/${existing.slug}`,
      category ? `/blog/category/${category.slug}` : null,
      '/sitemap.xml',
    ]);
    return NextResponse.json({ category });
  } catch (error) {
    if (error instanceof SlugTakenError) {
      return NextResponse.json(
        { errors: { slug: 'That slug is already in use.' } },
        { status: 409 }
      );
    }
    console.error('[api/admin/categories] update failed', error);
    return NextResponse.json({ error: 'We could not save that category.' }, { status: 500 });
  }
}

/**
 * Posts filed under a deleted category keep their writing — the foreign key
 * sets `category_id` to null rather than cascading.
 */
export async function DELETE(_request: Request, { params }: Context) {
  const auth = await requireContentAdmin();
  if (auth.error) return auth.error;

  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: 'Unknown category.' }, { status: 400 });

  const existing = await getCategoryById(id);
  if (!existing) return NextResponse.json({ error: 'Unknown category.' }, { status: 404 });

  try {
    await deleteCategory(id);
    revalidateContent(['/blog', `/blog/category/${existing.slug}`, '/sitemap.xml']);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[api/admin/categories] delete failed', error);
    return NextResponse.json({ error: 'We could not delete that category.' }, { status: 500 });
  }
}
