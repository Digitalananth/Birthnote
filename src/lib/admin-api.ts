import 'server-only';
import { NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/auth';
import type { AdminUser } from '@/lib/admin-roles';

/**
 * Owner-only gate for an admin API route.
 *
 * The master lists are owner-only, unlike a blog post: they decide what a
 * customer can order at all — which denominations are on offer. Staff run the
 * order queue; the shape of the shopfront is the owner's. To open a route to
 * any admin, use `requireContentAdmin` instead.
 *
 * A route file may export nothing but its HTTP verbs and route config, which
 * is why this lives here rather than beside the handler that uses it.
 */
export async function requireOwnerApi(): Promise<
  { admin: AdminUser; error?: undefined } | { admin?: undefined; error: NextResponse }
> {
  const admin = await getCurrentAdmin();
  if (!admin) return { error: NextResponse.json({ error: 'Not signed in.' }, { status: 401 }) };
  if (admin.role !== 'owner') {
    return { error: NextResponse.json({ error: 'Owners only.' }, { status: 403 }) };
  }
  return { admin };
}
