import 'server-only';
import mysql from 'mysql2/promise';
import { env } from '@/lib/env';
import { migrations } from '@/server/migrations';
import type { Migration, Migrator } from '@/server/migrations/types';

/**
 * Applies every migration that has not yet run, in order, once.
 *
 * `schema_migrations` records each version as it completes, so a migration
 * runs exactly once per database. A named MySQL lock serialises the whole
 * run, so two app processes starting at the same moment — a redeploy, a
 * restart during a health-check — cannot both apply the same migration.
 *
 * This runs at server start (src/instrumentation.ts), which is the only place
 * it can on Hostinger: the build sandbox has no route to MySQL, and the deploy
 * is pruned to .next/node_modules/package.json/public before anyone can SSH
 * in, so a script under scripts/ is not there to run.
 *
 * Migrations are not wrapped in a transaction. MySQL commits implicitly on
 * every DDL statement, so a transaction would give a false sense of atomicity
 * — a migration that fails half-way is recorded as not applied and re-runs
 * on the next start, which is why each one is written to tolerate that.
 */

// Deliberately keeps its pre-rename name: during a rolling restart an old and
// a new process must contend for the SAME advisory lock, or both would migrate
// at once. Rename it only when no pre-rename process can still be running.
const LOCK_NAME = 'birthnote_schema_migrations';
const LOCK_TIMEOUT_SECONDS = 60;

export interface MigrationReport {
  database: string;
  /** Versions applied this run, in order. Empty when already up to date. */
  applied: string[];
  /** The version the database is now at. */
  current: string | null;
  warnings: string[];
}

/**
 * Renders a connection failure readably.
 *
 * Node tries every address the host resolves to and wraps one error per
 * attempt in an AggregateError whose own `message` is empty — so logging
 * `error.message` alone prints nothing useful. Unwrap `.errors` instead.
 */
export function explain(error: unknown): string {
  const err = error as {
    errors?: { code?: string; message?: string }[];
    code?: string;
    message?: string;
  };
  if (err?.errors?.length) {
    return err.errors.map((sub) => `${sub.code || ''} ${sub.message || ''}`.trim()).join('; ');
  }
  return `${err?.code || ''} ${err?.message || String(error)}`.trim();
}

function makeMigrator(
  connection: mysql.Connection,
  database: string,
  warnings: string[]
): Migrator {
  const query = async (sql: string, params: unknown[] = []) => {
    const [rows] = await connection.query(sql, params);
    return rows as mysql.RowDataPacket[];
  };
  const count = async (sql: string, params: unknown[]) => {
    const rows = await query(sql, params);
    return Number(Object.values(rows[0])[0]) > 0;
  };
  return {
    database,
    query,
    async execute(sql, params = []) {
      const [result] = await connection.query(sql, params);
      return result as mysql.ResultSetHeader;
    },
    tableExists: (table) =>
      count(
        `SELECT COUNT(*) FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
        [database, table]
      ),
    columnExists: (table, column) =>
      count(
        `SELECT COUNT(*) FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [database, table, column]
      ),
    indexExists: (table, name) =>
      count(
        `SELECT COUNT(*) FROM information_schema.STATISTICS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
        [database, table, name]
      ),
    constraintExists: (table, name) =>
      count(
        `SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?`,
        [database, table, name]
      ),
    warn: (message) => warnings.push(message),
  };
}

function assertWellFormed(list: readonly Migration[]) {
  const seen = new Set<string>();
  let previous = '';
  for (const { version, name } of list) {
    if (!/^\d{4}$/.test(version)) {
      throw new Error(`migration "${name}" has version "${version}"; expected four digits`);
    }
    if (seen.has(version)) throw new Error(`migration version ${version} is listed twice`);
    if (version <= previous) {
      throw new Error(`migration ${version} is listed after ${previous}; keep them in order`);
    }
    seen.add(version);
    previous = version;
  }
}

export async function runMigrations(): Promise<MigrationReport> {
  assertWellFormed(migrations);
  const database = env.mysql.database();

  // A dedicated connection, not the app's pool: the baseline is many
  // statements in one string, which needs multipleStatements — a flag the
  // request-serving pool must never have, because it would turn any SQL
  // injection into an arbitrary-statement injection.
  const connection = await mysql.createConnection({
    host: env.mysql.host,
    port: env.mysql.port,
    database,
    user: env.mysql.user(),
    password: env.mysql.password,
    multipleStatements: true,
  });

  const warnings: string[] = [];
  const applied: string[] = [];

  try {
    const [[lock]] = await connection.query<mysql.RowDataPacket[]>('SELECT GET_LOCK(?, ?) AS ok', [
      LOCK_NAME,
      LOCK_TIMEOUT_SECONDS,
    ]);
    if (Number(lock.ok) !== 1) {
      throw new Error(
        `another process has held the migration lock for over ${LOCK_TIMEOUT_SECONDS}s`
      );
    }

    try {
      await connection.query(
        `CREATE TABLE IF NOT EXISTS schema_migrations (
           version    CHAR(4)      NOT NULL,
           name       VARCHAR(120) NOT NULL,
           applied_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
           PRIMARY KEY (version)
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
      );

      const [rows] = await connection.query<mysql.RowDataPacket[]>(
        'SELECT version FROM schema_migrations'
      );
      const done = new Set(rows.map((row) => String(row.version)));

      const m = makeMigrator(connection, database, warnings);
      for (const migration of migrations) {
        if (done.has(migration.version)) continue;
        await migration.up(m);
        await connection.query('INSERT INTO schema_migrations (version, name) VALUES (?, ?)', [
          migration.version,
          migration.name,
        ]);
        applied.push(`${migration.version}_${migration.name}`);
      }

      const [[latest]] = await connection.query<mysql.RowDataPacket[]>(
        'SELECT MAX(version) AS current FROM schema_migrations'
      );
      return {
        database,
        applied,
        current: latest.current ? String(latest.current) : null,
        warnings,
      };
    } finally {
      await connection.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]);
    }
  } finally {
    await connection.end();
  }
}
