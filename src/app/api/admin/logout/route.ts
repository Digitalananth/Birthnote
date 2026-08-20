import { NextResponse } from 'next/server';
import { adminCookie } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(adminCookie.name, '', { ...adminCookie.options, maxAge: 0 });
  return response;
}
