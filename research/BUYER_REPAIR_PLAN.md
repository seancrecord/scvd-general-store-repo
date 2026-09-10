# Buyer repair plan — September 6, 2026

Current status is maintained in the [completion checklist](BUYER_REPAIR_CHECKLIST.md), which records individual repairs, commits and validation. BUY-034's human-order scope is repaired through durable reconstruction, legacy retrieval and evidence-backed manual resolution. BUY-017 and BUY-037 remain open for the remaining artifact families and historical nonhuman obligations. The plan below preserves the original sequence; [repair progress](buyer-repair-progress-2026-09-06.md) and the [finding log](BUYER_AUDIT_LOG.md) retain the evidence. All payment tests use local fixtures.

## Outcome

A buyer supplies an understandable request, receives the good about that exact request, and can recover it after an interrupted purchase. HTTP and MCP enforce the same contract. Every supported rail authenticates its own payment identity. Every payment response answers: did money move, what was bought, what can be retried, and where is the good?

The priority is to stop wrong purchases and identity confusion, then make delivery and recovery dependable, then complete recipient proof and discovery consistency. Work serially in small reviewable changes. Do not attempt a single checkout rewrite.

## Baseline and evidence limits

The audit baseline is `325a2fe2d3856f7fe9e0d4515c4634d3a04739aa`. The checkout inspected for planning is `8c8c8ca6`; the committed difference adds listing records, not checkout repairs. Untracked checkout-contract code and entrypoint/refusal tests are concurrent work to preserve and reconcile before implementation. In particular, guidance claiming validation and deliver-first behavior must be tested against actual purchase paths.

Findings come from local tests and injected failures. They establish defects in those paths, not a count of harmed production buyers. Rebroadcasting the same Solana transfer is not proof of another debit. A failed ordinary retry is not proof that all manual recovery is impossible. Funded settlement, real chain finality, and runtime network isolation still require separate evidence.

## 0. Establish the repair baseline

Before the first behavior change:

- Reconcile the latest source and concurrent work in an isolated feature checkout. Record its revision and rerun the relevant buyer reproductions. Keep historical reports immutable; append new results.
- Give each finding a status: reproduced, fixed and verified, superseded with evidence, or unresolved. Preserve the original finding IDs.
- Separate the broad, intentionally failing audit battery into an explicit audit command/configuration before integrating it into ordinary CI. Keep an enforced known-failure register: new failures fail the gate; an unexpected pass requires review and removal from the register. Never silently skip a case or turn a defect into expected product behavior.
- Promote each repaired behavior into the normal regression suite. Demonstrate it failing without the source fix and passing with it. Preserve the full buyer battery for final acceptance.

Exit: a reproducible baseline, no overwritten shared work, and each failure traceable to one repair batch below.

## 1. Stop identity confusion and wrong purchases

These are the first bounded patches. They do not depend on redesigning recovery.

### 1A — Authenticate the rail's actual payer

Primary findings: BUY-018, BUY-019.

Use verified rail-specific payer and payment identity. A Solana payload's extra EVM-shaped fields must never authenticate a payer or create an EVM nonce record. Validate settlement identifiers using the selected rail's rules. If settlement might have occurred but its returned identifier is malformed, retain a recoverable uncertain payment state; never sign an invented transaction or assert no charge.

Acceptance: a valid Solana signer cannot retrieve another payer's EVM receipt using a public suggested key. Malformed transaction identifiers cannot become valid signed receipts. Existing legitimate same-rail recovery stays authenticated.

### 1B — Validate what will actually be fulfilled

Primary findings: BUY-001, BUY-002, BUY-003, BUY-004, BUY-009, BUY-010, BUY-026, BUY-027, BUY-028.

Create one validated purchase-input representation consumed by quoting and fulfillment. Derive HTTP/MCP contracts from the existing catalog/schema definitions. Validate required, conditional, optional, and reference fields before usable terms; revalidate mutable references before settlement. Reject invalid supplied values rather than defaulting or coercing them. An invalid renewal target cannot become a new purchase.

Keep valid agent-authored text as written and escape at rendering. Define limits consistently, including Unicode, and separate display shortening from signed content. Avoid broad sanitizer changes without auditing their other callers. The final stored/signed value must be the same value accepted at checkout.

Acceptance: omission, wrong-type, boundary, and canary tests agree across HTTP, MCP, and the separate unpaid doors Worker. Invalid requests have a stable code, explicit `charged:false`, no usable payment offer, and no fulfillment side effects. Valid text survives discovery-to-retrieval unchanged within explicit field rules.

### 1C — Make reuse describe the exact requested good

Primary finding: BUY-005.

Include every assembly-affecting field in case-file reuse identity. Keep content reuse separate from payment replay identity. Review claim, target URL, and referenced evidence together; invalidate incompatible old cache entries without deleting historical goods.

Acceptance: corrected claim B yields a good about B after claim A was bought; unchanged retries recover the original good. Tests change one input at a time and then multiple inputs.

## 2. Make payment and delivery a recoverable purchase

Primary findings: BUY-007, BUY-008, BUY-011, BUY-014, BUY-015, BUY-016, BUY-017, BUY-034, BUY-037, BUY-038.

This is the central repair, split into the following dependent changes:

1. **Persist purchase identity and truthful state.** Bind an immutable validated request, item, quoted terms, rail, authenticated payer, and stable recovery handle. Track goods and payment separately: goods can be ready while payment is unconfirmed, confirmed, rejected, or unknown. An unknown payment must not be serialized as `charged:false`.
2. **Make admission of a payment attempt atomic.** **September 10 status:** BUY-016 now binds new keyed attempts to one durable payment identity; the checklist records its crash/migration boundaries. Missing historical key associations and changed/expired recovery credentials remain BUY-014/015. Original plan: Concurrent requests for one authenticated purchase intent share one execution. Fresh authorizations and changed keys cannot bypass known-payment duplicate protection. Implement through a storage primitive that actually serializes competing requests; KV reads followed by writes are insufficient. Select the coordinator after checking existing infrastructure. Specify crash recovery and migration before changing the path.
3. **Honor deliver-first end to end.** HOUSE_RULES rule 9 accepts the seller's risk of delivering goods when settlement fails. Prepare and durably retain the promised good or human-job acceptance before settlement can strand the buyer. A provisional human acceptance is not a dispatchable work order; activate human work only after confirmed payment. Separate payment-dependent receipts from the underlying good. Signing, serialization, and required storage failures must either stop settlement or leave a deterministic reconstruction path.
4. **Make both doors use the same recovery service.** Authenticate retrieval without requiring a still-spendable authorization. Recover by verified payment identity when the original key is missing; never use an unsigned payer claim as proof. New-purchase stock checks must not block paid retrieval. Preserve the original intent after expiry, timeout, changed key, or settlement uncertainty. Never recommend a new payment while the first payment is unresolved.
5. **Finish only when the good is retrievable.** A certificate alone is not evidence that its anchor, audit, or order exists. Persist the fulfillment result and recovery pointers before closing delivery. Include final MCP/HTTP response serialization in payment-aware error handling. Network receipt cannot be guaranteed; stable replay must be.
6. **Recover older purchases honestly.** Resolve existing certificate/order/index gaps from authenticated retained evidence. Keep existing Claims/reconciliation paths and access controls. Do not fabricate missing historical goods, re-sign old facts as newly observed, or mark an order delivered from a certificate alone. Unrecoverable cases remain explicit keeper refund obligations.

Acceptance: dropped acknowledgement, dropped body, expired authorization, identical/new keys, same/different inputs, cross-item replay, concurrent attempts, and delayed replay all produce a deterministic result. Exactly one intended payment execution occurs; a paid buyer retrieves the original correct good without paying again. Both doors expose the same payment state and recovery instruction, with appropriate MCP error signaling.

The post-settlement gate must inject failures in certificate generation/signing/storage, artifact and order storage, indexes, fulfillment/response serialization, and callback scheduling. Extend beyond the three audited representatives to every distinct fulfillment branch. A transient storage outage must recover after restart, not just on the same in-memory request.

## 3. Make human availability enforceable

Primary findings: BUY-012, BUY-013, BUY-035, BUY-036.

First share weekly-stock and queue-capacity admission across doors, including machine-readable safe refusal. Then add atomic reservation/activation integrated with batch 2. Enforce both global and per-item limits under concurrent purchases; do not raise limits to hide overselling.

Recommended quote contract: a free quote states terms and expiry but does not silently promise a capacity reservation. Recheck prerequisites before attempting settlement. Once the purchase is admitted, reserve its capacity and durably prepare the acceptance. Keep a reservation while settlement is unknown; release only when non-payment is established or the agreed lifecycle permits it. Public quotes alone must not let anonymous callers exhaust stock.

For other mutable dependencies, bind the evidence snapshot or finish the deliverable before settlement. If the upstream disappears before preparation, safely refuse payment. If it disappears after the prepared good exists, deliver that explicitly identified observation. Never substitute current evidence for the evidence purchased.

Acceptance: exactly one buyer wins the last slot; losers pay nothing. Closing/full shelves still allow paid recovery. Quote-near-expiry and dependency-change tests cover both doors. SLA, stable order ID, polling, and manual refund obligations retain their existing valid behavior.

## 4. Make targets and callbacks safe and understandable

Primary findings: BUY-029, BUY-030, BUY-031, BUY-032, BUY-033.

Use a common canonical target guard before purchase and at dispatch. Cover trailing dots, encoded addresses, ports, credentials, private/link-local/loopback destinations, own hosts, and scheme restrictions. Return the actual buyer-actionable refusal rather than a generic 400/500. A provided invalid callback must not disappear silently.

Set an explicit callback redirect policy. Prefer refusing redirects unless there is a justified requirement to follow them; if followed, validate every hop with bounded traversal. Address DNS resolution/rebinding at the outbound connection boundary where the runtime permits enforcement; a hostname string check alone is not sufficient proof.

Persist completed work before callback attempts. Expose completion and callback outcome separately through HTTP/MCP order status, including the actual retry policy. Callback failure must never remove access to the purchased work.

Acceptance: the full target matrix passes without live private-network probes; transport-level tests demonstrate redirect policy. Completion remains retrievable after callback omission, refusal, timeout, 500, and scheduling failure. Establish runtime DNS/network limitations explicitly before making stronger security claims.

## 5. Bind signed proof to the purchased good

Primary findings: BUY-006, BUY-022, BUY-023, BUY-024, BUY-025.

Separate the good's signature from the payment certificate so envelope assembly cannot overwrite either. Sign the actual generated text where sold as a signed good. Bind term-service commissions to their subject, term, and relevant service identifiers. Bind human acceptance to the submitted brief and completion to that acceptance and the delivered work.

Confession proof needs a privacy-preserving contract decision: do not publish private confession text or expose a guessable plaintext hash as a casual fix. Prepare a concrete private receipt/commitment proposal and its verification/privacy tradeoff for the keeper before changing that product's promise.

Version changed artifact schemas and preserve verification of existing artifacts. New fields cannot retroactively prove facts absent from old signatures.

Acceptance: a recipient can verify the purchased subject and good using the published verifier. Change the target, text, transaction, chain, term, brief, or completion and verification must fail. Bundles contain exactly the requested transactions with documented ordering. Bitcoin anchors commit to the purchased digest. Valid historical fixtures still verify.

## 6. Make discovery describe the repaired behavior

Primary findings: BUY-020, BUY-021, BUY-039.

Derive price ranges, item recommendations, tiers, rail amounts, and cadence from their authoritative definitions. Reconcile menu, OpenAPI, x402 discovery, MCP, llms.txt, human pages, actual quotes, receipts, and order history. Also publish the input, retry, quote, callback, and artifact contracts established by the preceding batches. Keep compact checkout surfaces within reader limits.

BUY-039 was discovered and repaired locally during batch 1A: listings must not label a paid delivery failure as unpaid. Preserve the explicit false/true/null payment-state distinctions when reconciling these surfaces.

Acceptance: every advertised starting price and tier is unambiguous and matches the actual offer; no recommendation borrows another item's minimum price. A first-time buyer can discover required fields and complete/recover a purchase from each door without learning internal conventions. Product prose is drafted for the keeper's review under the standing copy rule; implementation work can proceed without waiting on stylistic choices.

## Delivery order and release gates

Implement 0 → 1A → 1B → 1C → 2 → 3 → 4 → 5 → 6. The small callback guard fixes in 4 can be pulled forward immediately after 1 if the payment work needs a longer migration. Within 2, review and land the dependent changes separately while keeping partially migrated paths safe. Complete one PR at a time; no production switch is implied by this plan.

For each change: record failing-before evidence, run its focused regressions and affected buyer battery, then typecheck and the full ordinary suite. Run the real bundle check for import/configuration changes, including the doors Worker. Do not accept a green targeted test as full acceptance.

Before calling the program complete:

- Re-enumerate products, supported rails, schemas, and both doors from the current implementation; fail on uncovered products rather than retaining a stale hand-maintained matrix.
- Run all original audit families, with no unresolved money-safety failures hidden in a known-failure register. Compare outcomes, not envelope equality.
- Verify restart recovery, expired quotes, concurrent final capacity, and retained legacy purchases against the chosen durable storage implementation.
- Perform a separately authorized, budgeted funded check on each supported rail and representative complex goods. Local facilitator mocks do not establish real settlement/finality behavior. Use disposable test identities without placing wallet secrets in the repo or tool output.
- Deploy only through the normal authorized release flow. Check discovery read-only afterward and monitor settlement-unknown, paid-without-good, recovery failure, capacity conflict, and callback failure separately. Rollback must preserve new purchase records and their recovery reader; stopping new sales must leave retrieval operational.

If a money-safety defect remains at release time, recommend withholding new purchases on the affected path until repaired, while keeping recovery available. Do not relabel it as a documentation issue or silently disable a live shelf from this planning task.

## Tracking and decisions

Each primary finding belongs to exactly one batch above; dependencies do not create duplicate tickets. Update the running log with the repair revision, red/green evidence, remaining limitations, and verified status only after the acceptance gate passes.

This document is the detailed build plan. When implementation is scheduled, link the program from ROADMAP rather than copying dozens of build tasks onto KEEPER_LIST. Keeper-only work is limited to concrete product/privacy wording decisions, any proposed operational restriction, funded-test authorization, and the release press. Present each with a prepared recommendation at the point it is needed.

Recommended first implementation: establish the baseline and fix rail-specific authenticated identity (1A), then the shared pre-payment input contract (1B). These close dangerous, reproducible paths while the durable recovery design is made reviewable.
