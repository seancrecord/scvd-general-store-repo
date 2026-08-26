# Silent defaults in the dependency chain

**Dated 2026-08-25.** A reading of the packages this store depends on
at runtime, as installed in `node_modules`, plus five live 402s
fetched the same day. Written so the finding survives the session
that produced it.

**What this is.** Gap-finding prompt 1 (silent defaults). Every
named default that constrains behaviour when the caller configures
nothing: caps, limits, timeouts, retry counts, allowlists, expiry
windows, fallback selections, feature gates. Ranked by how much of
*this* catalogue or paid path the default touches — not by how
interesting it is.

**What this is not.** A ruling. A latency report. A claim about
what buyers in the wild configure. Nothing here is shipped as a
fix.

**Why it is shaped this way.** Five reports on x402 latency. The
two findings that changed the roadmap were not in any of them as
conclusions: the `$1` client spend cap, and that `organic_verifies`
is not the x402 verify step. This paper exists so the first of
those cannot be walked past again by reading the docs instead of
the installed client.

**Rule of the reading.** Answer from the code that is installed and
running, not from documentation or memory. Every claim carries a
file path and line number, or a live response fetched 2026-08-25.
Where the library's behaviour and this store's behaviour differ,
both are named and the one in force is named. Every instance, never
one representative.

---

## Installed versions this reading used

| Package | Version | Role |
|---|---|---|
| `@x402/core` | 2.23.0 | Client spend controls, facilitator HTTP, route compile |
| `@x402/evm` | 2.23.0 | Exact EVM scheme (server + default-asset table) |
| `@x402/svm` | 2.23.0 | Exact SVM scheme |
| `@x402/hono` | 2.23.0 | `HonoAdapter` only — `paymentMiddleware` is not mounted |
| `@x402/extensions` | 2.23.0 | Bazaar discovery; offer-receipt *library* unused |
| `@x402/fetch` | 2.23.0 | DevDependency. The standard buyer. |
| `@coinbase/x402` | 2.1.0 | `createFacilitatorConfig` |
| `@coinbase/cdp-sdk` (auth) | 1.29.0, via `@coinbase/x402` | JWT for facilitator calls |
| `hono` | 4.13.3 | Framework |
| `viem` | 2.55.19 | `recoverMessageAddress` only |
| `@noble/ed25519` | 3.1.0 | Offer/receipt/certificate signatures |

Runtime `package.json` dependencies are those nine plus the x402
tree. `@x402/fetch` is listed because it is the client the reports
generalised from.

---

## The finding that is the point of the paper

`DEFAULT_MAX_AMOUNT_PER_PAYMENT = "$1"` lives in

`node_modules/@x402/core/dist/cjs/client/index.js:174`.

The constructor sets `this.spendControls = {}` (line 186).
`fromConfig` only calls `setSpendControls` when the field is
present (line 211). `selectPaymentRequirements` always calls
`applySpendControls` (line 576). The only escape is
`spendControls === false` (line 606). Otherwise line 642:

```
usdLimit = controls.maxAmountPerPayment === false
  ? false
  : controls.maxAmountPerPayment ?? DEFAULT_MAX_AMOUNT_PER_PAYMENT
```

`@x402/fetch` `wrapFetchWithPaymentFromConfig`
(`dist/cjs/index.js:118–120`) builds that client. This store never
sees the throw. A 402 goes out; no payment comes back.
`src/lib/payment-gate.ts:652–653` already names that monthly gap
as the budget-cap / abandonment signal.

The comparison is `<=` on atomic USDC (6 decimals). `$1` exactly
pays (`1_000_000`). `$1.01` does not.

Report 5 cited the constant exactly, then wrote that at
`$0.004–0.005` our prices never trip it, having probed one
endpoint. That is the failure mode this paper is built to defeat.

---

## Live 402s, 2026-08-25

Fetched with `Accept: application/json` and a browser-like
User-Agent (bare Python UA was 403). `PAYMENT-REQUIRED` decoded.

| Path | Status | Accepts | Amounts (atomic) | `maxTimeoutSeconds` |
|---|---|---|---|---|
| `/api/buy/hello` | 402 | 3 | `500000` | 300 |
| `/api/buy/settlement_attestation` | 402 | 3 | `4000` | 300 |
| `/api/buy/standing_watch` | 402 | 3 | `5000000` | 300 |
| `/api/buy/graffiti_on_a_train` | 402 | 9 | `1000000 / 2000000 / 5000000` × Base, Polygon, Solana | 300 |
| `/api/commission/pay/25` | 402 | 3 | `25000000` | 300 |

Rails on every door: `eip155:8453`, `eip155:137`,
`solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`. `accepts[0]` is always
Base. Signed offers under `extensions['offer-receipt']` carried
`validUntil` ≈ now + 300.

Live `https://scvd.store/menu.json` the same day listed the 24
items below. That list is the catalogue this ranking uses. If the
shelf moves, re-derive from `MENU_ITEMS` and the live menu — do
not trust a count typed beside them (rule 45, rule 46).

---

## Catalogue against the $1 cap

Derived from `src/store/menu.ts` and its aisle files, checked
against live `menu.json` 2026-08-25.

### Pays under an unmodified `@x402/fetch` client

| id | `price_usdc` | Note |
|---|---|---|
| `settlement_attestation` | 0.004 | |
| `small_blessing` | 0.005 | |
| `settlement_reconciliation` | 0.006 | |
| `the_confession` | 0.01 | |
| `attestation_bundle` | 0.05 | |
| `the_mandate` | 0.1 | |
| `hello` | 0.5 | |
| `bitcoin_anchor` | 1 | Exact dollar. Passes `<=`. |
| `context_anchor` | 1 | Exact dollar. Passes `<=`. |
| `passport_refresh` | 1 | Exact dollar. Passes `<=`. |
| `graffiti_on_a_train` | 1 | PWID tiers `$1 / $2 / $5`. See below. |

Penny pages (`PENNY_PAGE_USDC = 0.01` in `src/lib/payments.ts:67`)
are PWID `$0.01 / $0.02 / $0.05` and survive.

### Rejected whole — client throws, store sees a challenge and no settle

| id | `price_usdc` | Pricing |
|---|---|---|
| `signature_agent_card` | 2 | fixed |
| `the_statement` | 2 | fixed |
| `onpage_audit` | 3 | fixed |
| `recurring_patronage` | 3 | fixed |
| `coffees_for_closers` | 3 | fixed |
| `standing_watch` | 5 | fixed |
| `service_audit` | 5 | fixed |
| `conformance_watch` | 5 | fixed |
| `launch_check` | 5 | fixed |
| `luckies` | 5 | PWID `$5 / $10 / $25` |
| `trust_profile` | 19 | fixed |
| `certificate_of_patronage` | 20 | PWID `$20 / $40 / $100` |
| `the_collab` | 25 | PWID `$25 / $50 / $125` |

`COMMISSION_RUNGS = [25, 50, 100, 250]`
(`src/store/commission-desk.ts:24`). Every rung is over `$1`. Live
`/api/commission/pay/25` returned `25000000`.

### The silent amputation: `graffiti_on_a_train`

PWID. Live 402 carried nine accepts: `$1 / $2 / $5` on each of
three rails. `applySpendControls` "keeps any accept that fits so a
mixed offer can still pay the affordable option"
(`client/index.js:597`). A default client drops `$2` and `$5`,
then the selector takes `accepts[0]` remaining — Base `$1`. The
buyer succeeds. The tip tiers never happened. That does not look
like an error on either side.

This is the next miss-shaped finding: not a failed purchase, a
quietly truncated offer.

---

## Ranked defaults

Ranked by how much of our traffic or catalogue the default
touches. "This store" is whether *we* override it, not whether a
buyer can.

| # | Constant | Value | File:line | When it binds | This store |
|---|---|---|---|---|---|
| 1 | `DEFAULT_MAX_AMOUNT_PER_PAYMENT` | `"$1"` | `@x402/core/dist/cjs/client/index.js:174` | `applySpendControls` on every default-asset accept. Empty `{}` still applies it. | Cannot override. Buyer must raise the cap or set `spendControls: false`. |
| 2 | `maxTimeoutSeconds` fallback | `300` | `@x402/core/dist/cjs/server/index.js:1341` (`resourceConfig.maxTimeoutSeconds \|\| 300`) | Written onto every accept. `railAccepts()` (`src/lib/payments.ts:295–325`) never sets the field. Live 402s on five doors all returned 300. | Not overridden. Five-minute signing window on every paid door. |
| 3 | `paymentRequirementsSelector` | `accepts[0]` | `@x402/core/dist/cjs/client/index.js:191` | After spend-control filtering, default client signs the first remaining accept. | Store puts Base first on purpose (`payments.ts:296–301`, comment: blindly-signing clients stay on Base). |
| 4 | `DEFAULT_TIMEOUT_MS` | `30000` | `@x402/core/dist/cjs/http/index.js:303` | `HTTPFacilitatorClient` constructor line 427. `AbortSignal.timeout` on every verify / settle / supported. `createFacilitatorConfig` does not pass `timeoutMs`. | Not overridden. In force on every paid verify/settle. |
| 5 | `GET_SUPPORTED_RETRIES` | `3`, 429 only | `@x402/core/dist/cjs/http/index.js:305–307` | `initialize()` `getSupported`. Delay `1000ms * 2^attempt`, cap `30000ms`. Non-429 fails immediately. | Not overridden. Fires on first paid request per isolate (`payment-gate.ts:633` awaits `stack.initialized`). |
| 6 | Prefer authorization | drop upfront/escrow if any authorization remain | `@x402/core/dist/cjs/client/index.js:587–592` | After spend controls. | No incremental effect. `ExactEvmScheme.paymentFlows` default is `authorization` (`@x402/evm` exact/server/index.js:334–336). |
| 7 | Default-asset allowlist | USDC (and listed stables) only | `@x402/evm/dist/cjs/exact/client/index.js:558+`; `@x402/svm` exact/client/index.js:77+ | Spend controls reject non-default assets unless `allowedAssets` is set. Base / Polygon / Solana USDC are in `DEFAULT_ASSETS`. | Does not filter today's catalogue. Would silently drop a non-USDC rail. |
| 8 | `validAfter` | `"0"` | `@x402/evm/dist/cjs/exact/client/index.js:179` | EIP-3009 authorization is live the moment it is signed. | Store payload template copies it (`payment-gate.ts:295`). |
| 9 | `DEFAULT_COMPUTE_UNIT_LIMIT` / `PRICE` | `20000` CU / `1` microlamport | `@x402/svm/dist/cjs/exact/client/index.js:41–42` | Solana exact client stamps these when the buyer does not set them. | Store does not set buyer compute budget. In force for default `@x402/svm` clients on our Solana rail. |
| 10 | CDP JWT `expiresIn` | `120` seconds | `@coinbase/cdp-sdk/src/auth/utils/jwt.ts:135` | `generateJwt`. `@coinbase/x402` `createAuthHeader` does not pass `expiresIn`. | Not overridden. Dominated by the 30s facilitator timeout — a fresh JWT is minted per verify/settle. |
| 11 | `ResourceInfo` schema caps | serviceName 32 / tags 5×32 / iconUrl 2048 | `@x402/core/dist/cjs/server/index.js:510–516` | Zod on every 402 resource block. | Store sits at the tag cap: `STORE_TAGS` has exactly 5 (`src/store/metadata.ts:103–109`). `serviceName` is the short form because the real name is 37 chars (`payments.ts:273–277`). |
| 12 | `PAYMENT_REQUIRED_CACHE_CONTROL` | `no-store` | `@x402/core/dist/cjs/http/index.js:657` | 402 responses. | Store also sets `Cache-Control: no-store` on local preflight refusals (`payment-gate.ts:607`). |
| 13 | `wrapFetchWithPayment` retry | one paid replay; second only if a hook returns `recovered` | `@x402/fetch/dist/cjs/index.js:72–115` | Default fetch wrapper pays once. No walk of remaining accepts on failure. | Buyer machine. |
| 14 | `DEFAULT_FACILITATOR_URL` | `https://x402.org/facilitator` | `@x402/core/dist/cjs/http/index.js:302` | `HTTPFacilitatorClient` if `config.url` is omitted. | **Overridden.** `createFacilitatorConfig` sets `https://api.cdp.coinbase.com/platform/v2/x402` (`@coinbase/x402/dist/cjs/index.js:31–32, 99–103`). In force: CDP. |
| 15 | `syncFacilitatorOnStart` | `true` | `@x402/hono/dist/cjs/index.js:155, 340` | `paymentMiddleware` awaits `initialize()` on the first paid request. | **Not in force.** Store does not mount `paymentMiddleware`. `payment-gate.ts:633` awaits `stack.initialized` itself — same shape, our code. |
| 16 | `FALLBACK_PAYWALL_HTML` | generic x402 HTML | `@x402/core/dist/cjs/http/index.js:682` | Browser `Accept: text/html` on a paid route with no `customPaywallHtml`. | Overridden on menu buy routes (`browserPaywallHtml`). Not set on commission rungs or penny-page configs. |
| 17 | Offer validity | `300` | `src/lib/offer-receipt.ts:50`; library `@x402/extensions/dist/cjs/offer-receipt/index.js:474` | Signed offer `validUntil = now + 300`. Live payloads confirmed. | Store sets the spec default explicitly and does not import the library builder. Same value, our file. |
| 18 | `DEFAULT_MAX_FEE_PER_GAS` | 1 gwei / 0.1 gwei tip | `@x402/evm/dist/cjs/exact/client/index.js:138–139` | Client-submitted EVM txs (permit2 / upto) when the wallet does not provide fees. | Does not bind on our catalogue — we offer exact/eip3009, facilitator submits. |
| 19 | `DEFAULT_CONFIRMATION_TIMEOUT_MS` | `180000` | `@x402/evm/dist/cjs/index.js:1422` | Client wait for on-chain confirmation in schemes that wait locally. | Not on our exact/eip3009 path. |
| 20 | `CDP_SERVER_DEFAULT_NETWORKS` | Base + Solana only | `@coinbase/cdp-sdk/src/x402/server.ts:107–119` | CDP x402 server helper if networks omitted. Polygon is absent. | Unused. We register Base always, Polygon/Solana when pay-to secrets exist. |

---

## Client-only defaults

These bind on the buyer's machine. This store cannot log them
firing. Failure looks like abandonment, or like a cheap-tier
success.

- **`$1` USD ceiling** on every default asset, unless they set
  `spendControls: false` or raise `maxAmountPerPayment`.
- **Default-asset allowlist.** Only tokens in `DEFAULT_ASSETS`. A
  non-USDC rail added later would vanish the same way.
- **`accepts[0]` after filtering.** Base, then whatever survived
  the cap.
- **Prefer authorization** over upfront/escrow when both remain.
- **`validAfter: "0"`** on EIP-3009 auths.
- **Solana compute budget** `20000` / `1` microlamport.
- **`wrapFetchWithPayment` pays once.** A second try only if a
  hook returns `{ recovered: true }`. No walk of the remaining
  accepts.
- **EVM fee defaults** 1 gwei / 0.1 gwei — only if they submit
  locally (permit2/upto). We offer exact/eip3009, so this does not
  bind on our catalogue.
- **CDP x402 client** `DEFAULT_ACCOUNT_NAME = "x402-client-wallet-1"`
  (`@coinbase/cdp-sdk/src/x402/client.ts:155`) if they use that
  helper without naming a wallet.

Hand-rollers and anyone who passed `spendControls: false` skip the
cap. Default `@x402/fetch` does not.

---

## Library behaviour vs store behaviour

Four of five latency reports described `@x402/hono` lazy init and
concluded the cold tax was off the challenge path. The library and
the store are not the same process.

| Question | Library | This store (in force) |
|---|---|---|
| Who awaits facilitator `initialize()` before the 402? | `paymentMiddleware`, `syncFacilitatorOnStart=true` (`@x402/hono/dist/cjs/index.js:155–214`). We do not mount it. | `payment-gate.ts:633` `await stack.initialized`, set in `payments.ts:761` as `httpServer.initialize()`. Cold tax is on our challenge path. |
| Facilitator URL | `https://x402.org/facilitator` if url omitted | CDP `https://api.cdp.coinbase.com/platform/v2/x402` via `createFacilitatorConfig` |
| Offer builder | `@x402/extensions` `createOfferPayload` defaults `offerValiditySeconds` to 300 | `src/lib/offer-receipt.ts:50` `OFFER_VALIDITY_SECONDS = 300`, our JWS, fail-open. We do not call the library builder. |
| SIWX max age | `DEFAULT_MAX_AGE_MS = 5 minutes` (`@x402/extensions` sign-in-with-x/index.js:258) | Not imported. Claims door has its own SIWX (`src/routes/claims.ts`). |
| `upto` / batch-settlement / smart-wallet caps | Many: 3600s channel life, 20k–90k CU, 180s confirm, Redis lock 10ms | Not registered. `ExactEvmScheme` + `ExactSvmScheme` only. |
| CDP server helper networks | Base + Solana. No Polygon. `maxTimeoutSeconds ?? 300`. | Unused. We register Base always, Polygon/Solana when pay-to secrets exist. |
| Hono `timeout` / `bodyLimit` | Opt-in middleware, no implicit duration or size | Not mounted. Platform (Workers) would bind, not the package. |
| viem HTTP timeout / `retryCount` | `10000ms` (`viem/_esm/utils/rpc/http.js:12`), `retryCount 3` (`createTransport.js:6`) | No `createPublicClient` in `src/`. `recoverMessageAddress` only. Does not bind. |

---

## Looked for, not in this install

An empty list here would mean the search did not happen.

| Claim sometimes made | What was opened | Result |
|---|---|---|
| CDP 500-character description cap | `@x402/core` and `@coinbase/x402` for `500` / description max | No constant. `src/lib/payments.ts:253–258` comments it as discovered the hard way. Not a package default this reading can cite. |
| Facilitator-side rate limits / spend caps | `@coinbase/x402`, `@coinbase/cdp-sdk` x402 server | Client JWT and URL only. Server policy is not in this install. |
| Cloudflare Workers CPU / subrequest / wall-clock | `package.json` runtime dependencies | Not a `node_modules` default. `wrangler` is a devDependency. |
| `@noble/ed25519` behavioural caps | `node_modules/@noble/ed25519/index.js` | No `DEFAULT_` / timeout / limit constants. |
| Whether default clients in the wild pass `spendControls: false` | Our code and live 402s | Unobservable from this isolate. The cap is the default. That is the point. |

---

## How the `$1` cap binds, end to end

1. Buyer uses `@x402/fetch` `wrapFetchWithPaymentFromConfig` without
   `spendControls`.
2. `x402Client.fromConfig` leaves `spendControls` as `{}`.
3. First response is our 402. Store records a challenge
   (`payment-gate.ts:654`).
4. Client `createPaymentPayload` → `selectPaymentRequirements` →
   `applySpendControls`.
5. If every accept is over `$1`, the client throws. No second
   request. Store sees challenge, no settlement.
6. If some accepts fit (graffiti `$1` among `$2` / `$5`), the
   client pays the first remaining accept and the rest of the
   offer is gone.

The store cannot distinguish (5) from a buyer who read the 402
and walked away. That is why it looks like abandonment, and why
a report that probed `/api/buy/hello` at `$0.50` concluded the
cap never trips.

---

## Provenance

Gap-finding prompt 1, 2026-08-25, against the tree that day and
`@x402/*@2.23.0` as installed. Prompts 2 and 3 (client aborts
before a second request; what each published number actually
counts) are in
`docs/CLIENT_ABORTS_AND_PUBLISHED_COUNTS_2026-08.md`.
Prompt 4 (library wiring vs this till) is in
`docs/LIBRARY_VS_STORE_2026-08.md`.
Prompt 5 (every item against every purchase gate, including
the 16 KiB header) is in
`docs/CATALOGUE_CONSTRAINTS_2026-08.md`.

Nothing here is a keeper ruling. The shelf prices are the shelf
that day; the constants are the install that day. Re-read both
before acting.