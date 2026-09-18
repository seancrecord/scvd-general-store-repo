# Native MPP on the browser bridge — September 18, 2026

The [whole-shelf release](MPP_WHOLE_STORE_2026-09-18.md) put a native MPP
challenge beside the x402 offer on every HTTP door, and the
[MCP release](MPP_MCP_CHECKOUT_2026-09-18.md) carried it onto tools/call.
This release carries it onto the last transport the store sells through:
the WebMCP purchase bridge, the explicit quote-then-pay pair an agent in
someone's browser registers from `/webmcp.js`. Nothing signs in the page;
the bridge only carries, as it always has.

## What changed

- **The free quote sends its retry key.** `quote_store_purchase` always
  minted a page-local retry key for the completion; it now sends that key
  as `Idempotency-Key` on the free GET too. Both Workers bind the native
  challenge to a supplied usable key, so the challenge's `purchase_key` and
  the completion's key are one string by construction.
- **The quote carries the challenge.** The bridge parses the door's
  `WWW-Authenticate: Payment` header the way the SDK reads it (RFC 9110
  auth-params with escaped quoted strings, base64url request and opaque)
  and returns it as `payment_challenge`: the raw header to sign, and its
  decoded id, realm, method, intent, request, expiry and meta. A challenge
  keyed to any other key, or none, is `null`; the x402 terms ride beside it
  unchanged.
- **The completion takes the credential.** `complete_store_purchase`
  accepts `signed_credential`, the `Payment <base64url>` value a payment
  client emits or its `{challenge, payload}` object, which the bridge
  serializes the way the SDK does. It is carried as the `Authorization`
  value with the quote's key, to the quote's URL, and nothing else crosses.
  The page refuses a credential for another quote's challenge, an oversized
  one, and a call carrying both `signed_payment` and `signed_credential`,
  before anything leaves it. `payment_receipt` returns the store's
  `Payment-Receipt`; `payment_response` stays the x402 receipt.
- **Recovery is unchanged.** A lost native response keeps the credential
  and key for the retry, never re-signs, and a completed quote returns its
  original result.

## What is shared

The store side is the HTTP door's native lane exactly: the bridge speaks to
`/api/buy/{item}` with `?src=webmcp`, so the purchase record, the native
ledger row and its per-item split, the till, the inspection and the
classifier all read a WebMCP sale as an HTTP sale from the browser channel.
The one store-side fact this release relies on, that a supplied
`Idempotency-Key` on the unpaid quote becomes the challenge's purchase key on
both Workers, predates it and is now pinned by test.

## Discovery

`payment_capabilities` gains a `webmcp` row naming the two tools and the
three fields; the compact catalog page carries it once at page level beside
the MCP row. The payment guide names the lane, and, from CV's live run,
tells stock-client buyers where the token's EIP-712 domain comes from: the
challenge carries none, and the SDK resolves it from its own asset registry
(`currencies: [Assets.base.USDC]`) or an explicit `authorization` option.

## What would catch it going stale

- `webmcp/purchase.test.mjs` (Node): the quote sends its key and carries
  the challenge bound to it; a challenge keyed elsewhere is not offered and
  cannot be paid natively; the credential reaches the door in
  `Authorization` with the quote's key and the receipt comes back; the
  object form is carried as the SDK's header; both credentials at once, a
  credential for another challenge and an oversized one never leave the
  page; a lost response keeps the retry identity. Shown failing against the
  previous bridge.
- `test/mpp-whole-store.spec.ts`: a supplied key binds the challenge on the
  real door, the credential settles under it, and a different key is
  refused before settlement.
- `test/webmcp-purchase.spec.ts`: the served script and schemas name the
  new fields.
- `test/mpp-rollout-discovery.spec.ts`: the compact page stays under budget
  with the page-level row.

## Not in this release

Signing in the page, a wallet API, other networks and assets, native tips,
the packages. The lane is qualified by the fixtures above and the shared
HTTP lifecycle, not by a live browser purchase.
