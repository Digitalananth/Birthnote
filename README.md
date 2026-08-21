# BirthNote

A genuine banknote printed on your most memorable date. Next.js 15 (App
Router, React 19), MySQL, Stripe Checkout, and SMTP email — built to run on a
Hostinger Web App with no external platform services beyond Stripe.

## How an order actually works

```
Customer submits a date
  → POST /api/requests            validates, writes to MySQL, emails customer + you
  → status: pending

You open /admin
  → "Start checking"              status: checking
  → "Confirm available"           status: confirmed, emails a payment link
    or "Mark unavailable"         status: unavailable, emails the bad news

Customer opens /payment/[reference]
  → POST /api/checkout            creates a Stripe Checkout session
  → pays on Stripe's hosted page
  → POST /api/webhooks/stripe     status: paid, emails the receipt

You post the note, then "Mark dispatched"
  → status: shipped, emails the tracking number
```

Every step is stored in MySQL and visible to the customer at
`/track-order/[reference]`, and each entry on that timeline names the admin
who made the change.

## Bulk orders

An order is a parent record; each requested banknote is a row in
`order_items`. Every order has at least one item, including the single-note
orders that predate the table — `npm run db:migrate` moves them across and
then drops the old per-note columns from `orders`, so the data lives in
exactly one place.

`/request-a-banknote` takes up to 20 dates in one submission via "Add another
date". One order, one payment, one parcel.

**Availability is per note.** Finding four dates out of five should not cost
the customer the other four, so each item is marked found or not found and
priced on its own:

```
Order BN-140387-WTXF3V  (3 notes)
  14/03/87  ₹10   found      ₹2,499
  22/11/91  ₹100  not found     —
  05/06/78  ₹5    found      ₹3,200
                            -------
  orders.price_paise         ₹5,699
```

- **`orders.price_paise` is derived, never typed.** It is recomputed from the
  available items' prices on every item change (`recomputeTotal`), and the
  Stripe line items are built from those same rows — so the total, the
  breakdown and the amount charged cannot disagree.
- **Two order statuses are checked against the items, server-side.**
  `confirmed` needs at least one note found *and* priced, or the customer gets
  a payment link for ₹0; `unavailable` needs every note to be missing. The
  admin buttons are disabled too, but a disabled button is presentation.
- **A paid order's notes are frozen** (`PaidOrderError`). The customer was
  charged a specific amount for a specific set of notes.
- **A partial result is not an "unavailable" email.** It goes out as an
  availability confirmation that names what is missing, because there is still
  something to buy.
- **The admin queue's search reaches into the items**, so a date still finds
  the order that contains it.

## Customer accounts

Ordering does **not** require an account — the guest funnel is unchanged, and
`orders.user_id` is nullable. An account adds a place to see every order at
once:

```
/signup, /login, /forgot-password, /reset-password/[token]
/account            overview: anything awaiting payment, plus recent orders
/account/orders     the full list
/account/profile    name, email, phone, WhatsApp, and password
```

Signing up or signing in also **claims past guest orders**: any order whose
`customer_email` matches and which has no owner yet is attached to the
account. Without that, someone who ordered before registering would find an
empty My Orders page.

A few decisions worth knowing before you change this code:

- **Passwords use `scrypt` from `node:crypto`**, not bcrypt — bcrypt needs a
  native build that shared hosting often cannot compile. Format:
  `scrypt$<salt>$<key>`.
- **Sessions are rows in `user_sessions`**, not signed stateless cookies like
  the admin's. Customers need logout and password-reset to actually revoke a
  session, which a stateless cookie cannot do. Only the SHA-256 of each token
  is stored, so a database leak yields no live sessions.
- **`/api/auth/login` and `/api/auth/forgot-password` never reveal whether an
  address is registered.** Login answers with one generic message and burns
  equal CPU on an unknown email; forgot-password always returns 200 — even
  when rate-limited, since a 429 would itself be a signal.
- **Login is rate-limited per email *and* per IP.** An IP limit alone does not
  stop a botnet spraying one account.
- **`/api/requests` takes the customer's name and email from the session**, not
  the request body, when someone is signed in.
- **Order pages are scoped by `user_id` inside the SQL**, never by a value
  posted from the browser (`getUserOrderByReference`).

Mobile OTP is not built. The `phone`, `whatsapp` and `phone_verified` columns
exist so adding it (via MSG91) is additive rather than a migration of live
rows.

**No card data ever reaches this server.** Card details are entered on
Stripe's hosted checkout page, which is what keeps the site out of PCI-DSS
scope. Do not add card fields to this codebase.

## Admin accounts

The shared `ADMIN_PASSWORD` is gone. Admins are rows in `admin_users`, managed
by an owner at `/admin/users`, with two roles:

| Role | Can do |
| --- | --- |
| `owner` | Everything, including adding, editing and removing other admins |
| `staff` | The order queue only |

Two roles, not five — more levels would be guesswork encoded in an `ENUM`.
Adding one later is an `ALTER`.

**Creating the first admin.** `npm run db:migrate` seeds an owner account from
`ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME`, but **only when `admin_users`
is empty**. Without that step a deploy would leave nobody able to sign in and
no signed-in admin to create anyone. Because it is skipped once an account
exists, changing `ADMIN_PASSWORD` in `.env` later does nothing — passwords
live in the database.

**Adding the rest.** An owner invites by name, email and role; the new admin
is emailed a one-time link and chooses their own password. No password is ever
sent by email, and no owner ever knows a colleague's.

Things worth knowing before changing this code:

- **Admin sessions are rows in `admin_sessions`.** The old signed cookie could
  not be revoked, which is fine for one shared login and wrong the moment
  access has to be taken away from a person.
- **`is_active` is re-read on every request.** Deactivating someone ends their
  session on their next click, not whenever it would have expired.
- **You cannot demote, deactivate or delete yourself.** An owner locking
  themselves out is the one mistake with no way back short of editing the
  database by hand. There is a second last-active-owner check behind it, which
  is unreachable while the self-check stands — it exists so relaxing that rule
  cannot silently produce a panel nobody can administer.
- **`order_events.actor` now holds the admin's email**, so the customer-facing
  timeline records who did what. The column was widened from `VARCHAR(40)`.
- **Role checks live in the API routes**, not only in the UI. `/admin/users`
  hiding a link is presentation; `requireOwner()` and the 403s are the rule.
- **The middleware only checks that a cookie exists.** Resolving a session
  needs the database, which the Edge runtime cannot reach — it is a redirect
  convenience, and every page and route re-checks properly.

## Rendering strategy

Each route picks the cheapest mode that is still correct:

| Route | Mode | Why |
| --- | --- | --- |
| `/` | **ISR** (`revalidate = 3600`) | Static marketing HTML, regenerated hourly so copy edits go live without a rebuild |
| `/request-a-banknote` | **SSR** (`force-dynamic`) | Reads the session so a signed-in customer's name and email are prefilled |
| `/track-order`, `/terms`, `/privacy`, `/forgot-password` | **SSG** | Pure static content |
| `/login`, `/signup` | **SSR** | Bounce anyone already signed in, and read the `next` parameter |
| `/reset-password/[token]` | **SSR** | The token is checked before the form renders |
| `/account/*` | **SSR** | Per-customer, and guarded by `requireUser()` in the layout |
| `/track-order/[reference]` | **SSR** (`force-dynamic`) | Order status must never be stale |
| `/payment/[reference]`, `/payment/[reference]/success` | **SSR** | Payment eligibility is read fresh so nobody can pay twice from a cached page |
| `/admin`, `/admin/orders/[reference]` | **SSR** | Live operational queue |
| `/admin/users` | **SSR** | Owner-only admin management |
| `/admin/login`, `/admin/reset-password/[token]` | **SSR** | Session state and token validity are read fresh |
| `/api/*` | Dynamic route handlers | — |

### React / virtual-DOM notes

The marketing sections were all client components, purely so each could run
its own `IntersectionObserver` for scroll reveals — which meant their entire
markup shipped to the browser as JavaScript and was re-rendered on hydration.
That behaviour now lives in one client component, `src/components/ScrollReveal.tsx`,
so the seven section components are server components: React renders their
HTML once on the server and never diffs it on the client.

Client components are now only the parts that genuinely need state:
`ScrollReveal`, `RequestFormSection`, `TrackLookupForm`, `CheckoutButton`,
`Header`, `AppImage`, and the two admin controls.

`AppIcon` resolves Heroicons by name. It used to do `import * as HeroIcons`,
a namespace import bundlers cannot tree-shake, so every client bundle carried
the whole icon set. `src/components/ui/icon-registry.ts` now lists the icons
in use explicitly — **add a new icon there or `AppIcon` renders a fallback.**

Shadow DOM is deliberately not used: it does not render on the server and
would cut every element off from the Tailwind stylesheet.

## Local setup

```bash
npm install
cp .env.example .env      # then fill it in — see below
npm run db:migrate        # creates the tables
npm run dev               # http://localhost:4028
```

`GET /api/health` reports whether the database, Stripe, and mail are wired up.

### Environment

Everything is read through `src/lib/env.ts`. See `.env.example` for the full
list. The ones that matter:

- **MySQL** — `MYSQL_HOST/PORT/DATABASE/USER/PASSWORD`. Create the database in
  hPanel → Databases → Management, then run `npm run db:migrate`, or paste
  `scripts/schema.sql` into phpMyAdmin.
- **Stripe** — `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. Add a webhook
  endpoint at `https://your-domain/api/webhooks/stripe` for
  `checkout.session.completed`. Checkout runs in **INR** and collects delivery
  addresses in **India only**; both are set in `src/lib/stripe.ts`.
- **Price** — `BANKNOTE_PRICE_PAISE`, in paise. `249900` is ₹2,499. The value
  is copied onto each order when it is created, so changing it never re-prices
  an order already in the queue.
- **SMTP (Gmail)** — `SMTP_USER` plus `SMTP_PASSWORD` set to a Google
  **App Password**, not your account password. Enable 2-Step Verification,
  then create one at myaccount.google.com → Security → App passwords. Gmail
  caps at roughly 500 messages a day; move to a dedicated sender if volume
  grows. Set `MAIL_ENABLED=false` in development to log emails instead of
  sending them.
- **Admin bootstrap** — `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`. Used
  *once*, by `npm run db:migrate`, to create the first owner account. See
  "Admin accounts" below.

`.env` is gitignored. It was previously committed to this repository — if you
have not already, **rotate every key that was in it.**

## Deploying to Hostinger (Web Apps)

Hostinger's **Web Apps** builds from GitHub on the server — it clones the repo,
runs `npm install --omit=dev`, then `npm run build`, then `npm start`. Do not
upload a prebuilt bundle; there is no source in one, and the build fails with
`Couldn't find any \`pages\` or \`app\` directory`.

Because the install omits dev dependencies, everything `next build` needs
(`typescript`, `tailwindcss`, `postcss`, `autoprefixer`, the `@types/*`) lives
in `dependencies`, not `devDependencies`. Only lint/format tooling is a dev
dependency. Keep it that way.

1. **Database** — hPanel → Databases → MySQL. Create a database and user, note
   the credentials.
2. **Web App** — hPanel → Web Apps → create, connect this GitHub repo:
   - Branch: `main`
   - Root directory: `/`
   - Build command: `npm run build`
   - Start command: `npm start`
   - Node version: 20 or newer
3. **Environment variables** — add every variable from `.env.example` in the
   app's environment panel *before the first build*. `NEXT_PUBLIC_*` are inlined
   at build time, so `NEXT_PUBLIC_SITE_URL` must be the real HTTPS domain and a
   change to it needs a rebuild, not just a restart.
4. **Migrate** — from the app's terminal, `node scripts/migrate.mjs`.
5. **Stripe webhook** — point it at `https://your-domain/api/webhooks/stripe`
   and copy the signing secret into `STRIPE_WEBHOOK_SECRET`. Without this,
   payments are taken but orders never move to `paid`.
6. **Verify** — `curl https://your-domain/api/health` should return
   `{"status":"ok","database":true,...}`.

`.env` is deliberately untracked. The server gets its configuration from the
Web App environment panel only.

To reproduce the server build locally before pushing:

```bash
npm ci --omit=dev && npm run build
```

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server on :4028 |
| `npm run build` | Production build (type errors fail the build) |
| `npm start` | Production server on `$PORT`, default 4028 |
| `npm run db:migrate` | Applies `scripts/schema.sql` |
| `npm run type-check` | `tsc --noEmit` |
| `npm run lint` | ESLint |

## Project structure

```
src/
├── app/
│   ├── api/                    route handlers (requests, checkout, webhook, admin)
│   ├── admin/                  order queue, fulfilment and admin management (SSR)
│   ├── payment/[reference]/    order summary → Stripe Checkout (SSR)
│   ├── track-order/[reference] customer-facing status and timeline (SSR)
│   ├── request-a-banknote/     the request form (SSR)
│   └── page.tsx                landing page (ISR)
├── components/
│   ├── ScrollReveal.tsx        the site's single scroll-animation client component
│   └── ui/icon-registry.ts     the icons bundled for AppIcon
├── lib/
│   ├── db.ts                   MySQL pool + transaction helper
│   ├── orders.ts               all order reads/writes
│   ├── mail.ts                 SMTP transport + email templates
│   ├── stripe.ts               Checkout session creation
│   ├── auth.ts                 admin sessions and role guards
│   ├── order-types.ts          order shapes + helpers (client-safe)
│   ├── rate-limit.ts           DB-backed request throttling
│   └── validation.ts           rules shared by the form and the API
└── middleware.ts               redirects unauthenticated /admin traffic
```
