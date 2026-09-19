# The checkout sentence names both lanes — September 19, 2026

Every native release since the [scoped pilot](MPP_NATIVE_CHECKOUT_2026-09.md)
ended with the same deferral: the surfaces that say how the till is paid
still said x402 alone. True, and no longer the whole truth. Since #790 every
HTTP door, since the [MCP release](MPP_MCP_CHECKOUT_2026-09-18.md) every
`buy_*` tools/call and since the [browser bridge](MPP_WEBMCP_CHECKOUT_2026-09-18.md)
the WebMCP quote also take native MPP on Base, and a reader holding an MPP
client read "paid in USDC over x402" on the door's own words and had no way
to know. This follow-through derives the sentence instead of retyping it.

## What changed

- **One derivation, spelled once.** `checkoutMethod(config)` in
  `lib/purchase-capabilities.ts` is the x402 clause `paymentMethod()` always
  produced — its exact shape, on the enabled checkout networks — followed by
  `nativeCheckoutLane(config)` while the lane is offered: the asset, the
  method, the network's label and how much of the shelf carries it, read off
  the same `payment_capabilities` rows the challenge is minted from. With the
  flag off, or without a challenge key, the sentence is byte-for-byte what it
  was before, so nothing here can name a lane the till does not take.
- **The surfaces that quote it.** Every priced Offer's
  `acceptedPaymentMethod` and the storefront's WebSite and Product JSON-LD
  (`lib/jsonld.ts`, `pages/storefront-page.ts`); the storefront's pay-rails
  line; each menu page's checkout checklist; `/.well-known/ucp`'s
  `how_to_actually_buy.payment_method`; OpenAPI's `info.description`; the
  MCP handshake's `instructions` (`nativeMcpInstruction`, the SDK's three
  `_meta` keys read from the same shape the compact catalog serves);
  `/how-it-works` `rails`; every long-tail answer on `/what`; the paid-shelf
  line on `/mcp.md`; the developer documentation's lede; and the item
  markdown's `buy` line.

## What stays as it was, and why

The identity constants that carry no configuration — `ALSO_A_STORE`
(`store/copy/position.ts`), `storeLead()` and `registryDescription()`
(`store/identity-lead.ts`), `storeIdentity().what` (`lib/identity.ts`), the
storefront's `termPayLine` and `payRails`, `/what`'s standing answers,
`skill.md`'s `protocol:` line and the README — still say "USDC over x402".
Each is true: x402 is offered on every door and is the lane every listed
network serves. They are keeper-voiced identity copy and are typed once
without a runtime to derive from, so they wait for the keeper's pen rather
than a second, static sentence about a lane a flag can close. Historical
signed readings keep their bytes.

## What would catch it going stale

- `test/payment-copy-consistency.spec.ts`, the new block: the twelve
  surfaces above are read twice, lane offered and lane withheld; every one
  names MPP with the lane offered and none does with it withheld; the x402
  clause survives in both; the profile's sentence equals the Offer's. Shown
  failing against the previous source on the storefront's pay-rails line.
- The five existing configurations in the same file still hold the x402
  clause to the enabled networks by shape, on and off.
- `test/jsonld-currency.spec.ts` still accepts exactly the front door's
  sentence or the trade counter's; the front door's now comes from
  `checkoutMethod`.
- `test/agent-catalog-readability.spec.ts` and `test/openapi-fetchable.spec.ts`
  hold the OpenAPI byte ceiling the longer `info.description` sits under.

## Not in this release

The static identity copy named above; the packages' own READMEs; any change
to prices, networks, offers or challenges.
