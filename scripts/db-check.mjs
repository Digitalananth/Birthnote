#!/usr/bin/env node
/**
 * Diagnoses the MySQL connection using the same config the app uses.
 *
 * Exists because a failed connection surfaces in the app as a bare
 * `AggregateError` with no message: Node tries every address `MYSQL_HOST`
 * resolves to, and wraps one error per attempt in `.errors`, which
 * `console.error` does not print. This unwraps them.
 *
 * Run it on the server, in the app directory:  node scripts/db-check.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { lookup } from 'node:dns/promises';
import mysql from 'mysql2/promise';

const here = dirname(fileURLToPath(import.meta.url));

// Minimal .env loader; real env vars always win, so on
// Hostinger (where config comes from the panel) this is simply a no-op.
try {
  for (const line of readFileSync(join(here, '..', '.env'), 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key]) continue;
    process.env[key] = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  }
} catch {
  console.log('no .env file — using the process environment only');
}

const host = process.env.MYSQL_HOST || 'localhost';
const port = Number.parseInt(process.env.MYSQL_PORT || '3306', 10);
const database = process.env.MYSQL_DATABASE || '';
const user = process.env.MYSQL_USER || '';
const password = process.env.MYSQL_PASSWORD || '';

console.log('config');
console.log('  MYSQL_HOST     ', host);
console.log('  MYSQL_PORT     ', port);
console.log('  MYSQL_DATABASE ', database || '(unset — required)');
console.log('  MYSQL_USER     ', user || '(unset — required)');
console.log('  MYSQL_PASSWORD ', password ? `set, ${password.length} chars` : '(empty)');

// A password mangled by shell expansion is a silent failure, so show the
// shape of it without printing the secret itself.
if (/[$`&<>|"'\\]/.test(password)) {
  console.log(
    '  ! password contains shell metacharacters — if it was pasted through a\n' +
      '    shell rather than typed into the panel, it may have been mangled'
  );
}

try {
  const addresses = await lookup(host, { all: true });
  console.log('\nDNS: %s resolves to %s', host, addresses.map((a) => a.address).join(', '));
} catch (error) {
  console.log('\nDNS: %s does not resolve (%s)', host, error.code || error.message);
}

/** Prints an AggregateError's hidden sub-errors, one per connection attempt. */
function describe(error) {
  if (error?.errors?.length) {
    console.log('  %d connection attempt(s) failed:', error.errors.length);
    for (const sub of error.errors) {
      console.log('    - %s %s', sub.code || '', sub.message);
    }
    return;
  }
  console.log('  %s %s', error.code || '', error.message);
}

console.log('\nconnecting...');
try {
  const conn = await mysql.createConnection({ host, port, user, password, database });
  console.log('  connected.');

  const [tables] = await conn.query("SHOW TABLES LIKE 'admin_users'");
  if (!tables.length) {
    console.log("  ! table admin_users is MISSING — the app has never started against this database");
  } else {
    const [admins] = await conn.query(
      'SELECT id, email, role, is_active FROM admin_users ORDER BY id'
    );
    if (!admins.length) {
      console.log("  ! admin_users is empty — set ADMIN_EMAIL / ADMIN_PASSWORD and restart the app to seed the first owner");
    } else {
      console.log('  %d admin account(s):', admins.length);
      for (const a of admins) {
        console.log('    #%s %s  role=%s  active=%s', a.id, a.email, a.role, a.is_active);
      }
    }
  }
  await conn.end();
  console.log('\nOK');
} catch (error) {
  console.log('  FAILED');
  describe(error);
  process.exitCode = 1;
}
