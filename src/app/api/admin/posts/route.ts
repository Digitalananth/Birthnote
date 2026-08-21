import { NextResponse } from 'next/server';
import { createPost, SlugTakenError } from '@/lib/content';
import { validatePost, slugify, type PostInput } from '@/lib/content-types';
import { requireContentAdmin, readJson, revalidateContent } from '@/lib/content-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/admin/posts — create a blog post. */
export async function POST(request: Request) {
  const auth = await requireContentAdmin();
  if (auth.error) return auth.error;

  const parsed = await readJson<Partial<PostInput>>(request);
  if (parsed.error) return parsed.error;

  const input = {
    ...parsed.body,
    slug: (parsed.body.slug || slugify(parsed.body.title ?? '')).trim(),
  };

  const { valid, errors } = validatePost(input);
  if (!valid) return NextResponse.json({ errors }, { status: 422 });

  try {
    const post = await createPost(input as PostInput, auth.admin.name);
    revalidateContent([`/blog/${post.slug}`, '/blog', '/sitemap.xml']);
    return NextResponse.json({ post }, { status: 201 });
  } catch (error) {
    if (error instanceof SlugTakenError) {
      return NextResponse.json(
        { errors: { slug: 'That slug is already in use.' } },
        { status: 409 }
      );
    }
    console.error('[api/admin/posts] create failed', error);
    return NextResponse.json({ error: 'We could not save that post.' }, { status: 500 });
  }
}
