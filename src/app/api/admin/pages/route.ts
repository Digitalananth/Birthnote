import { NextResponse } from 'next/server';
import { createPage, SlugTakenError } from '@/lib/content';
import { validatePage, slugify, type PageInput } from '@/lib/content-types';
import { requireContentAdmin, readJson, revalidateContent } from '@/lib/content-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/admin/pages — create a page. */
export async function POST(request: Request) {
  const auth = await requireContentAdmin();
  if (auth.error) return auth.error;

  const parsed = await readJson<Partial<PageInput>>(request);
  if (parsed.error) return parsed.error;

  // An author who leaves the slug blank gets one from the title.
  const input = {
    ...parsed.body,
    slug: (parsed.body.slug || slugify(parsed.body.title ?? '')).trim(),
  };

  const { valid, errors } = validatePage(input);
  if (!valid) return NextResponse.json({ errors }, { status: 422 });

  try {
    const page = await createPage(input as PageInput, auth.admin.email);
    revalidateContent([`/${page.slug}`, '/sitemap.xml']);
    return NextResponse.json({ page }, { status: 201 });
  } catch (error) {
    if (error instanceof SlugTakenError) {
      return NextResponse.json(
        { errors: { slug: 'That slug is already in use.' } },
        { status: 409 }
      );
    }
    console.error('[api/admin/pages] create failed', error);
    return NextResponse.json({ error: 'We could not save that page.' }, { status: 500 });
  }
}
