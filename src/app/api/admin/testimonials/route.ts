import { NextResponse } from 'next/server';
import { createTestimonial } from '@/lib/testimonials';
import { validateTestimonial, type TestimonialInput } from '@/lib/content-types';
import { requireContentAdmin, readJson, revalidateContent } from '@/lib/content-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await requireContentAdmin();
  if (auth.error) return auth.error;

  const parsed = await readJson<Partial<TestimonialInput>>(request);
  if (parsed.error) return parsed.error;

  const { valid, errors } = validateTestimonial(parsed.body);
  if (!valid) return NextResponse.json({ errors }, { status: 422 });

  try {
    const testimonial = await createTestimonial(parsed.body as TestimonialInput, auth.admin.name);
    revalidateContent(['/']);
    return NextResponse.json({ testimonial }, { status: 201 });
  } catch (error) {
    console.error('[api/admin/testimonials] create failed', error);
    return NextResponse.json({ error: 'We could not save that story.' }, { status: 500 });
  }
}
