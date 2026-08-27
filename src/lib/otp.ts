import 'server-only';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { query } from '@/lib/db';
import { env } from '@/lib/env';

/**
 * Issuing and checking the one-time codes people sign in with.
 *
 * A code belongs to an *identifier* — a canonical mobile number or an email
 * address — and the channel it was sent over. Both are stored because they are
 * not interchangeable: the same person may hold a code sent to their phone and
 * one sent to their address, and a code proves only the identifier it was
 * delivered to. Keying on the identifier alone would let a code texted to a
 * number be spent against an address, which is exactly the confusion that
 * turns two ways in as one way in for someone who controls neither.
 *
 * A six-digit code has a million values, which is only safe because guessing
 * is expensive here and nowhere else: each code lives ten minutes, survives
 * five wrong answers, and is spent the moment it is used or replaced. Take any
 * one of those away and the code is guessable.
 *
 * Only the SHA-256 is stored — the same reasoning as session tokens in
 * `src/lib/session.ts`. Plain SHA-256 rather than scrypt because the secret is
 * short-lived and high-entropy per attempt-limit above, and the check sits in
 * the sign-in path where an expensive hash would be a denial-of-service lever.
 */
const CODE_LENGTH = 6;

/** How the code was delivered. Also decides which column of `users` matches. */
export type OtpChannel = 'sms' | 'email';

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

/**
 * `randomInt` rather than `Math.random`: this is a credential, and
 * `Math.random` is predictable from previous outputs.
 */
function generateCode(): string {
  return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0');
}

interface OtpRow extends RowDataPacket {
  id: number;
  code_hash: string;
  attempts: number;
}

export type OtpPurpose = 'auth';

export interface IssuedOtp {
  code: string;
  expiresInSeconds: number;
}

/**
 * How long until this identifier may ask for another code, or 0 if it may now.
 *
 * Without a cooldown the request endpoint is a way to make BirthNote send paid
 * SMS to a stranger's phone — or mail to a stranger's inbox — repeatedly. The
 * rate limiter caps the total but this is what stops a rapid burst to one
 * person.
 */
export async function resendCooldown(
  identifier: string,
  channel: OtpChannel,
  purpose: OtpPurpose = 'auth'
): Promise<number> {
  const rows = await query<(RowDataPacket & { wait: number })[]>(
    `SELECT GREATEST(0, ? - TIMESTAMPDIFF(SECOND, created_at, UTC_TIMESTAMP())) AS wait
       FROM auth_otps
      WHERE identifier = ? AND channel = ? AND purpose = ?
      ORDER BY id DESC LIMIT 1`,
    [env.auth.otpResendSeconds, identifier, channel, purpose]
  );
  return Number(rows[0]?.wait ?? 0);
}

/**
 * Creates a code for an identifier and returns it for sending.
 *
 * Any code already outstanding for that identifier and channel is retired
 * first, so a person who asks twice has exactly one code that works — the
 * newest. Leaving the old one live would mean a message the customer has
 * already abandoned, and possibly forwarded to someone, still opening their
 * account.
 */
export async function issueOtp(
  identifier: string,
  channel: OtpChannel,
  purpose: OtpPurpose = 'auth'
): Promise<IssuedOtp> {
  const code = generateCode();
  await query(
    `UPDATE auth_otps SET consumed_at = UTC_TIMESTAMP()
      WHERE identifier = ? AND channel = ? AND purpose = ? AND consumed_at IS NULL`,
    [identifier, channel, purpose]
  );
  await query(
    `INSERT INTO auth_otps (identifier, channel, code_hash, purpose, expires_at)
     VALUES (?, ?, ?, ?, UTC_TIMESTAMP() + INTERVAL ? SECOND)`,
    [identifier, channel, hashCode(code), purpose, env.auth.otpTtlSeconds]
  );
  return { code, expiresInSeconds: env.auth.otpTtlSeconds };
}

export type OtpCheck =
  | { ok: true }
  /** No live code: never issued, already used, or past its expiry. */
  | { ok: false; reason: 'expired' }
  | { ok: false; reason: 'mismatch'; attemptsLeft: number }
  /** Five wrong answers — the code is dead and a new one must be requested. */
  | { ok: false; reason: 'locked' };

/**
 * Checks a code and, when it matches, spends it.
 *
 * Every outcome consumes an attempt, and the fifth wrong answer burns the code
 * outright, so a caller cannot walk the keyspace by retrying. A correct code is
 * marked consumed in the same statement that finds it, which is what stops two
 * simultaneous requests both being told yes.
 */
export async function verifyOtp(
  identifier: string,
  channel: OtpChannel,
  code: string,
  purpose: OtpPurpose = 'auth'
): Promise<OtpCheck> {
  const rows = await query<OtpRow[]>(
    `SELECT id, code_hash, attempts FROM auth_otps
      WHERE identifier = ? AND channel = ? AND purpose = ?
        AND consumed_at IS NULL AND expires_at > UTC_TIMESTAMP()
      ORDER BY id DESC LIMIT 1`,
    [identifier, channel, purpose]
  );
  const row = rows[0];
  if (!row) {
    // 'expired' covers two different failures that reach the customer as one
    // sentence: a code that timed out or was already spent, and a code that
    // never existed for this identifier at all. The second means the lookup
    // key disagrees with the one `issueOtp` wrote, which is a bug rather than
    // a stale code — so say which happened, or the next report of this is
    // diagnosed by guesswork again.
    // Wrapped: this exists only to explain a rejection that has already been
    // decided. Letting it throw would turn a clean 401 into a 500 and cost the
    // customer the honest answer, which is the opposite of the point.
    try {
      const [recent] = await query<(RowDataPacket & {
        age: number;
        ttl: number;
        spent: number;
      })[]>(
        `SELECT TIMESTAMPDIFF(SECOND, created_at, UTC_TIMESTAMP()) AS age,
                TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), expires_at) AS ttl,
                CASE WHEN consumed_at IS NULL THEN 0 ELSE 1 END AS spent
           FROM auth_otps
          WHERE identifier = ? AND channel = ? AND purpose = ?
          ORDER BY id DESC LIMIT 1`,
        [identifier, channel, purpose]
      );
      console.warn(
        recent
          ? `[otp:expired] ${channel} code for ${identifier}: issued ${recent.age}s ago, ` +
              `ttl ${recent.ttl}s, ${recent.spent ? 'already spent' : 'not spent'}`
          : `[otp:expired] ${channel} code for ${identifier}: no code was ever ` +
              'issued for this identifier — the verify lookup key does not match ' +
              'what issueOtp wrote'
      );
    } catch (error) {
      console.error('[otp:expired] could not describe the rejection', error);
    }
    return { ok: false, reason: 'expired' };
  }

  await query('UPDATE auth_otps SET attempts = attempts + 1 WHERE id = ?', [row.id]);
  const attempts = row.attempts + 1;

  const supplied = Buffer.from(hashCode(code), 'hex');
  const expected = Buffer.from(row.code_hash, 'hex');
  const matches = supplied.length === expected.length && timingSafeEqual(supplied, expected);

  if (!matches) {
    if (attempts >= env.auth.otpMaxAttempts) {
      await query('UPDATE auth_otps SET consumed_at = UTC_TIMESTAMP() WHERE id = ?', [row.id]);
      return { ok: false, reason: 'locked' };
    }
    return { ok: false, reason: 'mismatch', attemptsLeft: env.auth.otpMaxAttempts - attempts };
  }

  // Conditional on consumed_at so a concurrent verify cannot also succeed.
  const spent = await query<ResultSetHeader>(
    'UPDATE auth_otps SET consumed_at = UTC_TIMESTAMP() WHERE id = ? AND consumed_at IS NULL',
    [row.id]
  );
  if (!spent.affectedRows) return { ok: false, reason: 'expired' };

  return { ok: true };
}

/**
 * Clears out spent and expired codes.
 *
 * Called after a successful sign-in rather than from a cron job, for the same
 * reason `pruneExpiredSessions` is — shared hosting makes scheduled tasks
 * awkward, and sign-ins are frequent enough to keep the table small. A week is
 * kept so a support question about "I never got my code" can still be answered.
 */
export async function pruneExpiredOtps(): Promise<void> {
  try {
    await query('DELETE FROM auth_otps WHERE created_at < UTC_TIMESTAMP() - INTERVAL 7 DAY');
  } catch (error) {
    console.error('[otp] prune failed', error);
  }
}
