import { NextResponse } from 'next/server';
import { getPageById, updatePage, deletePage, SlugTakenError } from '@/lib/content';
import { validatePage, slugify, type PageInput } from '@/lib/content-types';
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
  if (!id) return NextResponse.json({ error: 'Unknown page.' }, { status: 400 });

  const existing = await getPageById(id);
  if (!existing) return NextResponse.json({ error: 'Unknown page.' }, { status: 404 });

  const parsed = await readJson<Partial<PageInput>>(request);
  if (parsed.error) return parsed.error;

  const input = {
    ...parsed.body,
    slug: (parsed.body.slug || slugify(parsed.body.title ?? '')).trim(),
  };

  const { valid, errors } = validatePage(input);
  if (!valid) return NextResponse.json({ errors }, { status: 422 });

  try {
    const page = await updatePage(id, input as PageInput, auth.admin.email);
    // The old path too: renaming a slug otherwise leaves the previous URL
    // serving a cached copy of a page that has moved.
    revalidateContent([`/${page?.slug}`, `/${existing.slug}`, '/sitemap.xml']);
    return NextResponse.json({ page });
  } catch (error) {
    if (error instanceof SlugTakenError) {
      return NextResponse.json(
        { errors: { slug: 'That slug is already in use.' } },
        { status: 409 }
      );
    }
    console.error('[api/admin/pages] update failed', error);
    return NextResponse.json({ error: 'We could not save that page.' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const auth = await requireContentAdmin();
  if (auth.error) return auth.error;

  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: 'Unknown page.' }, { status: 400 });

  const existing = await getPageById(id);
  if (!existing) return NextResponse.json({ error: 'Unknown page.' }, { status: 404 });

  try {
    await deletePage(id);
    revalidateContent([`/${existing.slug}`, '/sitemap.xml']);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[api/admin/pages] delete failed', error);
    return NextResponse.json({ error: 'We could not delete that page.' }, { status: 500 });
  }
}
