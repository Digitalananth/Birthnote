import 'server-only';
import { query } from '@/lib/db';

/**
 * Database-backed fixed-window rate limiter.
 *
 * An in-memory counter would reset on every deploy and would not be shared if
 * the host runs more than one Node process, so the counter lives in MySQL.
 * The whole check is one atomic upsert.
 */
export async function checkRateLimit(
  bucket: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; hits: number }> {
  try {
    await query(
      `INSERT INTO rate_limits (bucket, hits, window_start)
         VALUES (?, 1, UTC_TIMESTAMP())
       ON DUPLICATE KEY UPDATE
         hits = IF(window_start < UTC_TIMESTAMP() - INTERVAL ? SECOND, 1, hits + 1),
         window_start = IF(window_start < UTC_TIMESTAMP() - INTERVAL ? SECOND, UTC_TIMESTAMP(), window_start)`,
      [bucket, windowSeconds, windowSeconds]
    );
    const rows = await query<{ hits: number }[]>(
      'SELECT hits FROM rate_limits WHERE bucket = ?',
      [bucket]
    );
    const hits = Number(rows[0]?.hits ?? 1);
    return { allowed: hits <= limit, hits };
  } catch (error) {
    // Never let the limiter take the site down — fail open and log.
    console.error('[rate-limit] check failed, allowing request', error);
    return { allowed: true, hits: 0 };
  }
}

/** Best-effort client IP from the proxy headers Hostinger/nginx set. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return headers.get('x-real-ip')?.trim() || 'unknown';
}
