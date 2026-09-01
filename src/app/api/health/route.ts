import { NextResponse } from 'next/server';
import { pingDatabase } from '@/lib/orders';
import { query } from '@/lib/db';
import { env } from '@/lib/env';
import { getMigrationStatus } from '@/server/migration-status';
import { checkSchema, type SchemaDrift } from '@/server/schema-check';
import { recentErrors } from '@/server/errors';
import { lastSweepAt } from '@/server/sweep-state';
import { maybeSweep } from '@/server/background-sweep';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The schema version actually in the database, read live rather than from
 * memory so it is right even if another process did the migrating. Null when
 * the app has never migrated this database.
 */
/** Which database engine we are actually talking to, and on what collation. */
async function serverInfo(): Promise<{ version: string; collation: string } | null> {
  try {
    const [row] = await query<{ version: string; collation: string }[]>(
      'SELECT VERSION() AS version, @@collation_connection AS collation'
    );
    return row ?? null;
  } catch {
    return null;
  }
}

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
  // Uptime monitors poll this, which makes it the steadiest heartbeat the app
  // has — and the one request that arrives even when nobody is visiting.
  maybeSweep();

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
      server: database ? await serverInfo() : null,
      schema,
      migrations,
      // When the scheduled sweep last completed in THIS process. Null is not
      // proof it never ran — each worker keeps its own — but a null that never
      // becomes a timestamp means the cron is not reaching us at all.
      lastSweepAt: lastSweepAt(),
      // Tables/columns the code needs and the database lacks. Empty when fine.
      drift,
      // Last few server-side failures, from the app_errors table: scope,
      // driver code and a value-redacted message. Empty when nothing failed.
      recentErrors: database ? await recentErrors() : [],
      stripe: env.stripe.configured(),
      mail: env.smtp.enabled(),
      // Sign-in by SMS, and the one thing about it that is otherwise
      // invisible: whether MSG91_TEMPLATE_ID is MSG91's own 24-hex id or the
      // numeric DLT id. With the wrong one MSG91 accepts every send, answers
      // success, and delivers nothing — which reaches us as "the code never
      // arrived" with no failure anywhere to point at.
      sms: { enabled: env.msg91.enabled(), templateId: env.msg91.templateIdFormat() },
      whatsapp: env.whatsapp.enabled(),
      time: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 }
  );
}
