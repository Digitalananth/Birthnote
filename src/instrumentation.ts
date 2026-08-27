/**
 * Next.js calls `register()` once, when the server process starts.
 *
 * That is the only place on Hostinger where the database can be migrated.
 * The two obvious alternatives both fail there, and each failed in production
 * before this existed:
 *
 *   - In `build` — Hostinger builds in a sandbox with no route to the
 *     account's MySQL, so migrating there dies with ECONNREFUSED and takes the
 *     whole deploy down (commit 3bcf4d4).
 *   - From the app's terminal after a deploy — Hostinger prunes the deployed
 *     directory to .next, node_modules, package.json and public, so a script
 *     under scripts/ is not there: `npm run db:migrate` failed with
 *     MODULE_NOT_FOUND.
 *
 * Server start has neither problem: the real environment variables are
 * present, the database is reachable, and everything imported from here is
 * compiled into .next so nothing can prune it. A deploy is now
 * install → build → start → migrated, with no manual step.
 */
export async function register() {
  // `next build` loads this file too. Migrating during the build is exactly
  // the failure mode described above, so refuse.
  if (process.env.NEXT_PHASE === 'phase-production-build') return;

  // This file is compiled for the edge runtime as well (middleware runs
  // there), where node:crypto and mysql2 do not exist. NEXT_RUNTIME is
  // inlined at build time, so webpack drops this whole block — and the
  // mysql2 import with it — from the edge bundle. The imports must stay
  // *inside* the block for that to work.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { setMigrationStatus } = await import('@/server/migration-status');

    if (process.env.MIGRATE_ON_BOOT === 'false') {
      console.log('[migrate] skipped: MIGRATE_ON_BOOT=false');
      setMigrationStatus({ state: 'skipped', current: null, applied: [], warnings: [], error: null });
      return;
    }

    const { runMigrations, explain } = await import('@/server/migrate');
    const { seedFirstAdmin } = await import('@/server/bootstrap');

    try {
      const report = await runMigrations();
      console.log(
        `[migrate] ${report.database} is at ${report.current ?? 'no version'}` +
          (report.applied.length ? `; applied ${report.applied.join(', ')}` : '; up to date')
      );
      for (const warning of report.warnings) console.warn(`[migrate] ! ${warning}`);

      const seeded = await seedFirstAdmin();
      if (seeded) console.log(`[migrate] ${seeded}`);

      setMigrationStatus({
        state: 'ok',
        current: report.current,
        applied: report.applied,
        warnings: seeded ? [...report.warnings, seeded] : report.warnings,
        error: null,
      });
    } catch (error) {
      // Deliberately not rethrown. A migration that cannot reach the database
      // is a reason to look at the logs, not a reason to refuse to serve the
      // static pages, /api/health or the diagnostics that would explain it.
      // Every database-backed route fails loudly on its own anyway.
      const reason = explain(error);
      console.error(`[migrate] ✗ failed: ${reason}`);
      console.error(
        '[migrate]   Check MYSQL_HOST / MYSQL_PORT / MYSQL_DATABASE / MYSQL_USER / ' +
          'MYSQL_PASSWORD in the Web App environment panel, then restart the app.'
      );
      setMigrationStatus({ state: 'failed', current: null, applied: [], warnings: [], error: reason });
    }
  }
}
