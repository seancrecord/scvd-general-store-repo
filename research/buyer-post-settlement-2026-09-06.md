# Post-settlement failure injection — 2026-09-06

Audited revision: `325a2fe2d3856f7fe9e0d4515c4634d3a04739aa`, isolated from concurrent shared work. No real money moved. Test mocks intercepted operations without changing production source. This suite covers Context Anchor (post-payment instant artifact), Service Audit (observation prepared before payment, stored later), and Aura Walk (human commission), through HTTP and MCP on Base, Polygon and Solana. These are three fulfillment representatives, not an exhaustive fault matrix over every catalog product.

## Verdict

**The requested invariant is not established.** Eighteen fault-free controls all deliver a valid, retrievable good. Among 126 fault injections, 68 recover, 6 fail before settlement, and 52 leave ordinary same-request recovery without the promised good. Three additional raw MCP controls expose a false “no charge” response after confirmed payment, despite subsequent recovery.

“SEV-1 local reproduction” in the evidence means payment settled and the tested buyer recovery path did not provide the promised valid good. It does **not** prove that every byte is irretrievably lost or that the keeper could never reconstruct it. Six failing response-serialization cases have the artifact/order in storage but do not give its retrieval handle back to the buyer. Other failures never persist the good. Delivery intents, alerts, the wallet-authenticated Claims door and manual resolutions exist; their existence alone is not a completed reconstruction. This suite does not exercise a separate Claims login or claim an actual manual refund/repair was performed.

## Operation results

- **artifact write**: 4 recovered, 8 failed same-request recovery.
- **callback scheduling**: 6 recovered.
- **certificate generation**: 12 recovered, 6 failed same-request recovery.
- **certificate write**: 12 recovered, 6 failed same-request recovery.
- **fulfillment serialization**: 6 safe before settlement, 2 recovered, 4 failed same-request recovery.
- **order write**: 2 recovered, 4 failed same-request recovery.
- **response serialization**: 12 recovered, 6 failed same-request recovery.
- **signing**: 12 recovered, 6 failed same-request recovery.
- **verify index write**: 6 recovered, 12 failed same-request recovery.

There are 120 fault cases whose recorded hit occurs after the facilitator fixture has returned a successful settlement acknowledgement. Six Service Audit fulfillment-serialization failures happen before settlement and cause no initial transfer: this is the proven safe ordering. Every requested operation's instrument was hit. KV faults persist through all three attempts of the real request retry wrapper, then the fixture is removed before recovery.

The “KV write” requirement is split into certificate storage and product-artifact storage, in addition to human-order and reverse-index writes. The verify-index fault targets the settlement-to-certificate reverse index used by paid recovery; certificate KV storage separately covers whether `/api/verify` has its record. Callback scheduling is modeled as failure at inline callback dispatch after local human completion. This path uses an inline fetch, not a separate durable scheduling service; its catch preserves the completed order and records failure.

## Findings

**BUY-034 expands beyond human-order storage.** Once a certificate exists, HTTP EVM recovery can declare `already_delivered:true` although the anchor, audit report or commission is missing. Certificate reverse-index failure is particularly revealing: the certificate write succeeded, the next write failed, and subsequent product creation never ran. Recovery may find the certificate through its fallback and stop there. Context Anchor's fulfillment serialization and product writes expose the same ordering problem. HTTP response serialization shows the other side: the product exists, but the buyer receives only its certificate instead of the artifact/order URL.

**BUY-037 — SEV-1 local reproduction: MCP EVM recovery does not reconstruct after a pre-certificate failure.** Eighteen cases across the three products, certificate generation/signing/certificate storage, and Base/Polygon settle but leave an identical paid retry without the good. The original idempotency key is present; this differs from BUY-014's lost/replaced-key cases. Equivalent HTTP cases reconstruct successfully. The failure response correctly reports `delivery_failed` and `charged:true`; the follow-up nevertheless cannot supply the purchase. Manual intervention is promised, not demonstrated fulfillment.

**BUY-038 — P1: MCP response serialization escapes payment-aware error handling.** Fulfillment can finish, the delivery intent can close and the purchase can be cached before `toolText` serializes the response. Throwing there yields a generic HTTP 500 rather than a JSON-RPC payment-aware error. Three raw controls on Context Anchor, one per rail, capture “no charge for the noise” after a confirmed transfer. Identical retry recovers the cached good. This is recoverable delivery with a false money-state message, not a second charge or unrecoverable artifact.

The [running log](BUYER_AUDIT_LOG.md) retains all earlier findings. BUY-007's Solana replay behavior remains: the same transaction may be submitted again and produce another artifact. Here recovery is counted as safe from additional payment only when every recorded transfer identifier is identical. No fault case produced a second distinct simulated transfer. This narrow recovery result does not erase the existing duplicate-artifact defect.

## What the proofs actually check

The fault remains armed through the initial request and all internal retries. The test then restores the real functions and namespaces and sends the same item, inputs, payment payload and idempotency key. Each record includes fault hits with their settlement phase, confirmed transaction identifiers, initial and retry responses, storage snapshots, buyer-visible retrieval results and classification.

A certificate alone is insufficient. For Context Anchor, the retrieved summary must equal the unique canary and its artifact signature must verify independently with WebCrypto. For Service Audit, the retrieved report must name the exact purchased URL; the reconstructed SHA-256 evidence digest must match the report and the verified purchase certificate's `attests` field. For Aura Walk, the returned order must exist with the submitted brief; a callback-dispatch failure must still leave the exact completed fixture text retrievable. These checks do not claim that an unsigned human brief or completion has acquired stronger proof than the earlier wrong-good audit established.

Buyer link traversal follows both absolute and relative local API artifact URLs. An initial detector omitted Service Audit's relative `report_url`; its positive controls correctly failed. That run was discarded, link traversal was corrected and the complete matrix rerun. The final evidence has all 18 positive controls passing; no missing-instrument failures remain. Certificate signatures are checked separately from the purchased artifact's subject and availability.

All callbacks, RPC reads and facilitator requests are intercepted. The certificate-generation and signing faults wrap their actual exported operations. Storage faults wrap only the targeted key classes. Serialization faults intercept the matching artifact or purchase-response object at its real `JSON.stringify` call. No generic mock failure is substituted for an unexercised instrument. Namespace/function restoration occurs in `finally`, and the production source diff remains clean.

## Repair direction and limits

Recovery needs a durable purchase record that binds the payment, exact accepted input and actual artifact/order identity. Its completion marker must mean that the promised good exists and is retrievable, not merely that a payment certificate minted. Missing product state must be reconstructable idempotently under the original payment. HTTP and MCP need the same recovery behavior. Keep the payment-aware exception boundary around response construction and serialization as well as fulfillment, and preserve a usable buyer recovery handle even if response encoding fails.

An admin action that records “fulfilled by hand” is not itself an implementation that creates or returns the missing good. The delivery-resolution service was inspected; it records an outcome, rather than constructing these artifacts. Existing intent query data can help the keeper, but this audit does not label a manual promise as a completed recovery.

Run `npm test -- test/buyer-post-settlement.spec.ts --reporter=./scripts/buyer-boundary-reporter.mjs`, with `BUYER_INPUT_REPORT` selecting the JSON output path. Typecheck passed after final changes. The four aggregate acceptance tests intentionally remain red. The full repository suite was not run, and no commit or production fix was made.

## Evidence

- [Fault matrix and artifact proofs](buyer-post-settlement-faults-2026-09-06.json)
- [Raw MCP serialization errors](buyer-post-settlement-raw-mcp-2026-09-06.json)
- [Coverage and validation](buyer-post-settlement-validation-2026-09-06.json)
