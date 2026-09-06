# HTTP ↔ MCP buyer-outcome audit — September 6, 2026

**Two new defects:** MCP loses the failure signal and structured reason for rejected settlement, and it accepts new human-work orders after the weekly stock limit. Both are queued in [the running buyer fix log](BUYER_AUDIT_LOG.md) as BUY-011 and BUY-012. Three previously logged differences also reproduce. No production fix, commit, deployment or real payment was made.

Audited revision: `325a2fe2d3856f7fe9e0d4515c4634d3a04739aa`. The shared workspace is undergoing separate changes, so comparisons use the isolated baseline from the earlier audits. This report does not evaluate those uncommitted changes.

## What ran

1,643 paired observations across all 32 paid products and all 35 applicable product/MCP-shelf memberships. HTTP calls use the actual GET purchase routes; MCP calls use actual JSON-RPC `tools/call`. Each door starts from the same saved local KV state, with identical buyer inputs, prerequisite records and clock. All three configured payment rails are exercised.

- 35 comparisons of required fields and the presence of optional fields in discovery.
- 210 paired successful purchase scenarios: required-only and all-optional inputs, through every applicable shelf and rail. These represent 420 primary purchases.
- 1,176 paired input cases: 294 unsigned and 882 signed. Every published field receives empty and semantically/contract-invalid values; required fields also receive omission and whitespace cases. Signed variants cover every offered rail.
- 105 paired verification refusals and 105 paired settlement refusals, using the same `insufficient_funds` facilitator response.
- 6 paired recovery cases after buying every weekly slot, plus 6 paired attempts to buy an additional order.

66 test groups: 29 pass and 37 fail the equivalence assertions. The failures remain intentionally visible as acceptance evidence. [Full paired evidence](buyer-door-equivalence-2026-09-06.json) records both observations, arguments, projected outcomes and differing dimensions.

## Findings

### BUY-011 — P1: confirmed settlement refusal loses its machine-readable meaning on MCP

All 105 paired settlement-refusal cases differ. HTTP returns a failure response with `payment_declined.reason: insufficient_funds`. MCP returns a normal successful JSON-RPC tool result containing an `error` sentence, with no `isError` marker and no structured settlement reason.

The audit recognizes that sentence as a refusal to a capable reader; it does **not** call the purchase fulfilled just because the transport returned HTTP 200. It separately checks whether a literal client receives a protocol failure signal and the same reason. Those are the missing buyer outcomes. Neither side settles money in this fixture, and both omit an explicit top-level `charged` field here; this is not a paid-with-no-good claim.

The HTTP gate adds the facilitator's reason to the decline body. The MCP payment path forwards the generic body, and the route wraps it as an ordinary tool result. Preserve the reason and confirmed charge state, and signal failure in MCP's own format. No identical-envelope requirement is needed.

### BUY-012 — P1: new MCP orders bypass the weekly labor limit

For both finite weekly-inventory products, buy every advertised slot sequentially, then send a fresh request and payment/key. HTTP rejects the quote and signed request as `sold_out`. MCP quotes terms, calls settlement successfully, creates an additional queued order and issues a certificate that verifies. Six product/rail pairs reproduce it.

The counter is filled through actual local purchases, using the count derived from the catalog. No concurrency or fake sold-out counter is involved. The existing post-sale oversell alert observes the problem but does not prevent it. This is an over-capacity sale; the test does not establish a missed human delivery deadline.

### Existing findings confirmed

- **BUY-002:** 104 unsigned input cases receive usable HTTP payment terms while MCP refuses the same input with a machine code and `charged:false`. The signed counterparts agree. This denominator differs from the earlier omission audit because this matrix uses a different, broader per-field case set.
- **BUY-008:** stock exhaustion blocks HTTP recovery, while MCP retrieves existing EVM purchases. The test extends the earlier Collab finding to Aura Walk. Solana's existing cache defect, BUY-007, also appears: its MCP retry creates another purchase instead of retrieving the first, while HTTP refuses at the stock gate.
- **BUY-010:** `buy_simple` omits the supported `purpose` input for its three eligible items, while their HTTP schemas advertise it. Runtime calls carrying it match, but a strict schema-driven client cannot construct those MCP calls legally.

## Outcomes that match

All 210 successful purchase pairs match on tested price/terms, supported networks, actual fulfillment inputs, product payload shape, buyer-controlled subject values, certificate fields, certificate/artifact bindings, verification results, human-queue handling and ordinary same-door retry behavior. Distinct purchases naturally receive distinct identifiers and signatures.

All 882 signed input-case pairs agree on the compared decisions and fulfillment inputs, and all 105 verification-refusal pairs preserve the same facilitator reason. The paid controls also exercise optional numeric values, valid linked IDs, callbacks and subject networks through their proper transport representations.

**Agreement is not correctness.** A shared defect can pass equivalence: both doors can normalize text the same wrong way, return the same damaged observation envelope, or fail Solana cache recovery similarly. The earlier survival and money-safety audits remain necessary. Tests do not silently mark those findings resolved.

## What “equivalent” means in this suite

The tool lists and served item schemas determine the roster and field coverage. Valid all-optional fixtures are shared with the survival audit; linked mandate/pass/launch-check IDs come from local prerequisite purchases, whose exact records are restored before each door's call.

A forwarding spy records the buyer input at the real `fulfillPurchase` boundary and then invokes the original implementation. It never replaces the goods generator or records environment secrets. Each positive purchase must invoke that seam once and return a certificate that verifies; two failed instruments cannot pass just because they agree.

Payment comparisons preserve each offer's amount, asset, network, recipient, scheme, signing lifetime and extra requirements. Certificate comparisons preserve substantive fields, while purchase-specific certificate IDs and settlement transactions are allowed to differ. Opaque evidence hashes are compared through their artifact-binding relationships, including ordered bundles and Bitcoin digests.

MCP's flattened certificate reference is rehydrated using the verification endpoint before comparison. Product shapes and actual subject/claim values are compared separately, so random decorative goods are not required to repeat the same draw. Actual input names come from the served schemas; artifact aliases such as `txHash` and `mandate_text` are included. Human queues compare the stored request, completed deliverable, both polling doors and the callback destination/content.

The only transport provenance ignored in fulfillment/order comparisons is `source: mcp`. HTTP status numbers are not compared to JSON-RPC error numbers. An HTTP “query parameter” and an MCP “argument” are normalized as the same explanation. Purchase-specific receipt IDs, signatures and pointers to each purchase's own settlement are not mistaken for different subjects. Raw observations are retained for inspection alongside these comparisons.

## Validation

Typecheck passes. Two independent runs of the final suite produced the same 1,643 paired observations, test outcomes and difference counts. [Validation provenance](buyer-door-equivalence-validation-2026-09-06.json) retains the run summaries and mutation-control result. The earlier survival audit still produces the same 450 observations and outcome counts after extracting reusable fixtures, with its known 33 failing groups and six passing groups. The four existing payment regression files add 19 passing tests.

The paired Good Buyer control passes normally. A temporary source mutation that drops `url` only on MCP makes that same test fail on actual fulfillment input and artifact subject differences. The source was restored byte-for-byte; no production diff remains in the audited worktree.

```sh
BUYER_INPUT_REPORT=/private/tmp/scvd-equivalence.json \
BUYER_INPUT_SCOPE='Paired HTTP/MCP outcomes; local mocked payments' \
npm test -- test/buyer-door-equivalence.spec.ts \
  --reporter=default --reporter=./scripts/buyer-input-reporter.mjs
npm run typecheck
```

The first command exits nonzero while the logged differences remain. No full-repository test run or build/deployment is claimed; only test helpers, audit specs and reports changed.

## Limits

The facilitator and all remote reads/callbacks are local doubles. Results prove application behavior on this baseline, not actual chain finality, real payment-signature acceptance, human work quality or live production configuration. Solana uses the same explicitly limited wire-shape fixture as the prior audit; repeated facilitator calls are not evidence of a second on-chain debit.

This matrix covers successful calls, per-field invalidity, confirmed insufficient-funds refusals, ordinary same-door retries and stock exhaustion. It does not exhaust every failure reason, timeout, simultaneous purchase, cross-door idempotency key, authenticated claims recovery or long-term fulfillment. The public hosted HTTP/MCP deployment, newer protocol profiles being built in the shared checkout, and browser envelopes are outside this snapshot comparison.
