import { NextResponse } from 'next/server';
import { requireOwnerApi } from '@/lib/admin-api';
import { readJson } from '@/lib/content-admin';
import { createOption, DuplicateOptionError } from '@/lib/master-options';
import { isMasterListKey, validateOptionValue } from '@/lib/master-option-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/admin/master-options — add one option to a list. */
export async function POST(request: Request) {
  const auth = await requireOwnerApi();
  if (auth.error) return auth.error;

  const parsed = await readJson<{ listKey?: string; value?: string }>(request);
  if (parsed.error) return parsed.error;

  const { listKey, value } = parsed.body;
  if (!isMasterListKey(listKey)) {
    return NextResponse.json({ error: 'Unknown list.' }, { status: 400 });
  }

  const checked = validateOptionValue(listKey, value ?? '');
  if (!checked.value) {
    return NextResponse.json({ error: checked.error }, { status: 422 });
  }

  try {
    const option = await createOption(listKey, checked.value);
    return NextResponse.json({ option }, { status: 201 });
  } catch (error) {
    if (error instanceof DuplicateOptionError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('[api/admin/master-options] create failed', error);
    return NextResponse.json({ error: 'We could not add that option.' }, { status: 500 });
  }
}
