import { NextResponse } from 'next/server';
import { adminCookie, destroyAdminSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  await destroyAdminSession();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(adminCookie.name, '', { ...adminCookie.options, maxAge: 0 });
  // Also clear the pre-rename cookie, or signing out would leave it behind and
  // sign the admin straight back in on the next request.
  response.cookies.set(adminCookie.legacyName, '', { ...adminCookie.options, maxAge: 0 });
  return response;
}
