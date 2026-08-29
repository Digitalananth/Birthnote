# Phase 5 — PWA and WhatsApp

Two unrelated pieces that happened to be what was left.

---

## PWA

Installable on a phone, opens instantly, and says something sensible with no
connection. It is **not** an offline-capable app, and does not pretend to be:
everything past the marketing copy is an order, an account or a payment.

| Piece | Where |
| --- | --- |
| Manifest | `src/app/manifest.ts` → `/manifest.webmanifest` |
| Service worker | `public/sw.js` |
| Registration | `src/components/ServiceWorkerRegistration.tsx`, mounted in the root layout |
| Offline fallback | `src/app/offline/page.tsx` |
| Install prompt | `src/components/InstallPrompt.tsx`, mounted in the root layout |
| Icons | `public/icons/` — 192, 512, maskable 512, apple-touch 180 |

`start_url` is `/request-a-banknote`, not `/`. Someone who installed the app
has already read the pitch; what they came back for is to look up another
date.

### Being asked to install

The manifest makes the site installable; without a prompt the only way in is
Chrome's overflow menu, which nobody opens. `InstallPrompt.tsx` is the
discovery half, and it installs the app and nothing else — it never asks for
notifications or any other permission on the side.

Two platforms, two mechanisms. Chromium fires `beforeinstallprompt`, which we
suppress so the browser's mini-infobar does not pick the moment for us, then
replay from our own button. iOS fires nothing and has no programmatic install
at all, so there the banner shows the Share -> Add to Home Screen steps rather
than a button that cannot work. Chrome and Firefox on iOS get nothing, because
they cannot install and the instructions would be a lie.

It stays out of the way: hidden once the app is running standalone, hidden on
`/payment`, `/admin` and the auth pages — someone with their card or password
out is mid-task, not shopping for an app — and a dismissal is remembered for
30 days in `localStorage`. Blocked storage is treated as "not dismissed", so
the banner degrades to once per session rather than never appearing.

### The offline page's stylesheets

Precaching `/offline` alone left it unstyled for anyone who installed the app
and lost the connection before browsing far enough to warm the asset cache:
its CSS lives at a content-hashed `/_next/static` path the worker cannot know
at build time. `precacheOfflinePage` in `sw.js` fetches the page at install,
reads the stylesheet hrefs out of the served markup and caches those too,
which keeps it in step with the build without a generation step. Same-origin
hrefs only, and the fetches are settled rather than awaited as a group so one
missing file cannot fail the install and leave the worker unregistered.

### The rule that matters

**Nothing personal is ever cached.** A phone is often shared, and a cached
`/track-order` page would show one person's order to the next — or show its
owner a status that changed hours ago. `NEVER_CACHE` in `public/sw.js` is the
whole reason that file needs care:

```
/api/  /admin  /account  /payment/  /track-order/
/login  /signup  /forgot-password  /reset-password/
```

Anything matching goes straight to the network, and a failure is a failure —
a browser error beats a stale order status.

Verified by loading `sw.js` in a stubbed worker context and asking which
requests it intercepts:

```
passthrough  GET /track-order/BN-140387-ABCD     handled  GET /
passthrough  GET /account/orders                 handled  GET /blog/a-post
passthrough  GET /admin/orders/BN-1              handled  GET /_next/static/chunks/main.js
passthrough  GET /payment/BN-1                   handled  GET /icons/icon-192.png
passthrough  GET /login
passthrough  GET /api/requests
passthrough  POST /api/requests
passthrough  GET https://fonts.gstatic.com/…
```

Everything else is network-first for navigations (so published content is
never stale) and stale-while-revalidate for build output and icons, which are
content-hashed.

Registration is skipped in development, where a worker caching build output is
a debugging trap rather than a feature.

---

## WhatsApp order updates

Via the Meta Cloud API, sent alongside the existing emails at every step:
request received, confirmed, unavailable, paid, dispatched.

### Consent

Per order, not per person, because consent is given at the point of ordering
and guests order too. `orders.whatsapp` and `orders.whatsapp_opt_in`.

A number without a ticked box, or a ticked box without a number, are both
just "no". The check lives in `whatsAppRecipient()`, so no call site can send
by forgetting it. A signed-in customer's number is prefilled from their
profile, but **the box still starts unticked** — having someone's number is
not the same as being asked to use it.

### Templates

Business-initiated messages must use a template Meta approved in advance.
Nothing in this codebase can send free text: the wording lives in Meta's
dashboard, and `src/lib/whatsapp.ts` supplies only the placeholder values.

Create these in **business.facebook.com → WhatsApp Manager → Message
templates**. Names are configurable in `.env`; the placeholder *order* is not.

| Template | Placeholders | Suggested body |
| --- | --- | --- |
| `order_received` | name, what they asked for, reference | Hi {{1}}, we've got your request for {{2}} and we're searching our collection now. Your reference is {{3}} — we'll message you as soon as we know. |
| `order_confirmed` | name, what we found, total, reference | Good news {{1}} — we found {{2}}. Your total is {{3}}, including tracked delivery. Reference {{4}}. Check your email for the secure payment link. |
| `order_unavailable` | name, the dates, reference | Hi {{1}}, we searched but couldn't find a note for {{2}}. You haven't been charged. Reference {{3}}. |
| `order_paid` | name, amount, reference | Thanks {{1}} — we've received your payment of {{2}}. Your note is being packaged now. Reference {{3}}. |
| `order_shipped` | name, tracking number, reference | Hi {{1}}, your order is on its way. Tracking number {{2}}. Reference {{3}}. |

Two API details the code works around:

- **Body parameters may not contain newlines, tabs, or four or more
  consecutive spaces.** Meta rejects the whole message if they do, so every
  value goes through `param()`.
- **Numbers must be digits only, with a country code and no `+`.**
  `normaliseWhatsAppNumber()` strips punctuation, drops a `00` international
  prefix or a domestic leading `0`, and adds `WHATSAPP_DEFAULT_COUNTRY_CODE`
  (91) to a bare ten-digit number. Anything that cannot be a real number
  returns null and is skipped rather than sent to whoever owns the number the
  typo became.

### Failure handling

Identical to email: logged and swallowed. A Meta outage must never roll back
an order or fail a customer's request. Leave `WHATSAPP_ACCESS_TOKEN` blank to
log messages instead of sending them, exactly as `MAIL_ENABLED` does.

`WHATSAPP_API_BASE` exists so the integration can be pointed at a stub or an
outbound proxy without touching the sending code.

`/api/health` now reports `whatsapp` alongside `database`, `stripe` and
`mail`.

---

## Verified end to end

Against a real MySQL and a stub standing in for Meta, capturing what was
actually sent:

| Check | Result |
| --- | --- |
| Request shape | `POST /v21.0/{id}/messages`, `Bearer` auth, correct `messaging_product` / template / body-parameter JSON |
| Number normalisation | `98765 43210` → `919876543210` |
| Order with opt-in | One message, `order_received` |
| Order with a number but the box unticked | Nothing sent |
| Box ticked with no number | 422, order not created |
| Confirm, dispatch | `order_confirmed` and `order_shipped` with the right parameters |
| Meta unreachable | Order still created; failure logged |
| Manifest, `sw.js`, offline page, icons | All served |
| `<link rel="manifest">`, theme colour, apple-touch tags | Present in the HTML |
| Service worker deny-list | Every personal route passes through uncached |
| Phases 1–4 regression | Unaffected |

---

## Still not built

**Mobile OTP login via MSG91**, deferred back in the planning conversation.
The `users.phone` and `users.phone_verified` columns are still there and still
unused, so adding it remains additive.

Also absent: WhatsApp *inbound* handling (a customer replying goes to the
number's inbox, not to this app), delivery-status webhooks, and push
notifications — the service worker has no `push` handler, since notifications
need a subscription flow and a reason to exist beyond the ones WhatsApp and
email already cover.
