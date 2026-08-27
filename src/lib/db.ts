import 'server-only';
import mysql from 'mysql2/promise';
import { env } from '@/lib/env';
import { recordError } from '@/server/errors';

/**
 * A single MySQL pool per Node process.
 *
 * Next.js hot-reloads modules in development, so the pool is cached on
 * globalThis to avoid exhausting the connection limit across reloads. On
 * Hostinger the per-user connection limit is low, so keep
 * MYSQL_CONNECTION_LIMIT small (5 is plenty for this traffic).
 */
const globalForDb = globalThis as unknown as { birthnotePool?: mysql.Pool };

export function getPool(): mysql.Pool {
  if (!globalForDb.birthnotePool) {
    globalForDb.birthnotePool = mysql.createPool({
      host: env.mysql.host,
      port: env.mysql.port,
      database: env.mysql.database(),
      user: env.mysql.user(),
      password: env.mysql.password,
      waitForConnections: true,
      connectionLimit: env.mysql.connectionLimit,
      queueLimit: 0,
      enableKeepAlive: true,
      timezone: 'Z',
      dateStrings: ['DATE'],
    });
  }
  return globalForDb.birthnotePool;
}

/** Run a parameterised query. Never interpolate values into SQL strings. */
export async function query<T = mysql.RowDataPacket[]>(
  sql: string,
  params: unknown[] = []
): Promise<T> {
  try {
    // mysql2 types the values as ExecuteValues; callers pass unknown[] and the
    // driver serialises each value itself.
    const [rows] = await getPool().execute(sql, params as never[]);
    return rows as T;
  } catch (error) {
    recordError('db', error, sql.trim().split('\n')[0].replace(/\s+/g, ' ').slice(0, 120));
    throw error;
  }
}

/** Run several statements inside one transaction. */
export async function transaction<T>(
  fn: (conn: mysql.PoolConnection) => Promise<T>
): Promise<T> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
