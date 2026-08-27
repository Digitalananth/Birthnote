/**
 * The last few database errors this process saw, for /api/health.
 *
 * Hostinger does not expose the running app's stdout, so `console.error` in a
 * route handler is written to nowhere anyone can read. This keeps enough of
 * each failure to diagnose it — the driver's error code and the statement —
 * and deliberately not the values: the message MySQL produces can quote the
 * data that caused the error (a phone number in a duplicate-key message, say),
 * and a health endpoint must never repeat customer data.
 */
export interface RecordedDbError {
  at: string;
  code: string | null;
  errno: number | null;
  /** MySQL's message with every quoted value replaced by '…'. */
  message: string;
  /** The first line of the statement — parameterised, so it holds no values. */
  sql: string;
}

const KEEP = 5;
const g = globalThis as unknown as { birthnoteDbErrors?: RecordedDbError[] };

export function recordDbError(error: unknown, sql: string): void {
  const err = error as { code?: string; errno?: number; message?: string };
  const entry: RecordedDbError = {
    at: new Date().toISOString(),
    code: err.code ?? null,
    errno: typeof err.errno === 'number' ? err.errno : null,
    message: String(err.message ?? error).replace(/'[^']*'/g, "'…'").slice(0, 300),
    sql: sql.trim().split('\n')[0].replace(/\s+/g, ' ').slice(0, 120),
  };
  g.birthnoteDbErrors = [entry, ...(g.birthnoteDbErrors ?? [])].slice(0, KEEP);
}

export function recentDbErrors(): RecordedDbError[] {
  return g.birthnoteDbErrors ?? [];
}
