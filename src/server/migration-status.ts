/**
 * What happened when this process last tried to migrate.
 *
 * Kept on globalThis so the health endpoint can report it. Hostinger exposes
 * build logs but not the running app's stdout, so without this the only trace
 * of a failed boot-time migration would be the 500s it causes later.
 */
export interface MigrationStatus {
  state: 'pending' | 'ok' | 'failed' | 'skipped';
  /** Version the database was at when the run finished, if it got that far. */
  current: string | null;
  applied: string[];
  warnings: string[];
  /** `explain(error)` output when state is 'failed'. */
  error: string | null;
  at: string;
}

const g = globalThis as unknown as { myLuckyDatesMigrationStatus?: MigrationStatus };

export function getMigrationStatus(): MigrationStatus {
  return (
    g.myLuckyDatesMigrationStatus ?? {
      state: 'pending',
      current: null,
      applied: [],
      warnings: [],
      error: null,
      at: new Date(0).toISOString(),
    }
  );
}

export function setMigrationStatus(status: Omit<MigrationStatus, 'at'>): void {
  g.myLuckyDatesMigrationStatus = { ...status, at: new Date().toISOString() };
}
