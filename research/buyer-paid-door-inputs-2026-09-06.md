# Buyer paid-door input audit — 2026-09-06

**Result: the required-input acceptance matrix fails. Four items can settle a purchase whose required content becomes empty.** The failure reproduces through HTTP and MCP on Base, Polygon and Solana in the local Worker environment. No real funds moved.

Tested revision: `325a2fe2d3856f7fe9e0d4515c4634d3a04739aa` (latest fetched `main`). The final run was isolated because the shared checkout changed while this task was paused. Production source was not changed, committed or deployed.

## Findings

### SEV-1 under the requested invariant: content disappears before delivery

A required field containing only U+0000 passes the nonempty check. The argument mapper then removes the character. Settlement proceeds and the stored content is empty:

- `context_anchor`: `summary` becomes an empty signed anchor summary.
- `the_confession`: `confession` becomes an empty stored confession.
- `coffees_for_closers`: `win` becomes empty; the purchase response explicitly describes the empty quoted win.
- `graffiti_on_a_train`: `tag` becomes empty; the response says `Sprayed: ""`.

There are **24 reproductions**: four items × two transports × three payment rails. Each makes one successful mock settlement and writes business records. The evidence JSON contains the submitted value, response and stored records for each.

Example request shapes: HTTP `GET /api/buy/context_anchor?summary=%00`; MCP with `{"item_id":"context_anchor","summary":"\u0000"}`. The test discovers the actual MCP shelf names rather than hard-coding these examples. Payment envelopes in the test are local fixtures, not usable real signatures.

Cause: `src/lib/purchase-args.ts` checks raw text with `trim()` for these items, but strips NUL characters later in `purchaseInputFrom`. The mandate already removes NULs before checking emptiness and rejects the same case. This reproduces the #481 defect family at the public request boundary: validation and delivery disagree about the input used to construct the good.

Repair direction: reject required text that becomes empty under the delivery transformation before offering usable terms or accepting payment. Preserve the stated verbatim-content contract explicitly rather than silently changing buyer text.

### Payment terms precede input validation

**154 unsigned HTTP cases** receive usable payment requirements despite invalid inputs. HTTP deliberately skips argument checks without a payment header (`src/routes/door-checks.ts`); MCP generally validates first. This violates the supplied test plan even where it matches the existing indexer/probe policy.

On the signed requests, omission, empty string, whitespace and the two-invalid-field combinations all reject before verification/settlement: **600 cases**, with `charged:false`, a machine code and matching HTTP/MCP defect descriptions. No observed business-store writes occur on these refusals. An unusable quote is therefore distinguished from a demonstrated paid empty good.

Repair direction: reconcile indexer price discovery with the new buyer acceptance contract. Do not call the existing probe behavior a money-loss finding by itself.

### MCP accepts wrong primitive types

Numbers and booleans in required string fields are coerced to strings and bought successfully for `context_anchor`, `the_confession`, `coffees_for_closers`, `graffiti_on_a_train` and `the_mandate`: **30 signed cases** across the three rails. The published schema says string; `toolArgs` accepts numbers and booleans.

These are input-contract violations. The audit does not equate every coercion with a commercially useless good. Repair direction: validate the incoming primitive type before coercion.

### Overlong declared content is silently shortened

The independently invalid companion field for the two-field cases is `purpose`, whose published `maxLength` is 280. Sent alone with otherwise valid inputs, an overlong purpose is accepted, shortened and settled for all **25 required-input items**, across both transports and three rails: **150 signed cases**. Its schema promises verbatim signed content. `sanitizeText(..., 280)` implements truncation instead of rejection.

Repair direction: reject content outside the published limit, or deliberately change the contract. These are recorded separately from missing essential goods.

## Coverage and verification

The executable audit discovers schemas from `/menu.json` and `tools/list`, resolves the MCP per-item `if`/`then` required branches, checks their agreement, and drives the actual HTTP/MCP application routes. It never calls the shared input validator or mapper as its oracle.

- **32 menu items enumerated; 25 have required item inputs.** The other seven have quote controls and are explicitly marked not applicable to omission testing, not claimed as complete purchase coverage.
- **1,598 observations:** 383 unsigned invalid requests; 1,149 signed invalid requests; 35 valid MCP quote controls; 18 subject-delivery controls; six rail/transport settlement controls; seven not-applicable records.
- Signed invalid requests: **945 refused before payment**, **24 settled with empty required content**, **180 settled despite type/length contract violations**.
- **36 tests: 25 failed acceptance groups, 11 passed.** The acceptance failures repeated on the fixed revision; these are not timing failures.
- The #481 controls buy `good_buyer`, `launch_check` and `attestation_bundle`, inspect the signed URL or hash list actually delivered, and verify the certificate. All 18 rail/transport combinations pass. Deliberately dropping the fulfillment URL/hash list makes all three control tests fail; the source was then restored byte-for-byte and the controls passed again.
- The existing nearby guards pass: **19 tests across four files** (`mcp-carries-the-buyers-arguments`, `mcp-door-quotes-the-same-terms`, `deliver-first`, `nothing-charged-is-machine-readable`).
- `npm run typecheck` passes. No full-suite or deployment claim is made; no production implementation changed.

## Run it

From the repository root:

```sh
npm test -- test/buyer-paid-door-input-matrix.spec.ts --reporter=default --reporter=./scripts/buyer-input-reporter.mjs
```

The command intentionally exits nonzero while these acceptance defects remain. The reporter writes all rows to `/private/tmp/scvd-buyer-input-results.json`; set `BUYER_INPUT_REPORT` to select another output path. The revision-stamped retained run is `research/buyer-paid-door-inputs-2026-09-06.json`.

## Limits

This completes Part I.1's menu-input matrix, not every suite suggested by the overall P0 invariant. Real signatures, on-chain finality, timeouts, duplicate recovery, live production bindings, browser wallets, the thin edge Worker's service-binding hop, trade-account/Lightning purchases, and non-menu paid pages were not tested here. In particular, no RECOVERABLE timeout classification was established.

Semantic probes cover a public-URL refusal, malformed subjects, duplicate transaction hashes and disappearing text. A well-shaped digest or a nonexistent transaction is not automatically semantically invalid: signing an unknown transaction observation is a legitimate product. The suite does not pretend to infer arbitrary semantic invalidity from JSON Schema alone. Wrong-type cases are MCP-only because HTTP query parameters are strings.

Storage instrumentation observes all mutations in ORDERS, PATRONS and GUESTBOOK plus patron allocation, including transient writes. Ordinary COUNTERS telemetry is allowed; arbitrary COUNTERS/R2/Durable Object mutations are outside this instrumentation. The clock is fixed and business state is reset between signed cases so a prior purchase cannot exhaust a later case's capacity.
