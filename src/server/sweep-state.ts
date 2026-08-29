import 'server-only';

/**
 * When the scheduled sweep last completed, for /api/health.
 *
 * It lives here rather than in the route because a Next.js route module may
 * only export route handlers — exporting a helper from one is a build error.
 *
 * Per process and in memory: with several workers, a null here is not proof
 * the sweep never ran. A null that never becomes a timestamp is, and that is
 * the signal worth having — it means the cron is not reaching the app at all.
 */
const globalForSweep = globalThis as unknown as { birthnoteLastSweepAt?: string };

export function recordSweep(): string {
  const at = new Date().toISOString();
  globalForSweep.birthnoteLastSweepAt = at;
  return at;
}

export function lastSweepAt(): string | null {
  return globalForSweep.birthnoteLastSweepAt ?? null;
}
