# Native MPP on the publication doors — September 19, 2026

The [purchase plan](MPP_PURCHASE_PLAN_2026-09.md) said it in September's
first week: publication pricing needs explicit coverage, menu products are
not the entire store. The almanac's pages, the gazette's issues, the zodiac
archive and Open for Business sell over x402 at their family's tiers with
no shelf item behind them, and every native release since the pilot left
them on x402 alone; the September 18 crawl read three paid operations
without an `mpp` descriptor, and they were these. This release offers the
native lane on every publication door.

## What changed

- **A publication door is a native door.** `nativePublicationDoor` in
  `lib/mpp-checkout-capability.ts` recognises a page by the route shapes
  the publication routes already own (an almanac slug, a gazette issue, an
  archived zodiac week, an Open for Business week; an index is not a door)
  and names its family and tiers from `lib/payments.ts`, the same place the
  till prices it. The unpaid GET answers with one challenge per tier,
  minimum first, beside the x402 offer, bound to the page's URL digest and
  the purchase key like every shelf door's.
- **The store's gate on the publication routes.** The shelf's doors reach
  the native lane through `createDoorChecks`; the publication routes used
  the bare x402 gate. `lib/store-payment-gate.ts` is the same loader the
  shelf uses, in a module only store route files import, so the doors
  Worker's bundle is untouched; the four publication routes use it.
- **Settle after the page, as x402 does.** A page handler delivers first
  and never settles. The native lane now settles for it after a 2xx, with
  the prepared page retained on the purchase record as a
  `PublicationSnapshot` before the settle, so a lost response is recovered
  from the journal the way an x402 page is: the same signed credential
  again returns the retained page with `Paid-Retry`, no second settle. The
  response carries `Payment-Receipt` and the private `Purchase-Recovery`
  handle. A refused or uncertain settle replaces the page with the refusal,
  never serves it.
- **The ledger's spelling.** A publication sale is booked under its family
  (`almanac`, `gazette`, `zodiac_archive`, `open_for_business`) in the
  native ledger's per-item split, beside the shelf's per-item rows;
  `mppSaleItemKey` is the one derivation the writer, the inspection and the
  comparison share. Tips book as on the shelf: paid minus the family's
  minimum, on the record.
- **Discovery.** The payment guide names the lane on the publication pages
  when it is enabled, and the OpenAPI page operations carry the `mpp`
  protocol descriptor beside `x402` from the same enabled answer, so a
  directory reader sees it where it saw the gap.

## What is shared

The adapter, verify and settle, durable admission, the purchase record,
recovery, the inspection, the books sweep, and the x402 lane on the same
pages, unchanged. The doors Worker never fronts a publication path, so
parity has nothing new to hold.

## What would catch it going stale

- `test/mpp-native-publications.spec.ts`: an almanac page lists the penny
  tiers natively, bound to the page and the key, matching the x402 accepts;
  an index is not a door and the other three families are; the stock
  client buys the page and gets markdown, a receipt, a recovery handle, a
  settled record with the page retained and no item, the family row in the
  ledger and a matched inspection, and the same credential again is the
  same page with no second settle; the patron tier books a tip on the
  record and the whole amount in the ledger; a page not on the shelf sells
  nothing and the disabled lane quotes no challenge; the guide and the
  OpenAPI page operations name the lane only when enabled. Shown failing
  against the previous source.
- `test/penny-pages.spec.ts`, `test/open-for-business.spec.ts`,
  `test/publication-*.spec.ts`: the x402 lane on the same pages, unchanged.
- `test/mpp-native-tips.spec.ts`, `test/mpp-whole-store.spec.ts`,
  `test/mpp-checkout.spec.ts`: the shelf's lane, unchanged.
- `test/openapi-discovery-shape.spec.ts`: the descriptor stays `x402` alone
  where the lane is not enabled.

## Follow-through, the same night: the checkout block names the lane

The release above left the indexes' `checkout` block describing the x402
shape alone, because `lib/publication-checkout.ts` could not ask the
native capability module whether the lane is offered: the capability
module read the publication path patterns out of `lib/payments.ts`, and
`payments.ts` builds the page's 402 body from the checkout block. The
patterns (and the commission rung's) now live in `lib/door-paths.ts`, a
leaf that prices nothing; `payments.ts` re-exports them so every reader
keeps its import, and the capability module no longer imports the till.

With the cycle gone, `publicationCheckout(base, env)` carries an `mpp`
block exactly while `nativePublicationsEnabled(env)` says the page's 402
will carry the challenge list: protocol, method and intent, the Base
network, the header names (the shelf row's own, spelled once as
`NATIVE_HTTP_HEADERS`), the markdown delivery, and three steps in the
x402 block's register, quote, authorize one listed challenge, retry with
the credential and the same key. It rides the four compact indexes, the
page's 402 body and every publication resource in `/.well-known/x402.json`,
from the one function, so the 402 body still equals the index's block.
With the lane withheld, every surface is byte-for-byte what it was.

- `test/mpp-native-publications.spec.ts`, the last case: the four indexes
  carry the block with the shelf row's header names; the 402 body and the
  manifest resource equal the index's block; withheld, the block is gone
  from all three and the x402 shape is unchanged. Shown failing against
  the previous source (the block absent on `/almanac`).
- `test/publication-checkout.spec.ts`: the 402 body still equals the index.

## Not in this release

Commission rungs (`/api/commission/pay/{rung}`, a quoted price per brief)
followed the same night in [their own release](MPP_COMMISSION_2026-09-19.md);
the indexes' `how_to_buy` sentence and the page-level prose still say
x402, with the `checkout.mpp` block and the guide carrying the native
lane; the WebMCP bridge already quotes and completes any page it lists
through the same headers; other networks and assets; a live purchase.
