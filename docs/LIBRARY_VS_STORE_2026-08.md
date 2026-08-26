# Where the library's behaviour is not our behaviour

**Dated 2026-08-25.** A side-by-side of every `@x402` / `@coinbase/x402`
integration point this store touches: what the SDK's own middleware
or default wiring would do, and what our code does instead. Written
so the cold-isolate miss cannot be walked past again by reading the
Hono package and concluding that is how this till runs.

**What this is.** Gap-finding prompt 4 of the same series as
`docs/SILENT_DEFAULTS_2026-08.md` (prompt 1) and
`docs/CLIENT_ABORTS_AND_PUBLISHED_COUNTS_2026-08.md` (prompts 2–3).
Direct heir to the cold-isolate miss: four of five latency reports
described `@x402/hono` lazy init and concluded the facilitator
round-trip was off our challenge path. The library and the store
are not the same process. We hand-roll several things the SDK
offers.

**What this is not.** A ruling. A fix. A claim that the library is
wrong. Nothing here is shipped.

**Rule of the reading.** Installed `@x402/*@2.23.0` and
`@coinbase/x402@2.1.0`, plus this tree. Every divergence names both
sides and the file:line in force. A comment that asserts an order
the code no longer has is listed separately — that is how the next
report inherits a ghost.

---

## The finding that is the point of the paper

We do not mount `paymentMiddleware`.

`@x402/hono` exports three constructors
(`node_modules/@x402/hono/dist/cjs/index.js:340–356`). Nothing in
`src/` imports them. The till is `src/lib/payment-gate.ts`
`paymentGate` (`:546`), which builds its own
`HTTPRequestContext`, calls `processHTTPRequest` itself, and
calls `processSettlement` itself. The only Hono piece we take
from the package is `HonoAdapter` (`payment-gate.ts:1, 548`).

An analyst who reads the Hono README and the middleware source
is reading a server we do not run. Some of what they would
conclude happens to be true of us anyway, because we re-implemented
the same shape. Some of it is not. The rest of this paper is the
list.

---

## 1. Middleware mounting

| | SDK | This store |
|---|---|---|
| What | `app.use(paymentMiddleware(routes, server))` owns verify, 402, handler, settle, paywall, bazaar lazy-load, facilitator errors. | `paymentGate` is our middleware. Routes are compiled by hand in `getPaymentStack` (`src/lib/payments.ts:646–767`). |
| In force | Not mounted. | `src/lib/payment-gate.ts:546`. |
| Why, if a comment says | File header (`:97–128`): deliver-first, replay guard, paid retry, decline books — none of which the stock wrapper does. | |

**Wrong conclusion from the SDK docs.** That a 402 from this store
is the middleware's `c.json(response.body)` (`hono/index.js:239`)
with the library's PaymentRequired JSON as the body. Ours replaces
that body (see §8).

---

## 2. Facilitator `initialize()` — the cold-isolate miss

| | SDK | This store |
|---|---|---|
| What | `syncFacilitatorOnStart` defaults **true** (`hono/index.js:155, 340`). `paymentMiddlewareFromHTTPServer` **starts** `httpServer.initialize()` at middleware *construction* (`:159`), swallows the rejection (`:160–161`), and **awaits** it on the first paid request if not yet done (`:204–206`). In a long-lived Node process that construction is boot: GET `/supported` overlaps startup. | `getPaymentStack` is lazy (env secrets only exist at request time). First paid request per isolate constructs the server and sets `initialized: httpServer.initialize()` (`payments.ts:760–761`). `payment-gate.ts:632–633` then `await stack.initialized` **on every paid request including the 402**. A failed first sync **clears the cache** (`payments.ts:763–765`) so the next request rebuilds; the library swallows and retries the same promise. |
| In force | Default would put the cold tax on the first paid request *if* we mounted the middleware *and* constructed it at isolate start. We do neither. | `payment-gate.ts:633`. Comment at `:632`: “First facilitator sync happens on the first paid request per isolate.” |

**Wrong conclusion.** That our challenge path is free of
facilitator I/O because “the SDK inits on start.” On Cloudflare
Workers there is no start that has our CDP secrets. The first 402
on a cold isolate waits for GET `/supported` (library default: 3
retries on 429 only, 30s timeout — `http/index.js:302–307`). That
is why reports that generalised from the Hono wiring missed the
tax.

---

## 3. Facilitator URL and auth

| | SDK | This store |
|---|---|---|
| What | `HTTPFacilitatorClient` defaults to `https://x402.org/facilitator` (`http/index.js:302`) if `config.url` is omitted. | `createFacilitatorConfig(CDP_API_KEY_ID, CDP_API_KEY_SECRET)` (`payments.ts:649–650`) sets `https://api.cdp.coinbase.com/platform/v2/x402` plus CDP JWT headers (`@coinbase/x402/dist/cjs/index.js:99–103`). |
| In force | Overridden. | CDP. Timeout 30s is **not** overridden (`http/index.js:303`). |

**Wrong conclusion.** That we speak to `x402.org`, or that a
facilitator outage at that host is our outage. Our till dies when
CDP does.

---

## 4. Verify → handler → settle order

Stock `@x402/hono` middleware (`hono/index.js:241–334`):

1. `processHTTPRequest` — verify only, for the authorization flow
   we offer (`core/server/index.js:2525–2595`;
   `settleBeforeHandler` fires only for flows that declare it).
2. `await next()` — the route handler runs **unpaid**.
3. On handler throw or `status >= 400`:
   `cancellationDispatcher.cancel` (`:252–276`).
4. On 2xx: `processSettlement` (`:301–308`), then splice
   PAYMENT-RESPONSE onto the already-built goods.

Core `processHTTPRequest` will settle **before** returning
`payment-verified` when `phases.settleBeforeHandler` is true
(`server/index.js:2557–2579`). Our accepts omit
`extra.paymentFlow`, which the client treats as authorization
(prompt 2). Authorization settles after the handler.

**What we do** (`payment-gate.ts:936–1271`, header `:97–119`):

1. Same `processHTTPRequest` (verify).
2. Replay / idempotency / spent-nonce checks.
3. Hand the handler a `pending` with `settle()` (`:1206–1213`).
4. `await next()`.
5. A **minting** route calls `pending.settle()` at its last line
   **before** the mint — money moves, then signature + KV.
6. A route that mints nothing never calls it; the gate settles
   after a 2xx (`:1269–1271`) — stock x402's ordering.

Comment at `:102–105` quotes the *old* gate, which settled
**before** `next()` so a failed settle could never mint. Keeper
amended rule 9 on 2026-08-10 after six paid-and-got-nothing
incidents (chain reads after settle against a rate-limited RPC).

We do **not** pass `beforeHandlerSettlement` into
`processSettlement` (`:1006–1012`). Harmless on authorization;
the core would `console.warn` and skip after-handler settle if we
ever offered a before-handler flow without threading that result
(`server/index.js:2646–2650`).

**Wrong conclusion.** (a) That we settle after the handler like
the README, so a certificate cannot name `settlement_tx` at mint
time — minting routes settle *inside* the handler, before mint,
specifically so the artifact can cite the payment
(`payment-gate.ts:943–952`). (b) That we still settle before the
handler, because an older comment or an older report said so —
that order is retired. (c) That handler failure cancels a
settlement. Authorization has nothing to cancel; we do not call
`cancellationDispatcher` at all. A throw before `settle()` costs
the buyer nothing (`:1224–1231`).

---

## 5. Facilitator transport errors

| | SDK | This store |
|---|---|---|
| What | `processHTTPRequest` throw → `facilitatorErrorResponse` or `internalErrorResponse` (`hono/index.js:222–226`). Settle throw → facilitator error or empty `c.json({}, 402)` (`:326–333`). | `sendAlert` `settlement_failure` and **rethrow** (`payment-gate.ts:638–644, 1013–1019`). Hono `onError` answers with the store's fixed prose. Empty `{}` 402 is not a path we take. |

**Wrong conclusion.** That a facilitator 5xx comes back as a 402
with an empty body (the middleware's last-resort). Ours pages the
keeper and 500s. Separately, we retry one settle 5xx
(`processSettlementWithRetry`, `payments.ts:807–816`) and, if
that also dies, ask the chain (`rescueAmbiguousSettle`,
`:819+`). The library does neither. An analyst timing “one
settle HTTP” undercounts us on the blip path and misses the
rescue that exists because 2026-08-07 booked three declines for
transfers that had landed.

---

## 6. Offer-receipt — library extension unused

The SDK ships `@x402/extensions/offer-receipt`:
`createOfferReceiptExtension` / `declareOfferReceiptExtension`
(`offer-receipt/index.js:696–780`). Register it on the resource
server and every PaymentRequired is enriched in
`createPaymentRequiredResponse`; every settle is enriched in
`enrichSettlementResponse`. Default receipt **omits**
`transaction` unless `includeTxHash: true` (`:753–759`). Sign
failures `console.error` and skip that offer (`:717–718`).

**What we do.** `src/lib/offer-receipt.ts` is a from-scratch JWS
builder. Nothing in `src/` imports the library module. Offers are
spliced **after** `processHTTPRequest` returns the 402
(`payment-gate.ts:715–741`), into the PAYMENT-REQUIRED header
*and* the body. Receipts are spliced into the facilitator's
PAYMENT-RESPONSE (`withReceiptHeader`, `offer-receipt.ts:223–267`).
`transaction` is included when known (`:218–221, 253`) — the
privacy choice the spec leaves open, already made on the
certificate. Fail-open: any throw returns the undecorated 402 /
untouched settlement headers (`:38–46, 196–198, 268–269`).

Validity is the same number (300) set in two places
(`offer-receipt.ts:50`; library `createOfferPayload` `:478`). Same
value, our file.

The MCP door (`src/lib/mcp-payment.ts`) runs the same verify/settle
stack and **does not** call `signedOffersForChallenge` or
`withReceiptHeader`. A tools/call 402 is the raw challenge.

**Wrong conclusion.** That our offers come from
`createOfferReceiptExtension` and therefore (a) ride the resource
server's extension pipeline, (b) omit `transaction` on receipts,
(c) appear on every door including MCP, (d) fail closed if signing
throws. We fail open. MCP has no offers. Receipts carry the tx
when we have it.

---

## 7. 402 body is not the PaymentRequired document

`processHTTPRequest` with no payload builds a PaymentRequired and
then, if `unpaidResponseBody` is set, uses **that** as the HTTP
body (`server/index.js:2476–2486`). The accepts a client signs
still travel in `PAYMENT-REQUIRED`.

We set `unpaidResponseBody` on every compiled route
(`payments.ts:340–368, 417–426, 459–467`). The JSON a browser or
a body-first client sees is keeper prose: `error` / `note` /
`item_id` / price. Comment at `payment-gate.ts:137–143`: “on THIS
store the 402 body is the keeper's prose, not the standard
payment-required JSON.” The first offer-receipt cut looked in the
body, found no accepts, and a probe test caught it.

We then `enrich402Body` (`payment-gate.ts:716–724`) to add
decline diagnosis, hand-rolling help, listing spec.

**Wrong conclusion.** That `JSON.parse(402 body).accepts` is how
you pay us. That is the library example. A client that only reads
the body never sees our `accepts`. `@x402/fetch` reads the header
(prompt 2). Hand-rollers who follow the body-first snippet fail
here for a reason the SDK docs will not name.

---

## 8. Browser paywall HTML

| | SDK | This store |
|---|---|---|
| What | `FALLBACK_PAYWALL_HTML` (`http/index.js:682`) when `Accept: text/html` and no custom HTML. Middleware can `registerPaywallProvider`. | `customPaywallHtml: browserPaywallHtml` on **menu buy** routes only (`payments.ts:339`). Commission rungs and penny-page configs do not set it. We never call `registerPaywallProvider`. |

**Wrong conclusion.** That every paid URL serves the stock x402
paywall, or that every paid URL serves ours. Almanac / Gazette /
commission get the library fallback if a browser `Accept`s HTML.

---

## 9. Bazaar

| | SDK | This store |
|---|---|---|
| What | Middleware, if any route needs bazaar and the server has no extension, **dynamic-imports** `@x402/extensions/bazaar` on the first paid request and validates (`hono/index.js:178–191`). | We `registerExtension(bazaarResourceServerExtension)` at stack build (`payments.ts:670`). Declarations are hand-built in `src/lib/bazaar-discovery.ts` via `declareDiscoveryExtension` (that helper *is* the library). `persistBazaarObservations` after settle is ours. |

**Wrong conclusion.** That the first 402 also pays the bazaar
dynamic import. We load it when the isolate builds the stack,
which is the same first paid request — but it is our register
call, not the middleware's lazy import, and a bazaar load
failure is not `console.error` then continue.

---

## 10. Replay, idempotency, paid retry

The library has none of these. `processHTTPRequest` will verify the
same nonce again; `processSettlement` will present it again; the
chain's EIP-3009 nonce is the only stop.

We, before settle (`payment-gate.ts:748–933`):

- Idempotency lookup **after** facilitator verify, keyed on the
  signed payer, not the asserted address (`:752–767` says why the
  old top-of-gate lookup was a theft).
- KV spent-nonce guard.
- **Paid-retry lane**: same authorization, open delivery intent,
  goods never left → re-run the handler without a second charge
  (`:801–912`).

MCP has the spent-nonce refuse (`mcp-payment.ts:308–318`) and
**not** the paid-retry lane or `rescueAmbiguousSettle`.

**Wrong conclusion.** That a retried authorization is “just
another 402” the way a stock middleware app would treat it, or
that our replay defence is the protocol's. The protocol's is the
chain nonce after our KV TTL. Ours is a day of memory plus a
recovery lane the README does not mention.

---

## 11. Local preflight and decline books

The library forwards a malformed PAYMENT-SIGNATURE to the
facilitator (or fails `findMatchingRequirements` with “No matching
payment requirements”). Facilitator errors are truncated.

We run `preflightBlockers` **before** `initialize()` even
(`payment-gate.ts:573–622`) and return a named 402 without calling
CDP. Verify hooks `onAfterVerify` / `onVerifyFailure`
(`payments.ts:674–691`) stash the reason on a context slot the
SDK shallow-copies. The 402 body then carries `payment_declined`.

**Wrong conclusion.** That our 402 `error` field is the SDK's
`invalidReason`. Sometimes it is. Often it is `local:preflight:…`
or a booked composite the library never produced.

---

## 12. Resource metadata

The SDK's `sanitizeResourceServiceMetadata` caps `serviceName` at
32 characters and drops (does not truncate) over-long names. Our
real name is 37. We send `STORE_SERVICE_NAME = "SCVD General
Store"` (`src/store/metadata.ts:78–101`) so a facilitator catalog
is not an anonymous URL. Tags sit at the cap of five.

**Wrong conclusion.** That a bazaar/facilitator index labelled
“SCVD General Store” is a different shop, or that we declared no
service metadata (true of an older revision; the comment at
`metadata.ts:84–86` is why it changed).

---

## 13. MCP is a second till, not the Hono middleware

`src/lib/mcp-payment.ts` implements `HTTPAdapter` by hand
(`:69+`), synthesises GET `/api/buy/<id>`, and drives the same
`x402HTTPResourceServer`. JSON-RPC error 402, payment in
`_meta["x402/payment"]`. Same deliver-first `pending.settle()`.

It does not: splice offers/receipts; run paid-retry; run
ambiguous-settle rescue; record the settlement tx on the spent-
nonce row the same way (`:376` vs `payment-gate.ts:1092–1097`).

**Wrong conclusion.** That “they use the x402 Hono middleware, so
MCP is the same path.” MCP is a cousin we wrote. An analyst who
times or conformance-checks only `/api/buy/hello` has not seen
this door.

---

## 14. Extensions we do not take

| Library surface | What it would do | What we do |
|---|---|---|
| `@x402/extensions/sign-in-with-x` (`DEFAULT_MAX_AGE_MS` 5 minutes) | SIWX as an x402 extension | Not imported. Claims door is our own CAIP-122 (`src/routes/claims.ts:72–82`) |
| `@x402/extensions/builder-code`, `payment-identifier` | Optional 402 extras | Not imported |
| `upto` / permit2 / batch / smart-wallet schemes | Other settle shapes, fee defaults, Redis locks | Not registered. `ExactEvmScheme` + `ExactSvmScheme` only (`payments.ts:652–668`) |
| `@coinbase/x402` server helper networks | Base + Solana, no Polygon | Unused as a server helper. We register Polygon ourselves when `polygonPayTo` is set |
| Hono `timeout` / `bodyLimit` | Opt-in | Not mounted |

---

## Comments that assert behaviour the code no longer has

These are still in the tree. They describe the **pre-2026-08-10**
gate (settle, book, then `await next()`). `delivery-audit.ts:11–18`
already names this class of drift on that file's header, then
line 46 repeats the old sentence.

| Where | What the comment says | What the code does now |
|---|---|---|
| `src/services/pulse.ts:144` (the public `note`) | “The settlement counter is bumped before the handler that mints” | Minting routes: handler runs, then `pending.settle()` bumps the counter, then mint. Penny pages: handler returns 2xx, **then** the gate settles (`payment-gate.ts:1269`). |
| `src/routes/pulse.ts:132` (HTML twin of that sentence) | Same | Same |
| `src/lib/metrics.ts:874–886` (`RECONCILIATION_BLIND_SPOT`) | “`recordSettlement` … runs BEFORE the handler that mints” | `recordSettlement` runs inside `settleNow`, which is during or after the handler, never before it starts. The blind spot (counters balance on a failed mint) is still real for the **post-settle mint window**. The words “before the handler … runs” are false. |
| `src/routes/admin.ts:1413` | “BOTH are written before the handler runs” | Same stale order. The desk still exists for the remaining window. |
| `src/services/chain-reconciliation.ts:26` | Delivery audit “writes an intent row before the handler and clears it after” | Intent is opened **inside** `settleNow` (`payment-gate.ts:1188`), after money moved, before the mint returns. Not before the handler. |
| `src/services/delivery-audit.ts:46` | “written after settlement and before the handler” | Contradicts the same file's corrected header (`:20–27`). Settlement *is* inside or after the handler. |

`payment-gate.ts:100–105` quotes the old order on purpose and
says it is retired. That one is not a trap.

An outside analyst who trusted the pulse `note` or the admin
blind-spot sentence would conclude we still settle-then-handle,
which is the opposite of rule 9 as amended — and would then
mis-time the cold path, the mint window, and which failures
`unexplained: 0` can hide.

---

## What we use from the SDK without replacing it

So the list above is not “we rewrote x402.”

- `HonoAdapter` — as-is.
- `x402ResourceServer` + `x402HTTPResourceServer` —
  `buildPaymentRequirementsFromOptions`, `verifyPayment`,
  `processHTTPRequest` (verify half), `processSettlement`.
- `ExactEvmScheme` / `ExactSvmScheme` — price → USDC, extras,
  facilitator conversation.
- `HTTPFacilitatorClient` — verify/settle/supported HTTP, with
  our CDP config.
- `bazaarResourceServerExtension` + `declareDiscoveryExtension`.
- `createFacilitatorConfig` from `@coinbase/x402`.

The hand-rolls are the **wrapper**: when init runs, what the 402
body is, when money moves, what a retry means, how offers are
signed, and what we publish about all of that.

---

## Provenance

Gap-finding prompt 4, 2026-08-25, against
`phase1/freshness-coherence` and `@x402/*@2.23.0` as installed.
Prompts 1–3: `docs/SILENT_DEFAULTS_2026-08.md`,
`docs/CLIENT_ABORTS_AND_PUBLISHED_COUNTS_2026-08.md`.
Prompt 6 (discovery surfaces): `docs/DISCOVERY_SURFACES_2026-08.md`.

Nothing here is a keeper ruling. Re-read the gate header and the
Hono middleware before acting; if they have been reconciled, this
paper is the thing that went stale.
