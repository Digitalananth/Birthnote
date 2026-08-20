import { NextResponse } from 'next/server';
import { checkAdminPassword, createSessionToken, adminCookie } from '@/lib/auth';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/admin/login — exchange the admin password for a session cookie. */
export async function POST(request: Request) {
  const ip = clientIp(request.headers);
  // Brute-force guard: 8 attempts per 15 minutes per IP.
  const { allowed } = await checkRateLimit(`admin-login:${ip}`, 8, 15 * 60);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again in 15 minutes.' },
      { status: 429 }
    );
  }

  let password = '';
  try {
    password = String(((await request.json()) as { password?: string }).password || '');
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  try {
    if (!password || !checkAdminPassword(password)) {
      return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 });
    }
  } catch (error) {
    console.error('[admin/login] admin credentials not configured', error);
    return NextResponse.json(
      { error: 'Admin access is not configured on this server.' },
      { status: 503 }
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(adminCookie.name, createSessionToken(), adminCookie.options);
  return response;
}
