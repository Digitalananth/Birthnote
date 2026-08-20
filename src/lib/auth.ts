import 'server-only';
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';

/**
 * Minimal signed-cookie session for the admin panel.
 *
 * There is exactly one admin (the shop owner), so a full user table would be
 * overhead. The cookie holds `issuedAt.nonce.hmac`; without the server secret
 * it cannot be forged, and the timestamp expires it.
 */
const COOKIE_NAME = 'birthnote_admin';
const MAX_AGE_SECONDS = 60 * 60 * 12;

function sign(payload: string): string {
  return createHmac('sha256', env.admin.sessionSecret()).update(payload).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function createSessionToken(): string {
  const payload = `${Date.now()}.${randomBytes(12).toString('hex')}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [issuedAt, nonce, signature] = parts;
  if (!safeEqual(signature, sign(`${issuedAt}.${nonce}`))) return false;
  const age = (Date.now() - Number.parseInt(issuedAt, 10)) / 1000;
  return Number.isFinite(age) && age >= 0 && age < MAX_AGE_SECONDS;
}

/** Constant-time password check so the endpoint leaks no timing signal. */
export function checkAdminPassword(candidate: string): boolean {
  const expected = env.admin.password();
  const a = createHmac('sha256', 'pw').update(candidate).digest();
  const b = createHmac('sha256', 'pw').update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function isAdminAuthenticated(): Promise<boolean> {
  try {
    const store = await cookies();
    return verifySessionToken(store.get(COOKIE_NAME)?.value);
  } catch {
    return false;
  }
}

export const adminCookie = {
  name: COOKIE_NAME,
  options: {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  },
};
