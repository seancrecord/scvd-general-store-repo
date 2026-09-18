# Native MPP on the whole shelf — September 18, 2026

The [scoped activation](MPP_SCOPED_ACTIVATION_2026-09-17.md) opened one door,
Context Anchor over HTTP on Base in USDC, and the September 17 house run
qualified that lane end to end. This release offers the same lane on every
HTTP door the shelf sells: an unpaid `GET /api/buy/{item}` for any catalog
item answers with the x402 offer and a native `WWW-Authenticate: Payment`
challenge for that item's own minimum, and a credential signed against it
settles, delivers and is booked the way the pilot's did. Nothing moves to
another network, asset, transport or price.

## What is offered

- Every item on the shelf, all four families the HTTP door sells through:
  simple and personal instant goods, observations the store prepares before
  the settle, term watches, and human-queue orders. The door set is derived
  from the catalog (`nativeCheckoutDoors` in `src/lib/purchase-capabilities.ts`),
  never listed by hand; the guide's count is that derivation.
- Method `evm/charge`, Base (`eip155:8453`), native USDC, six decimals, at the
  item's minimum from its existing Base offer. No native tip.
- HTTP GET only in this release; the [MCP release](MPP_MCP_CHECKOUT_2026-09-18.md)
  of the same day adds tools/call. WebMCP and the packages keep x402. The
  guide says so in the same paragraph that advertises the native doors.
- One flag, both Workers: `MPP_CHECKOUT_ENABLED`. Rollback is unchanged.

## What changed underneath

- **The gate** derives the native door from the path and the shelf
  (`nativeCheckoutItem`); the terms come from the item. Discovery, the
  challenge, admission and accounting all read the same derivation.
- **The observation families** get the same pre-settle checkpoint the x402
  gate builds, so a lost response on a prepared observation recovers the
  prepared reading rather than a second one.
- **The native ledger** writes the item on every sale and splits each month
  by item. Rows booked during the one-product pilot carry no item; a month's
  totals beyond the sum of its split are that product
  (`LEGACY_NATIVE_ITEM`). A retry of a pilot sale that now names its item is
  the same sale; a house correction of a pilot row still works. A split that
  claims more than its month holds is unreadable, not trusted.
- **The admin till** counts native sales per item from that split. The
  public counts are unchanged in meaning: organic excludes house; protocol,
  network and currency remain separate axes.
- **The books sweep and the legacy repairs** classify every Base certificate,
  not only the pilot's product, and ask the native ledger once per walk
  rather than once per certificate.
- **The doors Worker mints the challenge itself** when it holds the challenge
  key, from the SDK's own definition of a challenge (seven slots, HMAC-SHA256
  id, one `Payment` header) without carrying the settlement SDK; the doors'
  header is byte-identical to the store's under the same clock and key, and
  `test/doors-parity.spec.ts` holds that for every door. Without the key the
  doors hand the unsigned knock to the store, which is correct and slow.

## The keeper's press

Put the store's `MPP_CHALLENGE_KEY` on `scvd-doors` as a secret, the same
value, at least 32 bytes:

```sh
npx wrangler secret put MPP_CHALLENGE_KEY -c doors/wrangler.jsonc
```

Until then, every unsigned door knock is handed to the store and pays the
store's cold start again, which is the cost the doors Worker exists to
remove. The store answers correctly in the meantime; nothing is refused.
A key shorter than 32 bytes is refused by the SDK on the store and by the
doors' minter alike, and a store with a short key answers 500 on every
native door: set the same long key in both places.

## What would catch it going stale

- `test/mpp-whole-store.spec.ts`: one door from each family bought with the
  stock SDK client; the challenge amount is the item's minimum; the native
  ledger row names the item; the month's split, the public count, the admin
  till, the purchase inspection and the certificate classifier all read the
  same sale; a pilot row without an item folds under the pilot's product; an
  over-claiming split is refused; a sale or a mirrored split naming an
  object's own reserved name (`__proto__`, `constructor`, `prototype`) is
  refused before it can reach `Object.prototype`; no challenge on an
  unknown item, a trailing slash, or MCP. Shown failing against the
  previous source.
- `test/doors-parity.spec.ts`: every door's doors-minted challenge equals the
  store's, byte for byte; without the key, the knock is handed over.
- `test/mpp-checkout.spec.ts`: the failure matrix on the pilot's door,
  unchanged in meaning; the doors now mint the offer and forward only the
  credential.
- `test/mpp-rollout-discovery.spec.ts`: a second product's contract carries
  its own minimum; disabled and incomplete configurations still omit the
  claim.
- `scripts/cold-local.mjs`: the doors script stays under its megabyte.

## Not in this release

Other networks and assets, native tips (MCP and the WebMCP bridge followed
the same day),
Stripe, subscriptions, native refund automation, a public browser checkout
beyond the reviewed CORS surface, and a services-directory claim. Canonical
MPP discovery interoperability is tracked in the
[OpenAPI repair](MPP_OPENAPI_DISCOVERY_2026-09-17.md): its additive descriptor
follows the enabled shelf while retaining x402 fields. External network parsing
and directory admission remain open. The live house
qualification covered the pilot's door; the other families are qualified by
the fixtures above and by the shared lifecycle, not by a live purchase of
each.
