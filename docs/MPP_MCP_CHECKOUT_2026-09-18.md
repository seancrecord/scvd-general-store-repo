# Native MPP on the MCP door — September 18, 2026

The [whole-shelf release](MPP_WHOLE_STORE_2026-09-18.md) put a native MPP
challenge beside the x402 offer on every HTTP door. This release offers the
same lane on the MCP door: an unpaid `buy_*` tools/call for any shelf item
answers with the x402 terms and a native challenge for that item's own
minimum, a credential signed against it settles, delivers and is booked the
way the HTTP door's does, and the receipt returns in the result. Nothing
moves to another network, asset or price; the packages keep x402.

## The wire shape

The envelope is the MPP SDK's own MCP transport convention, read off the SDK
rather than spelled here (`lib/mcp-mpp-payment.ts` reads `Mcp.*`; the
SDK-free `lib/mpp-mcp-keys.ts` carries the same three names for the doors
Worker's discovery, and `test/mpp-mcp-checkout.spec.ts` holds the two equal):

- **Unpaid call.** In the legacy dialect the JSON-RPC error keeps code 402
  and its x402 terms; `error.data['org.paymentauth/payment-required']` adds
  `{ httpStatus: 402, challenges: [challenge] }`. In the tool-result profile
  (`?payment=tool-result`) the same object rides
  `result._meta['org.paymentauth/payment-required']` beside the x402 quote.
  The challenge's purchase key is the key the door quotes with it
  (`idempotency.suggested_key`, or `_meta['x402/idempotency-key']`), one
  string, so a credential's key and a retry's key cannot disagree.
- **Paid call.** The credential object goes in
  `params._meta['org.paymentauth/credential']` with identical arguments. A
  call carrying both that and `_meta['x402/payment']` is refused before
  either is read (`ambiguous_payment_credentials`, nothing charged).
- **Receipt.** `result._meta['org.paymentauth/receipt']` carries the MPP
  receipt with the id of the challenge it answered. A keyed retry returns
  the original receipt from the purchase journal, never a reconstruction.

## What binds the challenge

The HTTP challenge binds the digest of the request URL. The MCP challenge
binds the digest of the complete canonical tool arguments, the same digest
the door's idempotency surface and its delivery intent already carry, under
the scope `mcp:buy_{item}`. A credential minted for the HTTP door does not
open the MCP door, nor the reverse; the same arguments are one purchase.

## What is shared

The EVM adapter, the facilitator verify and settle, the deferred submission
under durable admission, the purchase record (`door: "mcp"`), the native
ledger row and its per-item split, the admin till, the purchase inspection,
the certificate classifier and the books sweep are the HTTP lane's, unchanged.
The route's own delivery, decline, unknown-settlement and delivery-failed
branches are the x402 lane's: the native lane returns the same outcome family.

Recovery is the HTTP lane's too. A retained fingerprint of the credential
authenticates the original purchase after expiry, key rotation or disabling
the lane; the same signed authorization presented through x402 reaches the
same journal. Because the stock client derives the authorization nonce from
the challenge id, the same buyer re-signing the same challenge is recognised
as the owner of that purchase and handed it back without charge, which is
the recovery lane doing its job, not a second sale.

## What would catch it going stale

- `test/mpp-mcp-checkout.spec.ts`: the stock MCP SDK client, wrapped by the
  stock MPP client, buys through the real door over the tool-result profile
  (an instant observation and a human-queue order); the legacy dialect is
  bought by hand with the SDK credential, then retried; both dialects quote
  the challenge keyed to the retry key; both credentials at once, a tampered
  challenge and an HTTP-minted credential are refused before settlement; the
  disabled lane quotes no challenge and refuses a credential without charge;
  every sale is read back through the ledger, the split, the inspection and
  the classifier. Shown failing 7/7 against the previous source.
- `test/mpp-whole-store.spec.ts` and `test/mpp-checkout.spec.ts`: the HTTP
  lane, unchanged in meaning.
- `test/mpp-rollout-discovery.spec.ts`: disabled and incomplete
  configurations still omit the claim; the MCP row appears only beside the
  HTTP row.
- `scripts/cold-local.mjs`: the doors script stays under its megabyte with
  the SDK-free key names.

## Found on the live door the same day: the x402 resource URL

CV, trying a real purchase of Context Anchor with the stock `mppx@0.10.1`
client and a funded wallet, hit
`x402 payment-required resource does not match response URL` before any
signature was attempted. The mechanism, read in the SDK: its http transport
collects every protocol's offer on a 402, and its x402 reader compares the
envelope's `resource.url` to `response.url` with strict equality and throws
on a difference, before the native `WWW-Authenticate` challenge is signed.
The store's buy routes declared the bare door as their resource, while a door
that requires a query (`?summary=`, `?host=`) is only ever bought with one,
so the stock client could not buy those doors at all. Not a facilitator
matter; the store's own envelope.

The buy and commission routes no longer declare a static resource, so the
x402 server names the URL that was actually asked, query and all; a bare
knock still names the bare door, so indexers read what they always read, and
the signed offers, derived from the envelope, name the asked URL too. The
fixture harness had never seen the defect because a Response built by
`app.fetch` carries no url, so the SDK skipped the comparison;
`test/mpp-whole-store.spec.ts` now exposes the response URL the way a real
fetch does, failed on every door that takes a query, and passes.

The September 17 house run was made through the same SDK against the same
door with a `?summary=`; why it passed is not established here.

## Not in this release

The packages, other networks and assets, Stripe, subscriptions,
and a services-directory claim; the WebMCP bridge followed in
[its own release](MPP_WEBMCP_CHECKOUT_2026-09-18.md), and native tips in
[theirs](MPP_NATIVE_TIPS_2026-09-19.md). The live house
qualification covered the HTTP pilot's door; the MCP lane is qualified by the
fixtures above and by the shared lifecycle, not by a live purchase.
