import { NextResponse } from 'next/server';
import { createCategory, SlugTakenError, type CategoryInput } from '@/lib/content';
import { validateCategory, slugify } from '@/lib/content-types';
import { requireContentAdmin, readJson, revalidateContent } from '@/lib/content-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await requireContentAdmin();
  if (auth.error) return auth.error;

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
    const category = await createCategory(input as CategoryInput);
    revalidateContent(['/blog', `/blog/category/${category.slug}`, '/sitemap.xml']);
    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    if (error instanceof SlugTakenError) {
      return NextResponse.json(
        { errors: { slug: 'That slug is already in use.' } },
        { status: 409 }
      );
    }
    console.error('[api/admin/categories] create failed', error);
    return NextResponse.json({ error: 'We could not save that category.' }, { status: 500 });
  }
}
