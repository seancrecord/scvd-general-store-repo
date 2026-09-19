# Native tips — September 19, 2026

Every native release so far ended with the same line: native tips are not
in it. The x402 offer on a pay-what-it-deserves door has been three accepts
per network since the shelf opened, the minimum and two tiers above it, and
whatever a buyer pays above the minimum is booked as a tip on the same
entitlement (`lib/payments.ts`, `tipFromPaid`). The native lane offered one
challenge, the minimum, on every door, so a buyer who wanted to tip over
MPP could not. This release mirrors the x402 tiers on every native lane.

## What changed

- **One challenge per tier, minimum first.** `nativeCheckoutTiers` in
  `lib/purchase-capabilities.ts` is the Base rows of the item's x402 offer
  in tier order; a fixed-price door has one row and one challenge, a
  pay-what-it-deserves door has three. The HTTP door writes them into one
  `WWW-Authenticate` header as RFC 9110's challenge list, which the SDK's
  client reads whole (`Challenge.fromResponseList`) and orders by its
  preferences, then by position, so a stock client that takes the first
  candidate pays the minimum it always paid. The MCP door carries the same
  list in the `challenges` array it already had. The doors Worker mints the
  same list, byte for byte, and parity holds it there.
- **The credential names its tier.** A credential's challenge carries the
  amount it was signed for; the store looks that amount up in the tier list
  (`nativeTermsForAmount`) and binds the adapter, the facilitator terms and
  the purchase record to that tier. An amount the list never offered is
  refused before the facilitator is asked, whatever its challenge id: the
  list is what the store agreed to sell at, and the HMAC alone is not the
  agreement. Paid minus minimum is the tip, booked exactly as an x402 tip:
  on the certificate as `tip_usdc`, in the purchase record, the orders
  ledger, the books and the tax export. The native ledger row carries the
  whole settled amount on the item, as it always has.
- **The browser bridge reads the list.** `quote_store_purchase` returns
  `payment_challenges`, every tier bound to the quote's key, minimum first,
  and keeps `payment_challenge` as the first; `complete_store_purchase`
  accepts a credential for any listed tier. A single-tier door lists one.
- **Discovery.** The `payment_capabilities` row for a tipping door gains
  `tip_tiers_atomic`, the offered amounts in the challenge list's order;
  `amount_atomic` stays the minimum. The payment guide says how to tip.

## What is shared

Everything below the tier choice: the EVM adapter, verify and settle, the
deferred submission under durable admission, the purchase record, recovery
(the same credential again is the same purchase, never a second tip), the
inspection, the classifier and the books sweep. The x402 tiers, prices and
tip arithmetic are untouched; the native lane derives from them.

## What would catch it going stale

- `test/mpp-native-tips.spec.ts`: a tipping door lists three challenges
  bound to one key and digest, and the doors mint the same bytes; a fixed
  door lists one; the stock client pays the minimum with no tip; the patron
  tier's credential settles with `paid_usdc` 4.95 and `tip_usdc` 3.96 on
  Luckies, read back through the ledger, the totals and the inspection,
  and the same credential again is the same purchase; a genuine challenge
  at an unoffered amount is refused before the facilitator is asked; the
  MCP door lists the tiers and the generous tier settles with its tip; the
  capability row and guide name the tiers. Shown failing 4 of 6 against the
  previous source.
- `test/doors-parity.spec.ts`: every door's unpaid answer, tipping doors
  included, is the same bytes from both Workers.
- `webmcp/purchase.test.mjs`: the quote lists every tier keyed to it and
  completes with any; another scheme beside the list is skipped, a tier
  keyed elsewhere is dropped, and a foreign id never leaves the page.
- `test/mpp-checkout.spec.ts`, `test/mpp-whole-store.spec.ts`,
  `test/mpp-mcp-checkout.spec.ts`: the single-tier lanes, unchanged.
- `scripts/cold-local.mjs`: the doors script stays under its megabyte.

## Not in this release

Other networks and assets, the packages, a tip on a fixed-price door (the
shelf has no such offer over x402 either), and a live tipped purchase.
