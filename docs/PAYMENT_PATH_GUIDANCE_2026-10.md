# Payment path guidance — October 15, 2026

Implemented locally on `codex/payment-path-guidance`, based on `948e8c92`.
Not committed, published or deployed. The keeper authorized the changes after
reviewing Forge's payment-readiness report.

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
their visible route counts recorded in the PR. Those release checks remain;
the local tests and earlier live probe are not substitutes for them.
