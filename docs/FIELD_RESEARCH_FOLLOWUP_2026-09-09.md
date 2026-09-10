# Field research follow-through — 2026-09-09

The keeper supplied CV's AM and PM best-board field reports, their
reconciled corrections, and authorized prioritization and implementation.
Feature order is in ROADMAP.md, F1–F4; this note records the evidence
and the completed local changes, not a separate queue.

## Evidence boundary

The supplied reports describe 38 distinct doors across 13 services and
47 attempts. AM: 23 doors, 32 attempts, 19 deliveries (18 settled, one
free), $0.050 moved. PM: 15 doors, 15 attempts, 14 settled deliveries,
$0.066 moved. Combined: 33 deliveries, 33 settlements, including one
settlement without delivery, $0.116 moved.

These are CV's reported, reconciled observations, not transactions
independently reproduced in this task. The cited raw ledger and
`out/base-transfers-recon.json` / `out/pm-base-transfers-recon.json`
were not supplied in this checkout. This task does not publish a vendor
verdict, infer organic demand, or treat board position as a fixed rank.

The useful implementation triggers are recovery instructions on a failed
lookup, explicit pagination and purchase scope, request traceability, and
reconciliation before summarizing a field run. Existing store machinery
is the starting point for each. The ranking comparison has five newly
walked services, not five total entrants: a previously walked service
also entered the comparison.

## First change: recovery from failed item lookups

Local source inspection found that input refusals already carry field-level
issues and that uncertain payments already have retained recovery records.
Catalog failures, however, lost their structured body over MCP. Unknown
item responses primarily pointed at the full menu.

`src/lib/catalog-recovery.ts` derives an additive repair from the current
menu and retirement register. `retry_same_request: false` says an unchanged
request cannot fix this refusal. `next_step` is a free GET plus an equivalent
`find_in_catalog` call on the unscoped MCP connection. A live successor or
known item leads to its compact contract; otherwise it leads to the catalog.
The next step contains no payment authorization, idempotency key or buyer
arguments. It reads a listing and does not choose or submit a replacement
purchase. Existing messages, HTTP statuses and RPC error envelopes remain.

Coverage: HTTP buy refusals, item pages, catalog lookups, MCP catalog
refusals, unknown item-scoped MCP connections, wrong/missing shelf ids,
and existing HTTP/MCP input repairs. Sold-out handling, uncertain-payment
recovery and post-settlement responses keep their existing contracts.

The code does not assert that a live listing is in stock. Availability
and fresh terms still belong to the purchase path.

## Initial F1 validation

`test/catalog-recovery.spec.ts` first failed all 11 initial cases against
the unchanged source. With the implementation, those tests follow the
returned HTTP and MCP recipes to actual responses, walk every retirement,
check both Workers, and assert unchanged facilitator verification and
settlement counts. This is a deterministic client walk, not a live
small-model trial or a paid field purchase.

A separate contract test was observed red before the schema additions.
The final targeted run passed 385 tests across 14 files: recovery, catalog,
buyer entrypoints, Worker parity, retirement, refusal fields, surface
contracts and size limits, deliver-first, settlement refusal/uncertainty,
and the collector’s inability to pay. TypeScript and both Worker dry-run
bundles passed. The documentation check completed with pre-existing
age notices. The full suite was not run; it remains required before any
commit. No commit, push, deployment or live purchase was performed.


## F2: scope and continuation before signing

Compact one-item contracts now include the existing product description,
reading scope, constraints and sample URL where present. Prices, tips,
terms and schemas still derive from their existing sources. Paged catalog
and publication responses state limit, offset, returned and has_more;
next links still use the same bounded page-number contract.

HTTP and both MCP quote formats now distinguish a successfully read depth (including zero)
from an unavailable depth. An unavailable read returns archive_depth: null
and archive_depth_status: unavailable. Other goods carry neither field.
This does not make a claim about corpus completeness: the underlying depth
reader and its ten-minute cache remain the evidence source. It preserves
the quote when that optional read fails; fulfillment still uses its own
pre-settlement checks. The separate corpus-coverage work is not included.

## F3: references that lead to retained records

Definitive JSON settlement refusals now carry the private status handle
already retained before settlement, over HTTP and both MCP profiles. A
failed fulfillment refresh on the free status endpoint keeps authenticated
payment facts and the same handle while marking delivery unavailable.
It returns no stale fulfillment body. Missing or incorrect credentials
still return the same 404 without a handle or purchase details.

No generic request-id system or new retention store was added. Existing
uncertain-payment recovery already supplied the needed reference. The
reference establishes that a purchase record exists; its contents establish
what is known about payment. Neither is proof of delivery by itself.

## F4: the report follows joined evidence

The walkabout retains its historical raw verdict names, but the report no
longer calls a 2xx response settlement. It counts distinct method/origin/path
doors, repeated-door attempts, successful response bodies, submission
unknowns, and client/transport failures separately. Query parameters remain
inputs. Old paid:false rows without submission evidence stay unknown.

Reconciliation version 2 includes the scan scope, saved transfer evidence,
and a fingerprint tying it to the parsed ledger. A confirmed association
needs transaction, network, asset, recipient and exact atomic amount.
Repeated receipts count a transfer once. Same-price matches without an
identity stay candidates, and unmatched transfers retain their full amount.
Atomic totals use integers and six-decimal USDC strings. The command checks
the node’s chain and that its head covers the requested end block before
calling a scan complete. Duplicate transfer
evidence, malformed JSON and a report joined to a changed ledger fail
explicitly. Version-1 files must be regenerated before their totals are used.

A free-delivery response requires an explicit seller claim plus no matching
transfer in a completed scan of the applicable rail and asset. An ambiguous
same-price transfer leaves it unknown. Absence is bounded by that scan;
it never asserts that an authorization cannot settle later. Response bodies
are reported delivery evidence, not semantic verification of useful goods.
The existing command scans Base USDC; it does not independently reproduce
CV’s Solana or September field transactions.

## Combined validation and handoff

The four isolated branches are assembled, without commits, in
`codex/field-followthrough-review`. Local review checkout:
`/private/tmp/scvd-field-followthrough-review`. The original working checkout
and other ongoing tasks were left untouched.

The combined run passed **620 Worker tests across 22 files**. The field-tool
suite passed **29 Node tests**, including controlled local HTTP fixtures.
TypeScript and both Worker dry-run bundles passed. New behavior was observed
red before the fixes; the header-case variants verify support that already
existed. The full repository suite was not run and remains required before
any commit. There was no push, deployment or field-wallet purchase.

Individual local branches: `codex/buyer-error-recovery`,
`codex/purchase-scope`, `codex/purchase-traceability`, and
`codex/field-reconciliation`. These remain uncommitted for review.

## Buyer guidance follow-through (same day, authorized)

The keeper approved applying the remaining ideas wherever the product can
support them. The active review checkout is now
`/private/tmp/scvd-buyer-guidance-20260909`, branch `codex/buyer-guidance`,
based on `bd21ea20`. It carries F1–F4 forward onto the newer source tree.
Earlier validation above describes the earlier checkout, not this one.

The shared `buyer_guidance` object now appears on compact item contracts,
catalog HTTP quotes, both MCP payment dialects, and fulfillment responses.
It names price effects, existing human attribution where recorded,
verification and correction routes, private purchase-status recovery, and
the existing credit program. Guidance is outside the signed certificate
and x402 payment requirements. Actions are described for the visitor to
choose; none are automatically submitted.

- Spot Check names its free host-history source and what payment adds: a
  signed, certificate-bound copy, with no fresh probe. Its freshness link
  uses the opt-in `?view=stable` view, which omits the volatile `asked_at`
  field. The ordinary view retains that field. Conditional GET reuses the
  existing ETag middleware; unchanged bytes do not establish that a host
  is unchanged. Observation dates and coverage gaps remain in both views.
- Price effects distinguish fixed prices, optional tips and commission
  rungs. A larger tip buys no extra scope, priority or human time. A
  commission's quote supplies its price and delivery window, rather than
  borrowing the collab menu price or standard SLA.
- The blessing and fortune identify existing keeper-written text. Queued
  human work identifies a commission; stocked goods identify existing
  stock. Other instant products do not invent an author or authoring date.
  Publications refer to their page's byline and publication date.
- Evidence guidance points to the existing specification, criteria,
  artifact verification, corrections record and free mailbox. Buyers are
  directed to the delivered artifact's own version and evidence fields
  where present. Signature validity is explicitly not proof of truth.
- Successful recorded catalog purchases now return their private status
  handle as well as the handles already returned on unknown/declined
  settlement. The token is outside the signed artifact and is not in
  public verification responses. A free status read does not submit
  payment; a settled record can still lack established delivery while
  recovery is pending.
- Existing credit terms are shared from a pure module, so discovery does
  not import the cash-out signer. Actual accrual remains confirmed only
  by `store_credit` in a fulfillment response. EVM buyers get a concrete
  free balance link. The current cash-out API supports EVM EOAs; this work
  adds no Solana redemption, discount, introductory free call or new
  pricing policy. Publication-only payments do not accrue credit.
- Missing publication pages give structured free index recovery. Paid
  markdown responses can now replay from the verified-payer idempotency
  cache with their original settlement header. The existing cache TTL is
  stated from code; storage can fail and the cache is not permanent
  purchase storage. Publications still have no private status handle or
  per-purchase certificate. Commissions reuse the existing quote/order
  pickup instead of promising catalog-style recovery.
- The field runner reserves atomic USDC and the domain slot before sending
  a paid request. A timeout, a 404 or a delivered-free response does not
  release that reservation during the run. Reservations bound exposure;
  only subsequent reconciliation establishes settlement. The run-end
  record now calls this `reserved_atomic`, not spend.

No money-moving policy, existing rate, price, payout, or signing key was
changed. No live purchase, deployment, push or commit was performed.

## Final verification for the buyer-guidance checkout

The complete repository sweep ran across 615 files: 9,570 tests passed,
six failed, and one existing test was skipped. It ran while the final
fixes were being made, so its results describe that earlier loaded code.
Every reported failure has been addressed:

1. Registered the newly documented host-history path under the existing
   scorers feature.
2. Supplied its concrete response schema, including the timeline, dates,
   coverage counts and gaps.
3. Corrected the evidence-help URL to the actual `/attestation` page;
   the guidance test now fetches its help links.
4. Corrected the older Solana credit message so it does not offer an
   unusable wallet lookup or imply supported cash-out.
5. Updated the privacy assertion to reject private traffic flags and the
   actual credential recursively, while permitting the public program
   statement that house wallets are excluded.
6. Trimmed repeated catalog wording to retain the MCP catalog's existing
   size ceiling with the new structured recovery error included. The
   ceiling was not raised.

On the final code, all **149 tests in the 15 affected integration suites
passed together**, including all six suites named by the complete run.
The **33 Node field-tool tests** passed. TypeScript, both Worker dry-run
bundles, and the whitespace check passed. The documentation check finished
with existing age notices; those notices are not proof of stale content.
The entire 615-file sweep was not repeated after these fixes.

Tests for new guidance, private successful-receipt handles, publication
replay, stable reads, credit pickup and eligibility messages, and budget
reservation were observed failing before their fixes. The stable-view
check covers both unchanged evidence (304) and newly recorded evidence
(200 with a different ETag). Recovery tests check unauthorized reads and
verify that private status tokens never appear in public verification.
All payment tests use local fixtures; they establish no new on-chain fact.

The full patch, including new files, is saved beside the checkout at
`/private/tmp/scvd-buyer-guidance-20260909.patch`. It is based on `bd21ea20`.
No commit, push or deployment was made.

## Release preparation — keeper authorized PR and merge

The release branch is `codex/buyer-guidance-release`, based directly on
main at `f44df7b1`. The earlier review base also contained the separate
ward-reporting repair; this release excludes that unrelated PR. The full
buyer-guidance patch applied cleanly. Earlier validation sections remain
a dated record of their respective checkouts, not the release verdict.

GitHub CI now runs `npm run walkabout:test` alongside the existing Worker
and offline-evidence suites, so reconciliation and pre-submission budget
checks remain part of future releases. No live field-wallet purchase is
needed for these fixture-based checks.

The clean release run passed **615 Worker test files, 9,570 tests, with one
existing skip**, in 941.52 seconds. Typechecking, **33 field-tool tests**,
both production Worker bundles, the scalability audit, claims register,
documentation check and whitespace check passed. The agent-runner, offline
evidence and package checks also passed. The audit retains two existing
warnings within its budget; all public claims in the register are bound.

Main advanced during the run to `35230014` with the separate watch-recovery
PR. GitHub's pull-request workflow will validate the combined merge tree.
This local result applies to the isolated release branch; it does not
claim a completed deployment or a live payment.

## Integration with the September 9 releases

While PR #600 was waiting on CI, main advanced through the ward repair,
certificate sweep, machine-reader surfaces, trade door card and bounty-board
releases to `c62c5779`. Integration preserved both completed roadmap rows
and the newer verification status. Only ROADMAP.md required manual conflict
resolution; source files merged without a textual conflict. The combined
tree passed validation before the integration commit.

The integrated full suite passed **621 files and 9,914 tests, with one
existing skip**, in 851.68 seconds. Typecheck, all 33 field-tool tests, both
production bundles, the audit and the claims register passed on this tree.
The earlier PR CI runs were cancelled because they tested the superseded
base; fresh PR checks will validate the integration commit.

## Recovery schema correction before merge

The shared error schema initially required an MCP recipe on every
`next_step`, while publication recovery supplies a free HTTP read. A
regression check fetched the published schema and real publication and
catalog refusals, and failed on the absent `mcp` field before the fix.
The schema now keeps `method`, `url` and `payment_required` mandatory and
describes MCP as an optional additional recipe. All existing uses of these
fields were checked.

The final local run passed **621 files, 9,915 tests, one existing skip** in
439.07 seconds. All 32 targeted contract tests, typecheck, both Worker
bundles, claims, audit and whitespace checks passed. Main subsequently
advanced to `08bff6a6`; a merge-tree check found no conflicts. PR CI will
validate the combined tree before merge.

## Latest-main contract size and final integration

An isolated check of GitHub's exact merge tree passed 423 of 424 targeted
tests. Its sole failure was the existing OpenAPI size guard: 700,055
serialized characters against the 700,000 limit after combining the new
main metadata with these changes. The three repeated watch-commission
definitions now reference one `WatchCommission` component. All fields and
paths remain declared; the budget is unchanged. Watch discovery checks
resolve internal component references before asserting the signed proof
fields, and the existing reference-integrity checks remain in place.

Main at `08bff6a6` is now integrated into the release branch. The complete
combined run passed **626 files, 10,269 tests, one existing skip** in
861.10 seconds. Typecheck, both Worker bundles, field-tool tests, reader
tests, the audit and claims checks passed. Main was still at that commit
when the result was recorded. PR CI will gate this final integration.
