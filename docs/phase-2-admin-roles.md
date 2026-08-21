# Phase 2 — Admin users and roles

Replaces the single shared `ADMIN_PASSWORD` with real admin accounts, so the
panel can be handed to more than one person and taken back from any of them.

## Roles

Two, deliberately:

| Role | Scope |
| --- | --- |
| `owner` | Everything, including managing other admins |
| `staff` | The order queue only |

More levels would be guesswork encoded in an `ENUM`. Adding one later is an
`ALTER`; removing a role people already hold is not.

## Schema

- `admin_users` — name, email, `password_hash`, `role`, `is_active`,
  `last_login_at`
- `admin_sessions` — same design as `user_sessions`: opaque token in the
  cookie, only its SHA-256 in the table
- `admin_password_resets` — single-use tokens, one hour, serving both the
  invite link and an ordinary reset
- `order_events.actor` widened `VARCHAR(40)` → `VARCHAR(190)` to hold an email

Admins are a separate table from customers, not a flag on `users`. One table
with a role column makes it far too easy for a bug in the customer path to
hand out admin rights. Password hashing is shared (`src/lib/users.ts`); the
records are not.

## Bootstrapping

`npm run db:migrate` creates the first owner from `ADMIN_EMAIL`,
`ADMIN_PASSWORD` and `ADMIN_NAME` — **only when `admin_users` is empty**.

Without this, deploying Phase 2 locks the shop owner out of their own panel:
no account to sign in as, and no signed-in admin to create one. Because it is
skipped once any account exists, it can never resurrect a deleted account or
reset a changed password.

Everyone after the first is invited from `/admin/users`: they receive a
one-time link and choose their own password. No password is sent by email.

## Lockout guards

An owner removing their own access is the only mistake here with no way back
short of editing the database by hand, so:

- Demoting, deactivating or deleting **yourself** is refused outright.
- A second last-active-owner check sits behind it. It is unreachable while the
  self-check stands — any other actor is themselves an active owner, so one
  always remains — and exists so relaxing that rule cannot silently produce a
  panel nobody can administer.

## Verified end to end

Against a real MySQL, over HTTP:

| Check | Result |
| --- | --- |
| Migrate with no bootstrap credentials | Warns, does not crash |
| Migrate with them | Creates the owner |
| Migrate a third time, different password | No re-seed, no re-`ALTER` |
| Unknown admin vs wrong password | Identical response |
| Staff opening `/admin/users` | Redirected to `/admin` |
| Staff calling the user-management API | 403 |
| Staff promoting themselves via the API | 403 |
| Owner demoting / deactivating / deleting themselves | 409 on each |
| Deactivating an admin | Live session dies on the next request |
| Deactivated admin signing in again | Rejected |
| Old `birthnote_admin` cookie, and a forged session token | Neither grants access |
| Admin login brute force | Rate-limited per email and per IP |
| Admin changing an order | Timeline records their email, not `admin` |
| Customer session against `/admin` | Redirected to the admin login |
| Admin session against `/account` | Redirected to the customer login |

## Not included

Per-admin activity log beyond `order_events.actor`; two-factor auth; an admin
profile screen (an admin changes their password through the reset link).
