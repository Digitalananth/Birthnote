import { NextResponse } from 'next/server';
import { destroySession, sessionCookie } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  await destroySession();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookie.name, '', { ...sessionCookie.options, maxAge: 0 });
  return response;
}
