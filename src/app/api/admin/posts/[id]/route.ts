import { NextResponse } from 'next/server';
import { getPostById, updatePost, deletePost, SlugTakenError } from '@/lib/content';
import { validatePost, slugify, type PostInput } from '@/lib/content-types';
import { requireContentAdmin, readJson, parseId, revalidateContent } from '@/lib/content-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Context {
  params: Promise<{ id: string }>;
}

/** Every path a post can appear on, so nothing is left stale after a save. */
function pathsFor(post: { slug: string; categorySlug: string | null }): string[] {
  return [
    `/blog/${post.slug}`,
    '/blog',
    post.categorySlug ? `/blog/category/${post.categorySlug}` : null,
    '/sitemap.xml',
  ].filter(Boolean) as string[];
}

export async function PATCH(request: Request, { params }: Context) {
  const auth = await requireContentAdmin();
  if (auth.error) return auth.error;

  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: 'Unknown post.' }, { status: 400 });

  const existing = await getPostById(id);
  if (!existing) return NextResponse.json({ error: 'Unknown post.' }, { status: 404 });

  const parsed = await readJson<Partial<PostInput>>(request);
  if (parsed.error) return parsed.error;

  const input = {
    ...parsed.body,
    slug: (parsed.body.slug || slugify(parsed.body.title ?? '')).trim(),
  };

  const { valid, errors } = validatePost(input);
  if (!valid) return NextResponse.json({ errors }, { status: 422 });

  try {
    const post = await updatePost(id, input as PostInput, auth.admin.name);
    // Both the old and new locations: a moved post or a re-filed category
    // otherwise leaves the previous URL cached.
    revalidateContent([...pathsFor(existing), ...(post ? pathsFor(post) : [])]);
    return NextResponse.json({ post });
  } catch (error) {
    if (error instanceof SlugTakenError) {
      return NextResponse.json(
        { errors: { slug: 'That slug is already in use.' } },
        { status: 409 }
      );
    }
    console.error('[api/admin/posts] update failed', error);
    return NextResponse.json({ error: 'We could not save that post.' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const auth = await requireContentAdmin();
  if (auth.error) return auth.error;

  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: 'Unknown post.' }, { status: 400 });

  const existing = await getPostById(id);
  if (!existing) return NextResponse.json({ error: 'Unknown post.' }, { status: 404 });

  try {
    await deletePost(id);
    revalidateContent(pathsFor(existing));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[api/admin/posts] delete failed', error);
    return NextResponse.json({ error: 'We could not delete that post.' }, { status: 500 });
  }
}
