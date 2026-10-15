# Payment path guidance — October 15, 2026

Implemented locally on `codex/payment-path-guidance`, based on `948e8c92`.
The keeper authorized implementation after reviewing Forge's report, then
authorized the PR and merge. Release preparation is recorded below.

## Finding

The [October 14 live check](../research/forge-payment-readiness-2026-10-14/README.md)
received structurally valid x402 v2 challenges from all 39 concrete GET routes
in the supplied report. Both named 400s reproduced when placeholder purchase
inputs were supplied: A2A setup was incomplete and Change Check had no retained
baseline. Forge's actual requests were unavailable; the explanation of its
scan remains an inference. Its unverified routes are not proven failures.

## Changes

- HTTP quotes put `next_step` before the detailed challenge. Complete inputs
  lead directly to reviewing payment and retrying the identical request.
  Missing inputs include the needed field definitions and a template with
  supplied declared inputs preserved. No mandatory catalogue read is added.
- Input refusals identify the repair. A2A admission refusals link directly to
  its free setup contract. An unavailable admission budget says to retry later,
  without claiming a target defect. Change Check links to the host's free
  history and includes the purchase retry template; a retained same-host Spot
  Check remains required. A new baseline is a separate purchase requiring the
  buyer's decision and cannot reconstruct the past.
- Both MCP payment formats use the same decisions and preserve good arguments
  for an unsigned retry. Payment metadata and unknown inputs are not copied
  into repair recipes. A rejected signed request prioritizes recovery of any
  earlier attempt before another authorization.
- OpenAPI and catalogue contracts expose bare `probe_url` links. OpenAPI names
  placeholder examples as unsuitable for reachability checks. The hosted and
  installable buyer guides explain the shorter path; the generated ClawHub
  copy is synchronized locally.

Existing validation, admission, amounts, networks, signing, settlement and
recovery mechanisms remain in charge. A bare missing-input probe still gets
402; supplied invalid inputs still refuse before payment. The new response
guidance is derived from the existing input schema and refusal classification.

## Request count and performance

A buyer with complete valid inputs can request a quote, review/sign it and
retry that same request: two store requests, with no required documentation
detour. A missing-input probe needs an additional unsigned request after the
fields are filled. Setup and retained-baseline prerequisites can require more
work; the guidance names that work rather than concealing it behind a quote.
Wallet/facilitator interactions are outside this store-request count.

The helper adds no network or storage calls. A bounded local Worker comparison
used mocked external services, one discarded warmup and seven measured requests
per path. It measured handler plus body read, excluding deferred bookkeeping.

| Request | Before median | After median | Added uncompressed body |
|---|---:|---:|---:|
| Small Blessing | 3 ms | 3 ms | 564 bytes |
| Bare Spot Check | 3 ms | 4 ms | 982 bytes |
| Spot Check with host | 3 ms | 3 ms | 642 bytes |

These small local samples do not establish production latency or a speedup.
Existing detailed challenge content remains for compatibility. Discovery budget
checks passed. [Raw measurements and harness](../research/payment-path-guidance-2026-10-15/measurements.json)
are retained; the harness is a research fixture, not a wall-clock test gate.

## Validation and limits

All 18 new regressions failed with the source patch removed and passed with it
restored. They exercise every menu item on both HTTP Workers, both MCP payment
formats, a publication route, exact URL preservation, input repair, prerequisites,
and signed-request recovery guidance. The red run retained the new tests and
temporarily reversed only the source patch; a `finally` block restored it.

Two focused batches passed: 524 tests for validation, HTTP/MCP parity, aliases,
catalogue recovery and skill parity; 131 tests for the final regressions, MPP,
modern MCP, cross-surface admission, payment flow and discovery budgets. These
batches overlap and are not a distinct-test total. Typecheck and the production
bundle checks passed. Skill bundle checks passed (4 tests); the documentation
check completed and reported existing freshness advisories. [Retained summaries](../research/payment-path-guidance-2026-10-15/README.md).

No funded purchase, live settlement, new Forge scan, skill publication or
deployment was performed. Before merge, the full CI suite is required. House
rule 62.4 also requires the store's preflight against its own doors and current
outside-witness checks (x402-list per-check history and Bazaar coverage), with
their visible route counts recorded in the PR. The pre-merge discovery readings are recorded below; CI must still pass on the
final PR head before merge.


## Pre-merge release reading — October 15

Merged `c12f09a8` from main into the branch; the roadmap conflict preserves both
entries. Typecheck, the production bundles and 68 focused post-merge tests pass.

- The store's own `runChecks` and v3 `checksForBattery` were bundled locally and
  applied to fresh unpaid responses from all 39 concrete OpenAPI GET routes:
  39 returned 402 and passed every executed structural/consistency check. The
  hosted preflight correctly refused its own hostname because Workers cannot
  self-fetch; this local run uses its actual check implementation. No Solana
  balance read, cryptographic offer verification or funded purchase was done.
- x402-list lists 35 endpoints. Its latest ten per-check rows, ending
  2026-10-15 17:17:16 UTC, each report 402, `is_up: true`, and 35 endpoints found.
  This is partial coverage of our 39-route comparison. Data: x402-list.com,
  CC BY 4.0. [Record and per-check history](../research/payment-path-guidance-2026-10-15/release-x402-list.json).
- The public Bazaar resources first page returns four SCVD routes among 1,000
  rows out of a reported 38,404. That page is not a full-index absence test.
  [Page projection](../research/payment-path-guidance-2026-10-15/release-bazaar-page.json).
- Coinbase's free validator reports active index entries for 36 of the 39
  routes; A2A Repair Kit, Aura Walk and the Almanac route have null index data,
  not a proven absence. Separately, 35 simulations are accepted. Four existing
  live routes (Luckies, Graffiti on a Train, Certificate of Patronage and The
  Collab) are rejected for missing top-level Bazaar metadata despite their
  active index entries and valid 402s. This is an observed discovery discrepancy
  before this PR is deployed, not proof of a payment failure or a repair claimed
  by this PR. [Validation/index evidence](../research/payment-path-guidance-2026-10-15/release-bazaar-validation.json).

The existing bulk validator refused the current unbounded `/open-for-business/{week}`
OpenAPI path. This bounded release read uses only the same 39 concrete paths as
Forge; three templated GET paths are excluded and no blanket coverage is claimed.
[Local preflight results](../research/payment-path-guidance-2026-10-15/release-preflight.json).

CI caught the guide's two content fingerprints, which intentionally change with
the authorized payment instructions. Restoring only the guide to main c12f09a8
reproduced both old pins (14/14); the candidate failed both. The new fingerprints
record that reviewed three-sentence addition, preserving the byte-level guard.

CI also caught a compact item contract 61 bytes above its existing 18,000-byte
limit. Shortened the shared checkout prose while retaining the probe URL,
optional-contract guidance and unsigned validation instruction; no reader limit
was raised. The 91 focused payment, entrypoint, guide and discovery-budget
checks pass, followed by typecheck. The full CI rerun gates the final head.

The full suite then exercised the OpenAPI growth fixture (one additional paid
route plus 31 saved publication slugs): 703,512 bytes exceeded the unchanged
700,000-byte budget. The optional `purpose` query parameter now uses one shared
OpenAPI component. A captured pre-change fixture pins its expanded contract on
every concrete buy operation; the new check and the growth check fail before
this reduction and pass afterward. Required inputs remain explicitly declared.

The same run caught setup repair metadata on a Trust Profile eligibility
refusal. Availability guidance is now limited to A2A; other non-input refusals
retain their existing fields. The existing refusal regression fails before this
correction. All 71 focused checks across budgets, parameter resolution, HTTP/MCP
refusals and buyer entrypoints pass, as do typecheck and production bundles.
