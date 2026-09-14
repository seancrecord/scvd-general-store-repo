# Forge OpenAPI intake — September 14, 2026

Triggered by the keeper's pasted Forge results, identified as Joey
(@Joeyy_0x), using OpenAPI discovery. No correspondence sent. The public
Forge landing page does not document its request-generation or verification
algorithm; the paste is the evidence for its displayed results.

## Reproduction

The paste reports 36 paid operations and 25 verified. It contains ten
HTTP 400 rows and one HTTP 403 row, and **no HTTP 410 row**. The last
window_pick entry has no visible status in the pasted text. The live
OpenAPI document also declares 36 paid operations at this reading.

All eleven reported non-402 routes returned **402** to our bare unsigned
GETs: a2a_repair_kit, attestation_bundle, bitcoin_anchor,
operator_statement, provenance_check, settlement_attestation,
settlement_reconciliation, spot_check, the_case_file, the_statement,
and trust_profile. Each response's PAYMENT-REQUIRED header decoded to
five payment alternatives. Pack was one additional bare control, also
402. This observes quotes only, not successful payment or delivery.

Three controlled requests reproduce the *kinds* of refusals Forge shows:

- `GET /api/buy/settlement_attestation?tx_hash=string` → 400,
  `bad_request`, invalid transaction identifier.
- `GET /api/buy/bitcoin_anchor?digest=string` → 400,
  `bad_request`, invalid SHA-256 digest.
- `GET /api/buy/trust_profile?url=https%3A%2F%2Fexample.com` → 403,
  `passport_refused`, no census evidence for that host.

No payment headers were sent. These comparisons support a generated-input
hypothesis; they do **not** establish what Forge sent. Needed from Forge:
exact URL and method, non-secret headers, response body, and timestamp
for one 400 and the 403. A bare quote, an invalid-input refusal, an
ineligible target and a completed paid purchase are different observations.

Retained reproduction details: [JSON](FORGE_DISCOVERY_2026-09-14.json).
The JSON records the source paste's digest, our requests, response dates,
status, reason, and decoded offer amounts/networks. It is a reduced
capture, not a byte-for-byte HTTP transcript or signed observation.

## Tiering and schemas

The four multi-tier menu items in the live contract are luckies,
graffiti_on_a_train, certificate_of_patronage and the_collab. All four
are marked Verified x402 in the paste. Tiering therefore does not explain
this set of eleven refusals; this does not test Forge's tier selection
or paid execution. The offers are alternatives, not an instruction to
pay each listed amount/network.

Forge displays `#/components/schemas/DeliveryEnvelope` as the output
schema. That reference resolves in our OpenAPI document. The display
alone cannot establish whether Forge resolves it internally. Our generic
envelope deliberately leaves `deliverable` untyped, which is a separate
buyer-readability limitation even for a reader that resolves references.

## Store repair and follow-through

Confirmed defect: `/api/buy/trust_profile` did not declare its real 403
eligibility refusal in OpenAPI. The local repair adds that response using
the existing Problem schema. It changes no eligibility or payment rules.
The existing trust-profile refusal test now reads the contract and requires
the status it actually observed to be declared with the Problem schema.
It failed before the repair because that response was absent.

Validation: the trust-profile, OpenAPI discovery and OpenAPI size suites
passed (15 tests); `npm run typecheck` passed after correcting optional
access in the regression test. No full-suite or deployment claim is made.

Candidate readability work belongs with ROADMAP M1: a clear quote-only
request beside the purchase contract, schema-valid examples derived from
the input definitions, and useful per-item deliverable shapes. Examples
must not pretend a made-up transaction or endpoint was observed or is
eligible. Confirm Forge's request first so the repair addresses a real
reader rather than an assumed one. Do not weaken input or eligibility
checks to turn every request into a 402.

No commit, deployment, purchase, or vendor message is part of this read.
There is no 410 case to diagnose until its actual URL is supplied.
Specification reads and their limitations are in `docs/SPEC_READS.md`,
under the September 14 Forge entry.

## Expanded Coinbase and index reading

The keeper's second paste labels ten routes explicitly NOT INDEXED:
the Almanac page, a2a_repair_kit, aura_walk, launch_check, opening_day,
operator_statement, provenance_check, signature_agent_card, the_mandate,
and trust_profile. The last window_pick row is truncated, so its
individual Forge verdict is unknown despite the 25/36 heading.

Only four explicitly absent rows overlap the eleven failed challenge
checks: a2a_repair_kit, operator_statement, provenance_check and
trust_profile. Seven routes with failed Forge challenge checks are
already marked indexed in that same paste. The two 25/36 totals describe
different sets; a listing miss is not an HTTP route failure.

A full unsigned live sweep found **36/36 HTTP 402 responses**, all with
PAYMENT-REQUIRED payloads accepted by the installed SDK's v2 schema.
This checks shape, not cryptographic payment validity or paid delivery.
All 35 menu declarations also passed the SDK's discovery validator and
Coinbase's free public validator. The latter returned **27 active index
rows**, not Forge's 25. In particular:

- `https://scvd.store/api/buy/the_mandate`: Coinbase `index.active=true`,
  `lastCrawledAt=2026-08-26T20:13:34.742Z`; Forge says not indexed.
- `https://scvd.store/api/buy/signature_agent_card`: Coinbase
  `index.active=true`, `lastCrawledAt=2026-08-19T20:39:30.779Z`;
  Forge says not indexed.

These are concrete discrepancies for Forge's source, freshness,
pagination and URL-matching investigation, not proof of which mechanism
failed. The validator describes `index` separately from its simulated
eligibility verdict and does not create an index entry. Eight menu
routes returned `index=null`: window_pick, a2a_repair_kit, launch_check,
opening_day, provenance_check, trust_profile, operator_statement and
aura_walk. Current metadata validity does not explain their missing
historical registration; reconcile retained facilitator responses before
proposing a purchase. There was no index mutation during this read.

## Two confirmed publication defects

The extra paid operation is the Almanac page. Coinbase accepted its
402/header/payment fields but **rejected its discovery declaration**:
the example was a string, while the SDK's default output example schema
expected an object. Its `index` was null. The shared Almanac/Gazette
declaration now explicitly gives the example a string schema.

Separately, live publication quotes offer $0.01, $0.02 and $0.05 on each
enabled rail, but OpenAPI advertised only $0.01. Its path builder now
uses the same `pennyPageTiersUsdc()` helper as the till. The floor and
actual checkout behavior do not change. This omission is a real
readability defect, but the CDP rejection specifically names the schema,
not the omitted OpenAPI tiers. All 35 menu offer sets matched their
OpenAPI terms after normalizing EVM address casing.

Adding all tiers initially exceeded the existing local OpenAPI size budget.
Repeated challenge-header definitions now use standard shared Header Object
references; names, descriptions and schemas are retained. The reference
resolution and scanner-budget checks cover this serialization change.

The free validator previously enumerated only `/menu.json`, hiding the
publication entirely. It now adds concrete paid GET operations from
OpenAPI, deduplicates URLs, and refuses incomplete or unsafe coverage.
Its new coverage tests run in the existing `bazaar:validate:test` CI step.

Both publication regressions were witnessed failing before repair:
`/output/example: must be object`, and missing optional amounts in the
served OpenAPI-vs-402 comparison. The validator coverage test also failed
with the menu-only implementation. Local verification is recorded below;
the repaired publication has not been deployed or revalidated by CDP.

Retained [expanded evidence](FORGE_INDEX_VALIDATION_2026-09-14.json)
includes reduced live schema readings, per-route CDP preflight and index
results, the actual rejected publication declaration, and Circle queries.
Menu validation completed at 20:42:25 UTC and the bare sweep at 20:43:40
UTC on September 14. These are dated observations, not ongoing health.

## Circle, PayAI and Indexter

[Circle's listing guide](https://developers.circle.com/agent-stack/agent-marketplace/get-listed)
requires manual review, a payable service, a published OpenAPI contract,
and a confirmed payout wallet supplied with the application. Our public
Discovery API query for scvd.store returned zero rows; a control query
returned a known service. This supports the reported lack of a listing,
but cannot disclose an application decision or reason. The keeper-list
entry confusing the Circle partner directory with Agent Marketplace
acceptance is corrected. The existing trust signal already distinguishes
the directory accurately. No special template is established as missing.

[PayAI catalogs automatically](https://docs.payai.network/x402/facilitators/bazaar)
when its own facilitator receives an echoed discovery declaration during
verify/settle. Its verify-based cataloging can occur without settlement;
there is no form or standalone re-index endpoint. Our CDP checkout does
not establish that PayAI has received such an envelope. No signed
verification or facilitator change was attempted.

[Indexter](https://indexter.cash/for-providers) provides a submission and
claim flow for providers. Its add-server page requires an account. No
submission was performed. These distinct intake mechanisms should not be
collapsed into one generic "route not found" health verdict.

## Final local validation

After the repairs, 26 tests across bazaar-example-satisfies-schema,
penny-pages, openapi-discovery, openapi-fetchable and trust-profile passed.
The served OpenAPI size budget and internal-reference checks pass.
All eight `bazaar:validate:test` cases passed, including publication
coverage and failure-versus-rejection handling. `npm run typecheck` and
both Workers' `npm run build:check` dry runs passed. The initial wider
red run was interrupted and replaced by the focused red run recorded
above; no passing result was inferred from an unfinished run.

No full-suite, deployment, live acceptance of the repaired publication,
or index-refresh claim is made. Nothing was committed, paid or sent.

## Release follow-through — September 14

The keeper authorized a PR and merge after the initial read. The isolated
release branch starts from current main and retains its already-shipped
shared-header implementation; it does not replace that implementation
with the older checkout's version. Prior no-commit/deploy statements above
describe the initial investigation. No vendor message or payment is
authorized by this release request.

Pre-merge outside reading: x402-list reports 32 endpoints and its latest
service check at 2026-09-14T21:56:10.582Z reports online/payment-ready.
Its public assessment reports 14/14 handshake checks; these are
observations of its covered routes, not paid-delivery proof or coverage
of all 36 OpenAPI operations. Source: [x402-list service record](https://x402-list.com/services/sean-claude-van-damme-s-general-store).
The store's own public preflight refused both self-host probes with
`own_host_refused`, by design; this is an unavailable self-check, not a
passing result. Direct external reads and the CDP validator provide the
unsigned challenge/discovery evidence retained above.

Release validation: all three new behavior regressions fail against
current main for their expected reasons. Locked dependencies installed
cleanly; typechecking, eight validator tests, both Worker dry-run builds
and documentation checks pass. Two full local `npm test` attempts (the
second with two workers) stalled with failures in pre-existing recovery
suites and were interrupted. Neither is recorded as a completed passing
full suite. The PR's complete CI run is the remaining merge gate; no test
or timeout limit was weakened to obtain a pass.

All 26 focused Workers tests pass on the isolated release branch.
