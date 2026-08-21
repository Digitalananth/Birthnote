# Phase 1 — Customer accounts, denomination, My Account

**Goal:** a customer can create an account, log in, see every order they have
ever placed, and edit their profile. The request form captures the
denomination and the relationship the gift is for.

**Explicitly out of scope** (later phases): mobile OTP login, bulk orders,
admin roles, CMS, PWA, WhatsApp.

---

## 1. Decisions taken

| Decision | Choice | Why |
| --- | --- | --- |
| Password hashing | `scrypt` from `node:crypto` | No new dependency; `bcrypt` needs a native build that Hostinger shared hosting often cannot compile |
| Session storage | Database table, opaque token in cookie | The admin's HMAC cookie (`src/lib/auth.ts`) cannot be revoked. Customers need "log out everywhere" and reset-invalidates-sessions |
| Guest orders | Stay supported | The current funnel converts without an account. Forcing signup before a first order would cost sales |
| Email verification | Column now, enforcement never (this phase) | Ordering already proves the address works — a confirmation email is sent to it |
| OTP | Deferred, MSG91 when built | Columns `phone`, `phone_verified` are added now so Phase 5 is additive only |
| Denomination pricing | Admin quotes it at confirm time | `price_paise` is already per-order and settable in `updateOrderStatus` |

## 2. Open questions for you

1. **Denomination list** — the spec says ₹1, 2, 5, 10, 20, 50, 100, 200, 500.
   Confirmed as-is? Any that you never stock and should be removed?
2. **Password reset link lifetime** — assuming 60 minutes, single use.
3. **Session lifetime** — assuming 30 days with a "remember me" default on.
   Admin sessions stay at 12 hours; these are different populations.

Building against those assumptions; each is a one-line change if wrong.

---

## 3. Schema changes (`scripts/schema.sql`)

The file is already idempotent (`CREATE TABLE IF NOT EXISTS`). The three
`ALTER`s at the end are wrapped so re-running the migration is still safe.

```sql
CREATE TABLE IF NOT EXISTS users (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name            VARCHAR(160)    NOT NULL,
  email           VARCHAR(190)    NOT NULL,
  password_hash   VARCHAR(255)    NOT NULL,
  phone           VARCHAR(24)          NULL,   -- Phase 5 (MSG91 OTP)
  whatsapp        VARCHAR(24)          NULL,   -- Phase 5
  phone_verified  TINYINT(1)      NOT NULL DEFAULT 0,
  email_verified  TINYINT(1)      NOT NULL DEFAULT 0,
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                           ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Opaque session tokens. Only the SHA-256 of the token is stored, so a
-- database leak does not hand an attacker live sessions.
CREATE TABLE IF NOT EXISTS user_sessions (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      BIGINT UNSIGNED NOT NULL,
  token_hash   CHAR(64)        NOT NULL,
  user_agent   VARCHAR(255)         NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at   DATETIME        NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sessions_token (token_hash),
  KEY idx_sessions_user (user_id, expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS password_resets (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  token_hash  CHAR(64)        NOT NULL,
  expires_at  DATETIME        NOT NULL,
  used_at     DATETIME             NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_resets_token (token_hash),
  KEY idx_resets_user (user_id),
  CONSTRAINT fk_resets_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

New columns on `orders`:

| Column | Type | Purpose |
| --- | --- | --- |
| `user_id` | `BIGINT UNSIGNED NULL`, FK `ON DELETE SET NULL` | Nullable so guest orders still work |
| `requested_denomination` | `SMALLINT UNSIGNED NULL` | What the customer asked for. Distinct from `note_denomination`, which is what the admin actually found |
| `gift_relationship` | `VARCHAR(40) NULL` | Father / Mother / Wife / … from the dropdown; `gift_for` stays the free-text name |

Plus `KEY idx_orders_user (user_id, created_at)` for the My Orders list.

`ON DELETE SET NULL`, not `CASCADE`: deleting an account must never delete
the financial record of a paid order.

### Idempotent ALTERs

MySQL has no `ADD COLUMN IF NOT EXISTS`, so `scripts/migrate.mjs` gains a
small helper that reads `information_schema.COLUMNS` and skips columns that
already exist. Keeps `npm run db:migrate` safe to run after every deploy,
which the README promises.

---

## 4. New and changed files

### New — `src/lib/users.ts`
Password hashing and the user record.
- `hashPassword(plain)` → `scrypt$N$salt$hash`, 16-byte random salt
- `verifyPassword(plain, stored)` → `timingSafeEqual`
- `createUser`, `getUserByEmail`, `getUserById`, `updateProfile`, `changePassword`
- `claimGuestOrders(userId, email)` — on signup and on login, backfills
  `orders.user_id` where `customer_email` matches and `user_id IS NULL`.
  This is what makes "I ordered last month as a guest" show up in My Orders.

### New — `src/lib/session.ts`
- `createSession(userId, userAgent)` — 32 random bytes; stores the SHA-256,
  returns the plaintext for the cookie
- `getCurrentUser()` — cached per request with React `cache()` so a page and
  its layout share one query
- `requireUser()` — returns the user or `redirect('/login?next=…')`
- `destroySession()` / `destroyAllSessions(userId)`
- Cookie `birthnote_session`: `httpOnly`, `sameSite: 'lax'`, `secure` in prod
- Expired rows are deleted opportunistically on read — no cron needed

### New — `src/lib/auth-validation.ts`
Isomorphic, mirroring `src/lib/validation.ts` so the browser form and the API
route share rules: signup, login, profile, password-change, reset. Minimum
password length 8, maximum 200 (scrypt on a 10KB password is a DoS).

### Changed — `src/lib/validation.ts`
`RequestFormValues` gains `denomination` and `giftRelationship`. Exports
`DENOMINATIONS` and `GIFT_RELATIONSHIPS` as the single source of truth for
both the `<select>` options and server-side membership checks.

### Changed — `src/lib/orders.ts`
- `Order`, `NewOrderInput`, `mapOrder`, `SELECT_ORDER` gain the three columns
- `createOrder` accepts `userId`
- New `listOrdersForUser(userId)`
- `getOrderByReference` unchanged; a new `getUserOrderByReference(userId, ref)`
  guards My Orders detail so one customer cannot read another's order

### Changed — `src/lib/mail.ts`
Two new templates using the existing `layout()`: `passwordResetEmail`,
`welcomeEmail`. Existing order emails gain a "View in your account" link when
`order.userId` is set.

### Changed — `src/lib/env.ts`
`env.auth.sessionSecret()` — falls back to `ADMIN_SESSION_SECRET` so nothing
breaks before `.env` is updated, but `.env.example` documents its own key.

---

## 5. Routes

### API (`src/app/api/auth/*`)

| Route | Method | Notes |
| --- | --- | --- |
| `/api/auth/signup` | POST | 409 on duplicate email; claims guest orders; sets session |
| `/api/auth/login` | POST | Always the same generic error, whether the email is unknown or the password is wrong |
| `/api/auth/logout` | POST | Deletes the session row, clears the cookie |
| `/api/auth/forgot-password` | POST | **Always returns 200**, even for unknown emails — otherwise it is an account-enumeration oracle |
| `/api/auth/reset-password` | POST | Consumes the token, then `destroyAllSessions` |
| `/api/account/profile` | PATCH | Name, phone, WhatsApp. Email change requires the current password |
| `/api/account/password` | PATCH | Requires current password |

Every one is rate-limited through the existing `checkRateLimit` /
`rate_limits` table:

- login — 10 per IP per 15 min, **and** 5 per email per 15 min (an IP limit
  alone does not stop a botnet spraying one account)
- signup — 5 per IP per hour
- forgot-password — 3 per email per hour

### Pages

| Route | Render mode | Notes |
| --- | --- | --- |
| `/signup`, `/login`, `/forgot-password` | SSG | Static shell, client form inside — matches how `/request-a-banknote` is built |
| `/reset-password/[token]` | SSR | Token validity checked server-side before the form renders |
| `/account` | SSR | Profile summary + the 3 most recent orders |
| `/account/profile` | SSR | Edit form |
| `/account/orders` | SSR | Full list |
| `/account/orders/[reference]` | SSR | Reuses the `/track-order` timeline component, scoped to the owner |

All `/account/*` are `force-dynamic` and call `requireUser()`. No middleware
file — the guard lives in the layout, so there is one place to audit.

### Changed pages
- `src/components/Header.tsx` (already a client component) — "Sign in" or a
  My Account menu. Needs the user passed down from the server layout; it must
  not fetch on the client or it will flash the wrong state
- `/request-a-banknote` — denomination `<select>` and relationship `<select>`;
  when logged in, name and email are prefilled and read-only
- `/track-order/[reference]` — unchanged, still public by reference

---

## 6. Admin surface

The admin queue and order detail show the requested denomination and
relationship. The confirm form already has a price field, so quoting a
₹500-note order at a different price than a ₹10-note one needs no new code —
only a label change to make clear that the customer *asked* for that
denomination.

---

## 7. Security checklist

- Passwords: scrypt, per-user salt, constant-time compare
- Sessions: only the token hash stored; rotated on password change
- Reset tokens: hashed, single use, 60 min, all sessions killed on use
- No user enumeration on forgot-password or login
- Per-email *and* per-IP rate limits on login
- Order detail scoped by `user_id` in the SQL `WHERE`, never by a hidden form
  field
- Email change re-authenticates with the current password
- Cookies `httpOnly` + `sameSite=lax`; all mutations are POST/PATCH

---

## 8. Build order

1. Schema + migration helper — `npm run db:migrate` on a copy of prod first
2. `users.ts`, `session.ts`, `auth-validation.ts`
3. Auth API routes
4. Signup / login / forgot / reset pages
5. `/account/*` + header state
6. Denomination + relationship on the request form and through `orders.ts`
7. Guest-order claiming, admin labels, `.env.example` and README updates

Steps 1–5 are independent of step 6; step 6 can ship first if you want the
denomination live sooner.

---

## Built — what actually shipped

Everything above, with three deviations worth recording:

1. **No `/account/orders/[reference]`.** The list links to
   `/track-order/[reference]`, which already renders the full timeline and is
   reachable by reference anyway. A second copy inside `/account` would only
   be another thing to keep in step.
2. **`/request-a-banknote` moved from SSG to SSR.** Prefilling a signed-in
   customer's name and email cannot be done from prerendered HTML, and
   fetching the user client-side would flash an empty form. The home page
   keeps its ISR: the header was deliberately left unpersonalised, since
   passing a user into it would force every page carrying it to render per
   request.
3. **No new environment variable.** The plan called for an auth session
   secret; there is nothing to sign, because the cookie holds a random opaque
   token whose hash lives in `user_sessions`.
