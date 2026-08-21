import 'server-only';
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getCurrentAdmin } from '@/lib/auth';
import type { AdminUser } from '@/lib/admin-roles';

/**
 * Shared plumbing for the CMS routes.
 *
 * Content is open to **any** signed-in admin, not owners only. A blog whose
 * posts only the owner can write is not much of a blog, and the owner/staff
 * split is about managing people rather than about copy. To narrow it later,
 * change `requireContentAdmin` to check the role — one place, not six.
 */
export async function requireContentAdmin(): Promise<
  { admin: AdminUser; error?: undefined } | { admin?: undefined; error: NextResponse }
> {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return { error: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }) };
  }
  return { admin };
}

export async function readJson<T>(
  request: Request
): Promise<{ body: T; error?: undefined } | { body?: undefined; error: NextResponse }> {
  try {
    return { body: (await request.json()) as T };
  } catch {
    return { error: NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }) };
  }
}

export function parseId(raw: string): number | null {
  const id = Number.parseInt(raw, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/**
 * Pushes an edit live immediately.
 *
 * The public routes are ISR with an hour's window, which is right for reads
 * and wrong for the moment someone hits Save — without this, an author would
 * fix a typo and still be looking at it an hour later. The old path is
 * revalidated too, so renaming a slug does not leave the previous URL serving
 * a stale copy from the cache.
 */
export function revalidateContent(paths: Array<string | null | undefined>): void {
  const unique = Array.from(new Set(paths.filter(Boolean) as string[]));
  for (const path of unique) {
    try {
      revalidatePath(path);
    } catch (error) {
      // A failed cache purge must not fail the save — the edit is already
      // stored, and the page refreshes on its own within the hour.
      console.error(`[content] could not revalidate ${path}`, error);
    }
  }
}
