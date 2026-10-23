# Portal payments

Paid access to items through Stripe. The portal token carries `item_id`, `user_id`, `firstname`, `lastname`, `email` ([auth.md](auth.md)). Payments are enabled only when `portal.payment.stripe.sk` resolves ([configuration.md](configuration.md)); `getStripeClient()` (`src/stripe.ts`, API version `2025-12-15.clover`) returns `null` otherwise. The REST contract lives in [`src/portal/openapi.yaml`](../../src/portal/openapi.yaml): update it with every route or payload change.

## Linking Algorea to Stripe

| Stripe object | Link | Lookup (`src/portal/lib/stripe/`) |
|---------------|------|-----------------------------------|
| Customer | `metadata.user_id` | `findOrCreateCustomer`: `customers.list({ email })`, filtered on `user_id`; creates the customer when none matches |
| Product | `metadata.item_id`, `default_price` | `findPriceByItemId`: `products.search` on active products, returns the product's `default_price` |
| Invoice | `metadata.item_id`, `status: paid` | `hasPaidInvoice`: `invoices.list({ customer, status: 'paid' })`, filtered on `item_id` |

Customer and invoice lookups use `list()` instead of `search()` because Stripe's search index lags 10–30 s, which would create duplicate customers or report a fresh payment as unpaid. Product search is safe because products are created in advance. Several matches log a warning and use the first.

## Entry state (`GET /portal/entry-state`)

Returns `{ payment: { state } }`:

- `disabled`: no payment config, or no Stripe client.
- `paid`: the customer has a paid invoice for the item.
- `unpaid`: no paid invoice, **or any Stripe error** (logged). Failing closed keeps access locked.

## Checkout (`POST /portal/checkout-session`)

Body `{ return_url }`. Finds or creates the customer and resolves the price in parallel, then creates an embedded Checkout Session and returns `{ client_secret }`. Session settings: `mode: payment`, `ui_mode: embedded`, quantity 1, automatic tax, required billing address, tax-ID collection enabled but optional (`required: 'never'`), no promotion codes, `customer_update` name and address `auto`, and invoice creation with `metadata.item_id`. That invoice metadata is what entry state later detects as `paid`.

| Failure | Status |
|---------|--------|
| missing or invalid `return_url`; no product or no `default_price` for the item | 400 (`DecodingError`) |
| payment not configured; Stripe client unavailable; other Stripe error | 500 (`ServerError`) |
| invalid token | 401 |

## Payment cycle

Entry state `unpaid` → checkout returns `client_secret` → client renders Stripe's embedded Checkout → Stripe creates the invoice tagged with `item_id` → entry state `paid`.

## Tests

Stripe SDK calls are mocked in unit and regular e2e tests. The real-Stripe specs (`src/portal/e2e/*-stripe.spec.ts`) need a test key (`config.e2e-test.json` or `STRIPE_SECRET_KEY`) and a static test product with `metadata.item_id = "test-premium-access-001"`; they skip when either is missing.
