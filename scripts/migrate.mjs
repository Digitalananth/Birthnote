#!/usr/bin/env node
/**
 * Creates the BirthNote tables. Idempotent — run it after every deploy.
 *
 *   npm run db:migrate
 *
 * Reads MYSQL_* from .env. On Hostinger you can also paste scripts/schema.sql
 * straight into phpMyAdmin if the Node process cannot reach the DB.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import mysql from 'mysql2/promise';

const here = dirname(fileURLToPath(import.meta.url));

// Minimal .env loader so the script works without extra dependencies.
try {
  const envFile = readFileSync(join(here, '..', '.env'), 'utf8');
  for (const line of envFile.split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, '');
  }
} catch {
  // No .env file — rely on the real environment (e.g. CI or hPanel vars).
}

const required = ['MYSQL_DATABASE', 'MYSQL_USER'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`✗ Missing environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const sql = readFileSync(join(here, 'schema.sql'), 'utf8');

const connection = await mysql.createConnection({
  host: process.env.MYSQL_HOST || 'localhost',
  port: Number(process.env.MYSQL_PORT || 3306),
  database: process.env.MYSQL_DATABASE,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD || '',
  multipleStatements: true,
});

try {
  await connection.query(sql);
  const [tables] = await connection.query('SHOW TABLES');
  console.log(`✓ Schema applied to ${process.env.MYSQL_DATABASE}`);
  console.log(`  Tables: ${tables.map((row) => Object.values(row)[0]).join(', ')}`);
} catch (error) {
  console.error('✗ Migration failed:', error.message);
  process.exitCode = 1;
} finally {
  await connection.end();
}
