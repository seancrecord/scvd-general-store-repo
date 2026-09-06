# Buyer quote-to-fulfillment audit — September 6, 2026

Audit of revision `325a2fe2d3856f7fe9e0d4515c4634d3a04739aa`, in an isolated worktree. Concurrent changes in the shared checkout are not covered. Findings are queued in [the running log](BUYER_AUDIT_LOG.md); no production fixes, commits, deployment, real payments or external messages were made.

## Findings

**BUY-013 (new, P1): MCP admits labor after the open queue fills.** Quote either human-work item, fill the published open-labor capacity, then submit that quote's payment. HTTP refuses; MCP settles and creates another order. Six MCP failures across the two products and three rails. The capacity fixture fills the order ledger, rather than mocking the verdict. This is an admission defect, not evidence that a particular deadline was missed.

**BUY-012 (confirmed, P1): MCP admits labor after weekly inventory fills.** The corresponding six MCP cases settle after the quoted item's weekly inventory reaches its limit. HTTP refuses. These are new purchases against outstanding quotes; previously audited recovery failures remain separate.

Both shutters close safely on payment presentation. Removing the evidence that made a trust profile eligible also refuses before settlement. The quote does not reserve capacity or stock; safe refusal is an acceptable result under this audit.

## Method and denominator

The executable test enumerates the served paid menu and every MCP shelf exposing each item. It captures the exact offered requirements, including amount, asset, recipient, rail and signing window. Each case starts from fresh local state and selects the base-price offer for its rail; optional tip tiers are not additional purchases here.

The 543 observations cover 32 items, HTTP and all 35 MCP item/shelf memberships, and Base, Polygon and Solana payment rails:

- 201 near-expiry purchases, submitted one second before the offered signing window ends.
- 134 past-expiry EVM controls, submitted one second after the authorization expires.
- 64 EVM preparation-window cases; the clock advances beyond expiry when a subject or chain read occurs.
- 60 endpoint-disappearance cases and 36 chain-upstream outage cases.
- 12 shutter closures, 12 capacity changes and 12 weekly-inventory changes after quoting.
- Six evidence-removal cases and six Bitcoin-calendar outage cases.

The clock is injected throughout. EVM fixture authorizations use the offered window, replacing the older helper's effectively unlimited `validBefore`. A narrow facilitator wrapper rejects expired authorizations at verification or settlement and separately records successful mocked settlements. It does not equate an attempted settlement with money moving. Solana uses blockheight-based expiry: its synthetic transaction can test application behavior after elapsed wall time, but cannot establish actual expiry enforcement.

## Results

The matrix records 201 honored near-expiry purchases, 236 cases with no successful mocked settlement, 94 paid results with the documented observation/deferred-service semantics, and 12 failed admissions. The two labor-item tests fail; the other 30 item tests pass. All 307 paid certificates verify independently, 511 returned artifact API links are accessible, and 24 first scheduled outage histories are recorded. No new settled-without-delivery case is established by these scenarios; the previously logged artifact/input defects remain open.

## What the paid outage goods mean

Endpoint observations disclose `unreachable`, with the subject and dated finding. Wallet statements disclose `window_unreadable`; they do not silently call an unreadable window an empty wallet. Products that require chain facts instead refuse without settlement when those facts cannot be read.

Watches sell a bounded future observation service. The purchase need not contact the endpoint immediately. The audit runs the first scheduled pass with the endpoint or RPC still unavailable and reads the persisted history. Trust profiles read existing store evidence; disappearing endpoint access alone is not the eligibility gate. Removing the evidence itself is tested separately.

Bitcoin-calendar failure returns the buyer's digest, a stored anchor record and explicit `failed` submission state, with the documented hourly retry semantics. This is not a confirmed Bitcoin proof, and the audit does not call it one.

Preparation can exhaust a payment authorization. When the work occurs before settlement, the temporal facilitator refuses the expired authorization. Some scheduled-product setup reads occur after an otherwise valid settlement; the evidence records the settlement time separately so these are not falsely called expired settlements.

For paid responses, the suite verifies the certificate signature independently, compares the item, amount and rail to the accepted terms, checks a readable immediate deliverable or the promised labor order/window, and opens returned local artifact API links. Raw responses and histories are retained for review. Existing standalone observation-signature defects (BUY-006) remain open; a valid certificate does not erase them.

## Limits

This is a deterministic local acceptance audit, not proof of chain finality, valid wallet signatures, live Solana blockhash behavior, eventual human completion, a complete watch term or eventual Bitcoin confirmation. No claim is made that all commercially useful properties follow from a signed certificate. The earlier input-survival audit remains necessary.

The scope is the published menu. Commission Desk one-off quotes, retired stocked products, optional tip tiers, arbitrary storage failures, changes during concurrent admission, and all possible evidence transitions are not exhaustively covered. The quote mutation happens before payment presentation; it does not establish race-free reservation between validation and settlement. The repository already documents a post-sale oversell alert, which is not an atomic reservation.

Some safe refusals omit machine-readable `charged:false`; the evidence retains those envelopes. The mock's zero successful settlements establishes local money safety, not that a first-time buyer could determine that fact from the response. Previously logged MCP refusal signaling defects remain open.

## Reproduction and evidence

Run `npm test -- test/buyer-quote-fulfillment.spec.ts --reporter=./scripts/buyer-input-reporter.mjs` with `BUYER_INPUT_REPORT` set to the desired evidence path. These are acceptance tests and deliberately fail while the admission defects remain.

See [raw observations](buyer-quote-fulfillment-2026-09-06.json) and [validation record](buyer-quote-fulfillment-validation-2026-09-06.json). The repeated matrix reproduced the same 543 outcomes. Typecheck passed. Temporarily disabling the existing HTTP capacity refusal turned all three formerly safe Aura Walk HTTP cases into detected paid-admission failures. Production source was restored byte-for-byte. The full repository suite was not run; no production code is changed.
