import { NextResponse } from 'next/server';
import { getTestimonialById, updateTestimonial, deleteTestimonial } from '@/lib/testimonials';
import { validateTestimonial, type TestimonialInput } from '@/lib/content-types';
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
  if (!id) return NextResponse.json({ error: 'Unknown story.' }, { status: 400 });
  if (!(await getTestimonialById(id))) {
    return NextResponse.json({ error: 'Unknown story.' }, { status: 404 });
  }

  const parsed = await readJson<Partial<TestimonialInput>>(request);
  if (parsed.error) return parsed.error;

  const { valid, errors } = validateTestimonial(parsed.body);
  if (!valid) return NextResponse.json({ errors }, { status: 422 });

  try {
    const testimonial = await updateTestimonial(
      id,
      parsed.body as TestimonialInput,
      auth.admin.name
    );
    revalidateContent(['/']);
    return NextResponse.json({ testimonial });
  } catch (error) {
    console.error('[api/admin/testimonials] update failed', error);
    return NextResponse.json({ error: 'We could not save that story.' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const auth = await requireContentAdmin();
  if (auth.error) return auth.error;

  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: 'Unknown story.' }, { status: 400 });

  try {
    await deleteTestimonial(id);
    revalidateContent(['/']);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[api/admin/testimonials] delete failed', error);
    return NextResponse.json({ error: 'We could not delete that story.' }, { status: 500 });
  }
}
