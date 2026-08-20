# BirthNote

A genuine banknote printed on your most memorable date. Next.js 15 (App
Router, React 19), MySQL, Stripe Checkout, and SMTP email — built to run on a
Hostinger Cloud Startup Node.js host with no external platform services beyond
Stripe.

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
`/track-order/[reference]`.

**No card data ever reaches this server.** Card details are entered on
Stripe's hosted checkout page, which is what keeps the site out of PCI-DSS
scope. Do not add card fields to this codebase.

## Rendering strategy

Each route picks the cheapest mode that is still correct:

| Route | Mode | Why |
| --- | --- | --- |
| `/` | **ISR** (`revalidate = 3600`) | Static marketing HTML, regenerated hourly so copy edits go live without a rebuild |
| `/request-a-banknote` | **SSG** (`force-static`) | Same for everyone; only the form inside is interactive |
| `/track-order`, `/terms`, `/privacy` | **SSG** | Pure static content |
| `/track-order/[reference]` | **SSR** (`force-dynamic`) | Order status must never be stale |
| `/payment/[reference]`, `/payment/[reference]/success` | **SSR** | Payment eligibility is read fresh so nobody can pay twice from a cached page |
| `/admin`, `/admin/orders/[reference]` | **SSR** | Live operational queue |
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
- **Admin** — `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET`
  (`openssl rand -hex 32`). `/admin` is unreachable without both.

`.env` is gitignored. It was previously committed to this repository — if you
have not already, **rotate every key that was in it.**

## Deploying to Hostinger Cloud Startup

1. **Database** — hPanel → Databases → MySQL. Create a database and user, note
   the credentials.
2. **Build locally** (Hostinger's build environment is memory-limited):
   ```bash
   npm ci && npm run build
   ```
   `next.config.mjs` sets `output: 'standalone'`, so the deployable app is
   `.next/standalone` plus two directories that Next does not copy itself.
3. **Upload** to your app directory (e.g. `~/domains/yourdomain/app`):
   ```
   .next/standalone/*      → the app root, including server.js
   .next/static            → .next/static
   public                  → public
   scripts/                → scripts/   (for db:migrate)
   ```
4. **Node.js app** — hPanel → Advanced → Node.js. Set the application root to
   that directory, the startup file to `server.js`, and the Node version to 20
   or newer.
5. **Environment variables** — add every variable from `.env.example` in the
   Node.js app's environment panel. Set `NEXT_PUBLIC_SITE_URL` to your real
   HTTPS domain; Stripe redirects and email links are built from it.
6. **Migrate** — from the hPanel terminal, `node scripts/migrate.mjs`.
7. **Stripe webhook** — point it at `https://your-domain/api/webhooks/stripe`
   and copy the signing secret into `STRIPE_WEBHOOK_SECRET`. Without this,
   payments are taken but orders never move to `paid`.
8. **Verify** — `curl https://your-domain/api/health` should return
   `{"status":"ok","database":true,...}`.

`NEXT_PUBLIC_*` variables are inlined at build time, so changing
`NEXT_PUBLIC_SITE_URL` or the Stripe publishable key means rebuilding, not
just restarting.

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
│   ├── admin/                  order queue and fulfilment (SSR, password-gated)
│   ├── payment/[reference]/    order summary → Stripe Checkout (SSR)
│   ├── track-order/[reference] customer-facing status and timeline (SSR)
│   ├── request-a-banknote/     the request form (SSG)
│   └── page.tsx                landing page (ISR)
├── components/
│   ├── ScrollReveal.tsx        the site's single scroll-animation client component
│   └── ui/icon-registry.ts     the icons bundled for AppIcon
├── lib/
│   ├── db.ts                   MySQL pool + transaction helper
│   ├── orders.ts               all order reads/writes
│   ├── mail.ts                 SMTP transport + email templates
│   ├── stripe.ts               Checkout session creation
│   ├── auth.ts                 signed-cookie admin session
│   ├── rate-limit.ts           DB-backed request throttling
│   └── validation.ts           rules shared by the form and the API
└── middleware.ts               redirects unauthenticated /admin traffic
```
