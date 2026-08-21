# Phase 3 — Bulk orders

One order, many notes. `orders` becomes the parent — one customer, one
payment, one parcel — and each requested banknote is a row in `order_items`.

## Two decisions that shaped everything

**Availability is per note.** Finding four dates out of five should not cost
the customer the other four, so each item carries its own `availability`
(`pending` / `available` / `unavailable`) and its own `price_paise`. The
order total is the sum of the available ones.

**One form, not two.** `/request-a-banknote` gained a repeatable row rather
than growing a separate `/bulk-request` page. One code path, one set of
validation rules, and a single-note customer sees no new page.

## The migration

`orders` used to *be* a note: the date, denomination and recipient lived on
the order row. `npm run db:migrate` copies each of those orders into
`order_items` as a single item, deriving the item's availability and price
from the order's status, and then drops the nine moved columns.

Two guards make that safe to run on a live database:

- The copy touches only orders that have **no items yet**, so re-running does
  nothing.
- Nothing is dropped while **any order still has no items**. If the backfill
  is incomplete the script says so and leaves the columns alone.

A bug this surfaced, worth remembering: the Phase 1 `ALTER` that added
`gift_relationship` positioned it `AFTER gift_for`. Once Phase 3 drops
`gift_for`, re-running the migration tried to re-add the column against a
reference that no longer existed — failing every subsequent deploy. Those two
Phase 1 alterations now carry `requiresColumn: 'display_date'`, so they apply
only to a database that predates the move.

## Where the total comes from

`orders.price_paise` is derived and never typed by a human:

- `recomputeTotal` sums the available items' prices after every item change.
- Stripe's line items are built from the **same rows** — one line per note, so
  a customer paying for three dates sees three priced lines rather than one
  unexplained total.

## Guards

| Rule | Where |
| --- | --- |
| `confirmed` needs ≥1 note found *and* priced | API, and the button is disabled |
| `unavailable` needs *every* note missing | API, and the button is disabled |
| A paid order's notes cannot be changed | `PaidOrderError`, 409 |
| An item can only be reached through its own order's reference | SQL `WHERE order_id = ?` |
| At most 20 notes per order | Shared validation |
| The same date + denomination twice in one order | Shared validation |

## Verified end to end

Against a real MySQL, over HTTP:

| Check | Result |
| --- | --- |
| Fresh install | `order_items` created, per-note columns gone from `orders` |
| Simulated pre-bulk database with 3 real orders | All 3 moved; availability and price derived correctly from each status |
| Migrate re-run after the move | No re-add, no re-drop, no failure |
| 3-note bulk submission | One order, three items, positions preserved |
| Duplicate date + denomination | Rejected |
| One bad row among good ones | Error reported against that row's index only |
| Marking 2 of 3 found and pricing them | `orders.price_paise` = ₹5,699, computed |
| Confirming with nothing priced | 409 |
| Declining the whole order with 2 found | 409 |
| Editing a note on a paid order | 409, total unchanged |
| Item from another order via the wrong reference | 404 |
| Item edit while signed out | 401 |
| Confirmation email | Lists what was found, names what was not |
| Payment and tracking pages | Show the per-note breakdown and the total |
| Legacy single-note order | Renders as before |
| Admin search by a date inside a bulk order | Finds it |
| Phase 1 + 2 regression | Guest-order claiming, accounts and admin roles unaffected |

## Not included

Splitting an order into multiple parcels; per-item shipping; refunding a
single note after payment. All three assume the order is already paid, which
is where the frozen-after-payment rule currently draws the line.
