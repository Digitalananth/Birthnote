import { NextResponse } from 'next/server';
import { pingDatabase } from '@/lib/orders';
import { query } from '@/lib/db';
import { env } from '@/lib/env';
import { getMigrationStatus } from '@/server/migration-status';
import { checkSchema, type SchemaDrift } from '@/server/schema-check';
import { recentDbErrors } from '@/server/db-errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The schema version actually in the database, read live rather than from
 * memory so it is right even if another process did the migrating. Null when
 * the app has never migrated this database.
 */
async function schemaVersion(): Promise<string | null> {
  try {
    const [row] = await query<{ current: string | null }[]>(
      'SELECT MAX(version) AS current FROM schema_migrations'
    );
    return row?.current ?? null;
  } catch {
    return null;
  }
}

/**
 * GET /api/health — deployment smoke check for Hostinger / uptime monitors.
 *
 * `migrations` and `drift` are the diagnostics the hosting cannot give us:
 * Hostinger shows build logs but not the running app's output, so a migration
 * that failed at start, or a hand-made table missing a column, would otherwise
 * be invisible until a customer hits a 500.
 */
export async function GET() {
  const database = await pingDatabase();
  const migrations = getMigrationStatus();
  const schema = database ? await schemaVersion() : null;
  let drift: SchemaDrift | null = null;
  if (database) {
    try {
      drift = await checkSchema();
    } catch {
      drift = null;
    }
  }
  const drifted =
    !!drift && (drift.missingTables.length > 0 || Object.keys(drift.missingColumns).length > 0);
  const healthy = database && migrations.state !== 'failed' && !drifted;
  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      database,
      schema,
      migrations,
      // Tables/columns the code needs and the database lacks. Empty when fine.
      drift,
      // Last few failed statements in this process: driver code and a
      // value-redacted message. Empty when nothing has failed.
      recentDatabaseErrors: recentDbErrors(),
      stripe: env.stripe.configured(),
      mail: env.smtp.enabled(),
      whatsapp: env.whatsapp.enabled(),
      time: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 }
  );
}
