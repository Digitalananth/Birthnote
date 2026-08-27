import type { Migration } from './types';
import { env } from '@/lib/env';

/**
 * Phase 6: the mobile number becomes the account identifier.
 *
 * Four things, in the order they have to happen:
 *
 *  1. `email` and `name` stop being mandatory. Someone can be signed in by
 *     number before they have told us either. Dropping NOT NULL is the safe
 *     direction — every existing row already satisfies the looser rule.
 *  2. Every stored phone is rewritten into canonical digits. Sign-in looks a
 *     number up by exact match, so "+91 98765 43210" and "9876543210" must be
 *     the same row, or a returning customer gets a second, empty account.
 *  3. `users.phone` becomes UNIQUE — but only once no two accounts share a
 *     number. That is a real conflict a migration must not resolve by guessing
 *     which account is the person's. It is reported and left for a human; the
 *     key is added by a later migration once the duplicates are merged.
 *  4. What the old password login left behind is dropped. A column of password
 *     hashes that nothing can ever check is a store of secrets, still worth
 *     stealing, kept for a login that no longer exists. Same for its reset
 *     tokens and the superseded `phone_otps` table.
 */

/** Mirrors `normalisePhoneNumber` in src/lib/auth-validation.ts. */
function canonicalPhone(raw: unknown): string | null {
  let digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('00')) digits = digits.slice(2);
  const cc = env.auth.defaultCountryCode;
  if (digits.length === 10) digits = `${cc}${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) digits = `${cc}${digits.slice(1)}`;
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

export const migration: Migration = {
  version: '0006',
  name: 'phone_sign_in',
  async up(m) {
    await m.execute('ALTER TABLE users MODIFY COLUMN email VARCHAR(190) NULL');
    await m.execute("ALTER TABLE users MODIFY COLUMN name VARCHAR(160) NOT NULL DEFAULT ''");

    const rows = await m.query("SELECT id, phone FROM users WHERE phone IS NOT NULL AND phone <> ''");
    let rewritten = 0;
    let cleared = 0;
    for (const row of rows) {
      const canonical = canonicalPhone(row.phone);
      if (canonical === row.phone) continue;
      // A value that cannot be a real number is worse than no value: it can
      // never be signed in with, and it would block the UNIQUE key.
      await m.execute('UPDATE users SET phone = ? WHERE id = ?', [canonical, row.id]);
      if (canonical) rewritten += 1;
      else cleared += 1;
    }
    if (rewritten) m.warn(`normalised ${rewritten} stored phone number(s)`);
    if (cleared) m.warn(`cleared ${cleared} unusable phone number(s)`);

    // Empty strings would collide with each other under a UNIQUE key, where
    // any number of NULLs are allowed.
    await m.execute("UPDATE users SET phone = NULL WHERE phone = ''");
    await m.execute("UPDATE users SET email = NULL WHERE email = ''");

    const [{ stranded }] = await m.query('SELECT COUNT(*) AS stranded FROM users WHERE phone IS NULL');
    if (Number(stranded) > 0) {
      m.warn(
        `${stranded} account(s) have no mobile number and cannot sign in. Their orders ` +
          'are safe and still reachable by reference; they will get a new account ' +
          'when they next sign in with a number.'
      );
    }

    if (!(await m.indexExists('users', 'uq_users_phone'))) {
      const dupes = await m.query(
        `SELECT phone, COUNT(*) AS total FROM users
          WHERE phone IS NOT NULL GROUP BY phone HAVING total > 1`
      );
      if (dupes.length) {
        m.warn(
          `${dupes.length} phone number(s) are on more than one account, so uq_users_phone ` +
            'was NOT added. Merge them by hand, then add the key in a new migration: ' +
            dupes.map((d) => `${d.phone} (${d.total} accounts)`).join(', ')
        );
      } else {
        await m.execute('ALTER TABLE users ADD UNIQUE KEY uq_users_phone (phone)');
      }
    }

    if (await m.columnExists('users', 'password_hash')) {
      await m.execute('ALTER TABLE users DROP COLUMN password_hash');
    }
    await m.execute('DROP TABLE IF EXISTS password_resets');
    await m.execute('DROP TABLE IF EXISTS phone_otps');
  },
};
