import 'server-only';
import { getPool } from '@/lib/db';

/**
 * Records a server-side failure where it can be read back: the app_errors
 * table, surfaced by /api/health.
 *
 * Never throws and never awaits the caller's flow — a failure to record a
 * failure must not turn one error into two. Uses the pool directly rather
 * than `query()`, because `query()` records its own errors and recording an
 * error about recording an error would recurse.
 *
 * Every quoted value in the message is replaced with '…'. MySQL quotes the
 * offending data in its messages ("Duplicate entry '9198…' for key …"), and
 * this table is read by a public health endpoint.
 */
export function redact(text: unknown): string {
  return String(text ?? '').replace(/'[^']*'/g, "'…'");
}

export interface RecordedError {
  id: number;
  scope: string;
  code: string | null;
  message: string;
  detail: string | null;
  created_at: string;
}

export function recordError(scope: string, error: unknown, detail?: string): void {
  const err = error as { code?: string; message?: string; stack?: string; name?: string };
  const code = typeof err?.code === 'string' ? err.code.slice(0, 40) : null;
  const message = redact(err?.message ?? error).slice(0, 500);
  // The first stack frame below the message names the function that threw,
  // which is usually the whole diagnosis. Paths are ours, not the customer's.
  const frame = (err?.stack ?? '')
    .split('\n')
    .slice(1)
    .find((line) => line.includes('/'))
    ?.trim();
  const detailText = [detail, err?.name && err.name !== 'Error' ? err.name : null, frame]
    .filter(Boolean)
    .join(' | ')
    .slice(0, 500);

  console.error(`[${scope}] ${code ?? ''} ${message}${detailText ? ` (${detailText})` : ''}`);

  getPool()
    .execute(
      'INSERT INTO app_errors (scope, code, message, detail) VALUES (?, ?, ?, ?)',
      [scope.slice(0, 80), code, message, detailText || null]
    )
    .catch(() => {
      /* nowhere left to report it */
    });
}

export async function recentErrors(limit = 5): Promise<RecordedError[]> {
  try {
    const [rows] = await getPool().execute(
      `SELECT id, scope, code, message, detail, created_at
         FROM app_errors ORDER BY id DESC LIMIT ${Math.max(1, Math.min(50, limit))}`
    );
    return (rows as RecordedError[]).map((r) => ({
      ...r,
      created_at: new Date(r.created_at).toISOString(),
    }));
  } catch {
    return [];
  }
}
