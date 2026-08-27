import type mysql from 'mysql2/promise';

/**
 * What a migration gets to work with.
 *
 * The `*Exists` helpers are for the baseline migrations only — the ones that
 * may run against a database that already had their change applied by hand,
 * before there was a `schema_migrations` table to say so. A migration written
 * after the baseline runs exactly once and should just do its ALTER.
 */
export interface Migrator {
  readonly database: string;
  query(sql: string, params?: unknown[]): Promise<mysql.RowDataPacket[]>;
  execute(sql: string, params?: unknown[]): Promise<mysql.ResultSetHeader>;
  tableExists(table: string): Promise<boolean>;
  columnExists(table: string, column: string): Promise<boolean>;
  indexExists(table: string, name: string): Promise<boolean>;
  constraintExists(table: string, name: string): Promise<boolean>;
  /** Non-fatal, but a human needs to read it. Printed after the run. */
  warn(message: string): void;
}

export interface Migration {
  /** Zero-padded, ordered, never reused. Matches the filename. */
  readonly version: string;
  readonly name: string;
  up(m: Migrator): Promise<void>;
}
