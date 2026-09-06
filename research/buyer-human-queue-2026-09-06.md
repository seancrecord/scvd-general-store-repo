# Human-queue buyer audit — 2026-09-06

Frozen snapshot: `325a2fe2d3856f7fe9e0d4515c4634d3a04739aa`, isolated from concurrent shared-checkout changes. The catalog identifies two human-queue products: Aura Walk and The Collab. This audit uses local orders, mocked payments and callbacks, and a simulated keeper completion. No live human work, money, callback, deployment or production fix was performed.

## Outcome

**590 observations: 358 pass, 232 fail.** This includes 312 admission/payment observations, 240 lifecycle observations, 14 first-view checks, 12 concurrent last-slot controls and 12 storage-failure controls. These are scenario observations, often with several assertions; counts are not distinct bug counts. The seven aggregate tests comprise one passing and six intentionally failing tests.

Three new findings enter the [running fix log](BUYER_AUDIT_LOG.md):

- **BUY-034 — SEV-1 local reproduction: settled payment, no human order, misleading recovery.** Persistently failing only the human order write lets the certificate and payment succeed first. After restoring storage, eight Base/Polygon requests across both products and doors cannot retrieve a human order with the identical payment and idempotency key. HTTP returns `already_delivered:true` and a certificate link although no order exists; MCP asks for payment again. Four Solana cases do recover an order by rebroadcasting the same simulated transfer; matching transaction identifiers establish that this is not evidence of another debit. The latter cases are classified recoverable, while their replay mechanics remain covered by BUY-007.
- **BUY-035 — P1: two buyers buy the last human slot.** With one slot left, synchronize two requests after their admission checks but before payment verification finishes. Both settle and create orders in all 12 product/door/rail combinations. Aura Walk ends with six open orders against five; The Collab ends with three against two. HTTP is affected even though its sequential full-capacity refusal works. The existing oversell alert is a manual recovery backstop, not a reservation preventing the extra sale.
- **BUY-036 — P2: HTTP capacity refusals omit machine-readable charge state and code.** Thirty-six item/global/full-after-quote cases safely refuse with useful prose explaining the full bench and next steps, but lack both `charged:false` and a refusal code. A human can understand them; a schema-driven buyer must infer payment state from prose.

Existing findings recur: BUY-012/013 permit MCP sales at exhausted inventory or queue capacity (48 admission observations); BUY-011's settlement-decline envelope problem remains, with missing machine fields on HTTP as well; BUY-007 changes the order on Solana replay; and BUY-033 hides callback outcomes from both status doors. No earlier finding is silently marked fixed.

## What passed

All 14 first-view checks state the catalog's 168-hour human delivery window: menu JSON, item JSON, human item HTML, item-specific OpenAPI, eligible MCP purchase tool, HTTP 402 and MCP 402, for both products. A queued response carries the order id, status, SLA and retrieval URL. The contract does not require the buyer to understand internal queue storage.

Open and near-capacity sequential purchases create exactly one new order with the promised SLA. Closed shelves, including closure immediately after a usable quote, reject on both doors. Missing payment, malformed payment and failed verification create no human order. Rejected settlement also creates no order and moves no simulated money; its response still has the existing disclosure/envelope defect. The suite distinguishes a call to settlement from a successful settlement, rather than calling a rejected attempt a charge.

Completed work remains retrievable by both HTTP and MCP when the callback is omitted, succeeds, is unavailable, answers 500 or redirects to another public receiver. A callback is never the only copy of the work. Callbacks contain the completed order id and exact fixture deliverable. Failed callbacks are stored internally; their invisibility to buyers is the already logged BUY-033.

The buyer need not poll to trigger fulfillment: the never-polls scenarios perform the first retrieval a day after the promised deadline and receive the completed work. Twenty-five consecutive HTTP/MCP polling pairs per aggressive scenario do not create orders or trigger callbacks. Both retrieval doors return equivalent queued/completed state and the same order id.

All 72 SLA-boundary scenarios correctly distinguish completion at deadline−1ms, deadline, and deadline+1ms. At the exact deadline the order is on time; one millisecond afterward it carries a delivered-late breach and the correct amount owed. The pending view follows the same boundary. Later retrieval uses completion time, not read time, so an on-time completion does not become late merely because the buyer returns the next day. These boundary assertions pass even where an unrelated Solana purchase-retry assertion makes the aggregate scenario red.

## Stable identity and recoverability

The 240 lifecycle scenarios span both products, both doors and every advertised accept entry. Aura Walk has one price on each rail; The Collab has three tiers. Nine scenarios per combination replay the exact initial purchase before completion. All 144 Base/Polygon replays preserve the order without another settlement attempt. Seventy-two Solana replays create another order and resubmit the same payment; as in earlier audits, rebroadcast of the same transfer does not establish a second debit. The no-poll scenario deliberately omits purchase retry and all precompletion status reads.

The order-storage control targets `ORDERS` writes only under the order prefix, allows the real retry wrapper to exhaust its attempts, then restores the original namespace before retrying the buyer request. Certificate writes and settlement are unaffected. Captured initial certificates, recovery proofs and transaction identifiers distinguish a missing order from a valid payment certificate, and a same-transfer recovery from an additional debit. The ordinary open-purchase cases establish that the product can create orders when this fault is absent.

The implementation creates the human order after settlement and certificate minting in `src/services/fulfillment.ts`. The HTTP spent-payment recovery path in `src/lib/payment-gate.ts` treats an existing certificate as proof of completed delivery. This is insufficient for human work: the certificate can exist while its commission never reached the keeper. Delivery intents and existing recovery defenses were searched and inspected before classifying the gap; they are present, but this fault still reproduces through actual buyer routes.

## Method and scope

Admission covers open, closed, closes-after-quote, near/full per-item capacity, near/full global capacity, capacity-fills-after-quote, exhausted weekly inventory, no payment, malformed payment, verification rejection and settlement rejection. Each starts with clean fixture storage and an open quote. Capacity fixtures are pre-existing queued records used to exercise the actual counting/index path; they are not new obligations created by real purchases.

Lifecycle covers omitted/valid/unavailable/500/public-redirect callbacks, no polling, aggressive polling and the three SLA boundaries. The clock is injected for order creation, completion and retrieval. A public 307 callback redirect is explicitly modeled as reaching a successful final receiver; it is not falsely treated as an error solely because the initial HTTP response redirected. Private redirect policy was tested separately in the target-selection audit.

The concurrency control holds the first verifier until both requests have passed admission. Every row verifies that both reached the barrier. The test does not claim a multi-region production reproduction or a particular KV counter race; the evidence is two returned paid orders exceeding the published per-item bound.

The authoritative core evidence combines the final admission run and final lifecycle run. Admission was corrected to count successful settlements rather than attempts; lifecycle was corrected to model public callback redirect following. Earlier interim rows were replaced. Control evidence replaces the initial storage-failure classification with a rerun that verifies transfer identity, so Solana same-transfer recovery is not labelled unrecoverable.

Run `npm test -- test/buyer-human-queue.spec.ts test/buyer-human-queue-controls.spec.ts --reporter=./scripts/buyer-boundary-reporter.mjs`, setting `BUYER_INPUT_REPORT` to the desired local JSON output. Typecheck passed after final edits. Tests intentionally remain red against the frozen snapshot; the full repository suite was not run and no commit was made.

## Evidence

- [Admission and lifecycle observations](buyer-human-queue-2026-09-06.json)
- [Discovery, concurrency and recovery controls](buyer-human-controls-2026-09-06.json)
- [Coverage and validation](buyer-human-validation-2026-09-06.json)
