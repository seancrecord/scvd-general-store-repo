# Buyer audit — running fix log

Completion status and per-fix commits: [buyer repair checklist](BUYER_REPAIR_CHECKLIST.md). A checked repair is local and committed; deployment is tracked separately.

Requested by Sean for the continuing buyer-test prompts. **Audit findings and subsequent repair status.** Keep these IDs when appending later prompts. No production change, commit, deployment, or real payment was made for the original audits. Local repairs started after Sean's September 6 instruction to rebase on main and begin; verified changes are identified individually below.

Repair sequencing and acceptance gates: [buyer repair plan](BUYER_REPAIR_PLAN.md). Every finding below has a primary repair batch; planning does not mark it fixed.

Evidence baseline: `325a2fe2d3856f7fe9e0d4515c4634d3a04739aa` (September 6, 2026). Other work is changing the shared checkout; these findings describe the isolated baseline, not untested concurrent changes. Re-run before marking any entry fixed. Acceptance tests deliberately remain red while defects remain.

Raw JSON captures and exploratory audit probes referenced below remain local evidence; they are not included in this documentation commit. The Markdown reports preserve their recorded findings. Integration of those probes into an explicit audit runner remains open in plan step 0.

## Fix first

### BUY-001 — SEV-1: empty essential text can settle

Local repair commit: `ed57dc36`. Original reproduction and repair scope follow.

**Fixed and committed locally; not deployed · required-input audit.** A required value consisting of U+0000 passes validation, then disappears during fulfillment mapping. Reproduced for `context_anchor.summary`, `the_confession.confession`, `coffees_for_closers.win`, and `graffiti_on_a_train.tag`, across HTTP/MCP and all three payment rails: 24 mocked settlements with empty goods.

Repair: validate the actual value that fulfillment will use before offering usable terms or authorizing payment. Refuse a value that becomes empty. Preserve valid buyer text.

Evidence: [required-input report](buyer-paid-door-inputs-2026-09-06.md), corresponding JSON, `test/buyer-paid-door-input-matrix.spec.ts`. Relevant code: `src/lib/purchase-args.ts` validation and mapping.

### BUY-005 — SEV-1: a new case-file purchase returns the old claim

Local repair commit: `929d6b3a`. Original reproduction and repair scope follow.

**Fixed and committed locally; not deployed · input-survival audit.** Buy a case about a transaction with claim A, then buy again with a fresh payment and idempotency key and corrected claim B. The second payment settles but the signed case still contains A. Six corrected purchases reproduced this across both doors and all three rails. The replay of that new purchase would preserve the wrong claim too.

Repair: include every assembly-affecting input in the case reuse identity, or reject changed inputs with an explicit explanation before payment. Review URL and launch-check changes alongside claim changes; only changed claim is experimentally established here.

Evidence: `same-transaction-new-claim` rows in the [survival evidence](buyer-input-survival-2026-09-06.json). `src/services/fulfillment.ts` calls `existingCaseFor` with only transaction and mandate; `src/services/case-file.ts` caches that pair.

## Cross-rail identity and receipt integrity

### BUY-018 — P1: a Solana signer can claim an EVM payer's cached receipt

Local repair commit: `005df923`. Original reproduction and repair scope follow.

**Fixed and committed locally · not deployed.** Reproduced after rebasing onto main `a35ba5e2` on `codex/buyer-repairs`. The new `test/payment-rail-identity.spec.ts` failed in all four HTTP/MCP × Base/Polygon victim cases before the fix. `src/lib/replay-guard.ts` now reads authenticated payer fields only from exact-EVM v2 envelopes and ignores EVM nonce metadata on Solana envelopes. All four regressions pass afterward, retaining legitimate EVM replay and ensuring the Solana buyer receives its own purchase without consuming an EVM nonce. See [repair verification](buyer-repair-progress-2026-09-06.md). BUY-007 remains open; BUY-019 is repaired separately below.

Original reproduction: an EVM buyer purchases with the publicly suggested key. A different, cryptographically verified Solana signer sends a valid Solana payment plus an unsigned `payload.authorization.from` naming that EVM buyer and an EVM-shaped nonce. With the same item, arguments and suggested key, both HTTP and MCP return the EVM buyer's original cached certificate without settling the Solana payment.

The installed Solana facilitator SDK accepts the signed fixture in Node and returns the actual Solana payer. The store instead reads the unverified EVM-shaped field from the verified Solana payload. The SDK verification of the transaction does not authenticate arbitrary adjacent metadata. Normal Solana payments also write an EVM nonce record when this extra authorization object is present; a top-level nonce alone is ignored. This is a new identity-boundary defect, beyond BUY-007's missing Solana replay identity.

Repair: derive payer and replay identity according to the verified rail. Do not interpret an EVM authorization or EVM nonce for a Solana payload. Bind recovery to the authenticated payer and purchase intent, and test cross-rail attempts against the public suggested keys as well as private caller keys. Do not weaken authentication to fix receipt recovery.

Evidence: `cross-rail-payer-claim` and `evm-nonce-supplied` in the [cross-rail report](buyer-cross-rail-2026-09-06.md). Both helpers in `src/lib/replay-guard.ts` inspect `payload.authorization` without checking the rail; HTTP and MCP use that payer for their cache lookup. This is an isolated reproduction with disposable keys, not access to any real buyer's account.

### BUY-019 — P1: malformed Solana settlement IDs are signed into receipts

Local repair commit: `1a0b3827`. Original reproduction and repair scope follow.

**Fixed and committed locally for receipt validation and tested same-payment recovery · not deployed.** Both settlement attempts in the shared retry wrapper now validate successful Solana receipts against the selected network and a bounded, decoded 64-byte identifier. HTTP and both MCP payment modes report `invalid_settlement_receipt`, `charged:null`, and `payment_state:"unknown"` instead of signing malformed facts or offering a new payment. The existing reconciliation row supplies a reference when storage succeeds; storage failure is explicitly reported. Ten malformed-receipt cases failed before the patch and pass afterward, including same-signed-payment recovery once the processor returns a corrected receipt. Live finality, expired retries, durable reconstruction, and general Solana idempotency remain outside this fix under BUY-007/014/015/017/034/037. See [repair verification](buyer-repair-progress-2026-09-06.md).

Original fault: the simulator settles a valid signed Solana transfer, then the facilitator response carries `transaction:"0OIl!"`. Both doors mint a certificate containing that malformed value and `/api/verify` reports the certificate valid. The deliverable exists, but the transaction reference is neither base58 nor a 64-byte Solana signature and cannot identify the payment.

Repair: validate settlement identifiers against the selected rail before presenting them as signed payment facts. Preserve an explicit recovery path when a successful settlement acknowledgement is malformed; do not discard the buyer's payment or invent a transaction identifier. This is a malformed-upstream-response test, not a claim that the live facilitator currently emits this value.

Evidence: `malformed-settlement-base58` rows and independent SDK fixture validation in the cross-rail report. Certificate signature validity is not transaction validity.

## Payment ambiguity and retries

### BUY-014 — P1: a spent payment without its original key does not retrieve the receipt

**Open · payment ambiguity audit.** On Base and Polygon, replaying a successful payment with no idempotency key, or with a new key, refuses without returning the already-created artifact. Eight cases across HTTP/MCP. The nonce guard prevents a second settlement, but its response tells the buyer to sign a fresh authorization. A buyer who lost the first response still needs the original good, not another purchase.

Repair: return an authenticated path to the original receipt/artifact for a spent payment. Keep changed-item/input requests distinct; never release another buyer's purchase based only on a claimed payer. The separate wallet-signature Claims door exists; this finding concerns ordinary purchase retry, not absence of every recovery mechanism.

### BUY-015 — P1: payment expiry blocks receipt replay, and the suggested replacement key can charge again

**Open · payment ambiguity audit.** With a quote-window EVM authorization, a same-payment/same-key replay at ten minutes fails verification before reaching the 24-hour purchase cache. Fresh authorization with the ORIGINAL key recovers safely. Copying the response's suggested key instead changes purchase identity: all four literal EVM retry-instruction cases produce two simulated debits and two certificates. A verifier that rejects spent authorizations similarly blocks ordinary replay; that is an explicit facilitator-policy simulation, not a claim about every live verifier.

Repair: separate authenticated receipt recovery from authorization spendability. Preserve the buyer's original key in retry instructions; do not tell them to replace it with a new minute bucket. Keep the existing authentication boundary—moving an unverified payer claim in front of it is not a safe fix. HTTP exposes a Claims alternative in its expiry response; that does not make the contradictory purchase-retry advice safe.

### BUY-016 — P1: concurrent fresh authorizations bypass the same-key safeguard

**Open · payment ambiguity audit.** Two simultaneous requests for the same item, inputs, payer and idempotency key, each carrying a fresh authorization, both reach settlement and create separate purchases. The controlled schedule produces two simulated debits on each rail through both doors. This is distinct from resending one authorization, whose EVM nonce still prevents a second debit. The existing cache deliberately allows a normal charge on a miss/race; it is not atomic admission.

Repair: serialize or atomically claim a purchase intent before settlement, and give losing duplicates a deterministic pending/recovery response. Test separate nonces as well as identical signatures. With one EVM authorization the losing concurrent response is ambiguous, but a later identical retry does retrieve the winner's artifact; do not label that particular case a second debit.

### BUY-017 — SEV-1 fault case: lost settlement acknowledgement can leave no artifact and report “No charge”

**Open · injected payment-ambiguity audit, not a verified live incident.** The simulated transfer lands, the facilitator acknowledgement is replaced with transport failures, and the immediate chain lookup has no visible event. On Base/Polygon, the purchase and identical retry provide no certificate while claiming no charge. The audit also checks persisted certificate keys. Base's positive control rescues and fulfills when the event is visible. Polygon does not invoke that immediate rescue even when the fixture would expose the event.

Repair: distinguish confirmed rejection from unresolved settlement in the buyer response. Preserve the purchase intent and give a stable status/recovery handle; complete delivery when settlement is established. Do not advise an unqualified fresh payment. The repository already records settlement-unknown rows and has later reconciliation/alerts; those defenses do not make the immediate “No charge” statement true or deliver the good during these tests. Eventual reconciliation is not claimed tested here.

Evidence for BUY-014–017: [payment-ambiguity report](buyer-payment-ambiguity-2026-09-06.md), raw observations and detector-control record. Production fixes remain queued.

## Capacity and quote fulfillment

### BUY-013 — P1: MCP sells labor after the open-work queue reaches its ceiling

**Open · quote-to-fulfillment audit.** Obtain a valid quote while the bench is empty, then fill the published open-labor ceiling with outstanding orders before presenting the payment. HTTP refuses before settlement. MCP settles and creates another labor order. This affects both current human-queue products across Base, Polygon and Solana. It is separate from BUY-012: open backlog is a capacity level; weekly sales inventory is a rate that resets.

Repair: enforce the shared capacity verdict for new MCP purchases before payment, while preserving authenticated retrieval of an already-paid order. Keep concurrent admission/reservation races in scope for follow-up; this reproduction is sequential and does not prove a missed SLA or a second chain debit.

Evidence: `capacity-fills` rows in the [quote-to-fulfillment report](buyer-quote-fulfillment-2026-09-06.md). `src/routes/door-checks.ts:capacityCheck` uses `capacityVerdict`; the MCP purchase path and shared fulfillment path do not. Repository-wide searches found the other admission check in the Commission Desk, not this MCP path.

## Recovery and artifact integrity

### BUY-011 — P1: MCP returns a settlement refusal as a successful tool result

**Open · HTTP/MCP equivalence audit.** The same `insufficient_funds` settlement refusal is a failed HTTP response with `payment_declined.reason`; MCP returns a normal JSON-RPC tool result, no `isError`, and only an English error sentence. Reproduced for all 32 products through all 35 applicable MCP shelf memberships on three rails: 105 paired refusal cases. A capable reader can infer refusal from the sentence, but a literal client receives neither the protocol failure signal nor the machine-readable reason available over HTTP. No money settles in this fixture.

Repair: preserve the structured settlement reason and confirmed charge state, and signal a tool failure in MCP's own protocol. Different envelopes are appropriate; losing the failure indication is not. Keep ambiguous settlement distinct from a confirmed refusal.

Evidence: `settle-decline` rows in [door-equivalence evidence](buyer-door-equivalence-2026-09-06.json). `src/lib/mcp-payment.ts` forwards only `settlement.response.body`; HTTP adds the reason in `src/lib/payment-gate.ts`. `src/routes/mcp.ts` catches `SettlementDeclined` and sends `rpcResult(toolText(...))` without a tool-error marker.

### BUY-012 — P1: MCP accepts new labor orders after the weekly stock limit

**Open · HTTP/MCP equivalence audit.** Sequentially purchase every advertised weekly slot, then request one more order with a fresh payment/key. HTTP refuses both the quote and signed request with `sold_out`; MCP quotes, calls settlement successfully, creates another queued order and issues a valid certificate. Six paired cases establish this for Aura Walk and Collab on Base, Polygon and Solana. This is a sequential bypass, not a race. An oversell alert after purchase does not prevent the sale. The audit does not establish a missed delivery deadline, so this is not classified as an observed missing-good SEV-1.

Repair: enforce the same weekly inventory and labor-admission rules on both purchase doors before new payment, while allowing authenticated recovery of an existing purchase. Keep this separate from BUY-008: one is accepting a new order, the other is recovering an old one.

Evidence: `stock-exhausted-new-purchase` rows in the door-equivalence evidence. The test buys the catalog-derived stock count rather than setting a fake sold-out counter. `remainingInventory` is enforced in `src/routes/door-checks.ts`; MCP only checks pre-made `item.stocked` goods. `src/services/fulfillment.ts` records and alerts about an oversell after creating the order.

### BUY-006 — P1: observation signatures are overwritten in the purchase response

**Open · input-survival audit.** `spot_check`, `passport_refresh`, `provenance_check`, and `trust_profile` produce a signed observation, but their top-level signature fields are overwritten when the purchase certificate is added. All 48 observations reproduce the packaging failure. The certificate itself verifies; its evidence-hash binding is present. The separately verifiable observation promised by the product cannot be verified with the signature supplied beside it.

Repair: return separate, complete certificate and observation envelopes, preserving each payload, signature and key. Verify both independently through HTTP and MCP. Preserve compatibility or explicitly version the shape.

Evidence: survival rows `artifacts` (`valid:false`, `bound:true`). `src/services/instant-goods.ts` emits observation signatures in extras; `src/services/fulfillment.ts` spreads `patronBlock` after those extras. This is not evidence of a forged certificate or missing subject.

### BUY-007 — P1: Solana retries bypass the purchase cache

**Repaired on `codex/buyer-solana-replay`; release pending.** Both doors use the verified Solana token payer from the request-local verification hook to read and write the existing purchase cache. Accepted same-key retries return the original good without settlement, including fresh signed transactions and processors that would reject rebroadcast. Base58 case is preserved. Missing or malformed verifier identity safely refuses before settlement and is described in discovery. The signed catalog matrix plus refusal/case controls reproduced 304 failures before repair; two additional discovery assertions also failed before publication. Cross-buyer metadata, invalid signatures and concurrent cached requests cannot disclose another buyer's result. Verification: 397 focused tests, typecheck and both Worker bundles pass; full suite delegated to GitHub. Stock/expiry gates, cache loss and durable reconstruction remain separate open findings. Original reproduction follows.

**Open · input-survival audit; live chain outcome unproven.** The same signed Solana request and idempotency key calls settlement again and returns a new certificate under the mocked successful-rebroadcast response. Reproduced in 132 retries; another two HTTP retries encounter BUY-008 first. The fixture returns the same transaction ID on rebroadcast. **This establishes failed request recovery, not a second on-chain debit.**

Repair: derive a verified Solana payer or another securely scoped replay identity, and return the original purchase on retry. Test successful rebroadcast, already-processed responses, and network ambiguity with a realistic Solana transaction/facilitator fixture. Never trust an unauthenticated payer assertion.

Evidence: survival `replay` rows. `src/lib/replay-guard.ts:payerOfVerifiedPayload` only reads EVM `authorization.from`; HTTP and MCP cache paths depend on it.

### BUY-008 — P1: HTTP stock checks block recovery of an already-paid order

**Open · input-survival audit.** After the two available Collab slots are purchased, replay either request over HTTP: `409 sold_out`, `charged:false`, no original receipt. Six cases across three rails. Base and Polygon MCP replays retrieve the purchase successfully. No new payment on the failed HTTP retries, but a buyer who lost the first response cannot recover using the promised identical request.

The equivalence audit additionally reproduces the same failure for Aura Walk after buying all of its advertised slots. Both finite weekly-inventory products are now covered, with six paired recovery cases (one per product/rail); the earlier six cases were two Collab requests per rail.

Repair: allow authenticated retrieval of an existing purchase before enforcing stock for a new purchase. Keep unauthenticated stock refusals and never let replay lookup reveal another buyer's order.

Evidence: `the_collab` survival rows. `src/routes/door-checks.ts` checks stock before the HTTP payment/replay gate; MCP performs its lookup in a different order.

### BUY-009 — P1: valid text advertised as verbatim is changed

**Open · input-survival audit.** The canary remains, but `vector<int>` becomes `vector` and line breaks are flattened. Reproduced in 201 `purpose` values across all paid items/shelves, 12 `detail` values for Aura Walk/Collab, and six Bitcoin anchor `label` values. Unicode and ampersands are included in the test. This is distinct from over-limit truncation: these requests are within their advertised limits.

Repair: store the accepted text exactly and escape it at rendering boundaries. Reject unacceptable input explicitly before payment rather than silently changing its meaning. Inspect every use of `sanitizeText` on a field that promises verbatim retention.

Evidence: rich-text (`round:1`) survival rows contain `args`, expected values, actual signed certificates and stored orders. `src/lib/purchase-args.ts` and `src/lib/sanitize.ts`.

## Discovery and validation

### BUY-002 — P1: invalid HTTP requests receive usable payment terms

**Open · required-input audit.** 154 unsigned invalid HTTP requests receive quotes; MCP generally rejects before quoting. This is the existing deliberate probe policy, but violates this audit's stricter buyer requirement. Signed omission/empty/whitespace/two-invalid requests are safely rejected; a quote alone is not evidence of money loss.

Repair: separate machine discovery of terms from a purchase request whose required data is invalid, so buyers do not sign terms the request cannot fulfill. Keep discovery usable.

### BUY-003 — P2: MCP silently coerces wrong primitive types into text

**Repaired in the MCP string-type validation commit.** Runtime validation now preserves JSON types until the item's published schema judges them, rejects non-string values with the actual input field and received/expected types, and never verifies or settles those requests. All 37 new public-door regressions were observed red before the change; the repaired related gate passed 70 tests. This includes optional string fields and null/array/object values, beyond the original numeric/boolean controls.

**Original required-input audit.** Numeric/boolean required inputs reach paid text products as strings: 30 signed cases across five items. The artifacts exist, but the advertised string schema and runtime behavior disagree.

Repair: reject invalid types consistently before payment and return the actual field defect with `charged:false` and a machine code. `src/lib/purchase-args.ts:toolArgs`.

### BUY-004 — P2: over-limit purpose silently truncates after payment

**Repaired in the purpose-boundary commit.** Every advertised product rejects over-limit purposes before HTTP/MCP quotes, and signed controls on every rail reach neither verification nor settlement. The runtime and schema share the limit, counted in Unicode code points. Allowed purpose text is carried verbatim into the certificate, including surrounding whitespace and whole emoji. All 44 new controls failed before the repair; 105 related tests, typecheck and both dry-run bundles pass afterward. BUY-009/026 remain open for non-purpose fields.

**Original required-input audit.** 150 signed cases accept a purpose exceeding the published 280-character limit and sign a shortened value. Keep separate from BUY-009, which corrupts valid within-limit text.

Repair: reject the over-limit value before payment; do not silently truncate a field promised verbatim.

### BUY-010 — P2: the first MCP purchase shelf forbids a supported field

**Repaired in the shared front-counter schema commit.** `buy_simple` derives its optional fields from the same product schema builder as the theme shelves. Its description no longer denies supported optional fields; only item_id is required, without conditionals. Four served-schema and cross-rail buyer regressions failed before the change and pass afterward, including exact signed-purpose survival and matching prices through both shelves. The combined input-contract gate passed 112 tests across six files, typecheck and both dry-run bundles.

**Original input-survival audit.** `buy_simple` omits `purpose` and declares `additionalProperties:false`, while the item schema and theme shelves advertise it and the runtime signs it. Eighteen canary observations across Hello, Small Blessing, Daily Fortune and three rails identify the mismatch. A literal schema-driven agent cannot send the supported field through the recommended first tool.

Repair: derive the tool's accepted optional properties from its eligible items and update the claim that these items take no other inputs. `src/lib/mcp-tools.ts:frontCounterTool`.

## Price integrity

### BUY-020 — P2: OpenAPI budget guidance quotes an obsolete range

**Open · price-integrity audit.** `info.x-guidance` says prices run $0.004–$25. The served catalog's starting prices range from $0.001 to $300, with optional tiers up to $1,500. All per-item OpenAPI payment extensions match the actual quotes; an agent budgeting from the introductory guidance receives contradictory information.

Repair: derive the range from current items and distinguish starting prices from optional tiers. `src/routes/openapi.ts`. Evidence: `introductory-range` in the [price-integrity report](buyer-price-integrity-2026-09-06.md).

### BUY-021 — P2: purchase receipts recommend a four-tenths-cent good for one-tenth cent

**Open · price-integrity audit.** 231 HTTP/MCP purchase responses recommend `settlement_attestation` via `attest_this_purchase` at $0.001, while that item's discovery, quotes and purchases consistently cost $0.004. The other 18 responses omit this recommendation. Original purchase amounts and receipts agree with the selected terms.

Repair: derive the recommendation's price from its target item, not `CHEAPEST_ON_THE_SHELF`. That global minimum belongs to Spot Check. `src/services/fulfillment.ts`. Evidence: the 249-purchase matrix in the [price-integrity report](buyer-price-integrity-2026-09-06.md).

## Wrong goods and recipient proof

### BUY-022 — P2: the purchased blessing and fortune text is not signed

**Open · wrong-good audit.** Twelve purchases across both doors and all rails return a blessing or fortune beside a valid payment certificate. The actual words do not occur in recipient-verifiable signed evidence. The certificate proves the product and payment, not which text was delivered. Under this audit's hostile-recipient standard, replacing those words leaves the payment proof intact.

Repair: bind the actual text and relevant date to the signed receipt, or return a separately signed good linked to the purchase. `src/services/instant-goods.ts` and the certificate mint order in `src/services/fulfillment.ts`. Evidence: `small_blessing` and `daily_fortune` in the [wrong-good report](buyer-wrong-good-2026-09-06.md).

### BUY-023 — P2: a confession buyer cannot prove which confession was heard

**Open · wrong-good audit; stricter than the current anonymous absolution contract.** Six purchases return an unsigned confession id and a signed payment/absolution certificate, but no recipient-visible evidence of the submitted confession or a commitment to it. Private storage retention passed the earlier survival test; it does not answer this audit's proof question.

Repair: give the buyer a private, verifiable acknowledgement of the exact submission, with an appropriate commitment if plaintext must remain private. Preserve anonymous storage and never publish confession text or a wallet link as the fix. This finding is not a request to remove the product's privacy rule. Relevant paths: `src/services/confessions.ts`, `src/services/instant-goods.ts`, certificate creation.

### BUY-024 — P1: term-service receipts do not prove the purchased commission

**Open · wrong-good audit.** Thirty purchases across standing_watch, conformance_watch, opening_day, operator_statement and recurring_patronage expose subject/term/pass data without signed evidence covering all of it. Opening Day does sign its exact launch URL; its watch's end time is outside that proof. The operator commission's payment rail is not evidence of the requested subject network. Patronage's monthly note is signed, but its pass id and expiry are not.

Repair: issue a signed commission linked to the purchase that binds subject, service/pass identity, start/end and cadence or renewal terms. Keep later signed observations separate: the existing signed probes/passes remain real, and this finding does not claim they are unsigned. A future observation proves what was observed, not necessarily the full service term originally bought. Relevant services: standing-watch, conformance-watch, operator-statement, patronage and instant-goods.

### BUY-025 — P1: completed human work is not verifiably bound to the brief

**Open · wrong-good audit with local human-completion fixtures.** Twelve Aura Walk/Collab purchases complete with a result explicitly naming the submitted brief (and Aura Walk target URL). The correct completed text is retrievable, but neither that work nor its relationship to the brief is covered by the purchase signature. The order response and completion callback are unsigned; the certificate's `saw` hash describes the catalog/input schema, not this buyer's inputs or completed work.

Repair: sign the accepted commission and a completion record binding its id, submitted detail/target and exact deliverable or digest. The automated fixture verifies correspondence and transport, not the quality of a real human's research. No live human order was created or completed. Relevant paths: `src/services/orders.ts`, `src/services/certificates.ts`, `src/services/fulfillment.ts`.

## Boundary fuzzing

### BUY-026 — P1: character cuts damage Unicode in signed fields and badges

**Open · boundary audit.** A name with 79 ordinary characters and one emoji fits the stated 80-character limit, but the store settles and signs 79 characters plus a lone high surrogate. The certificate verifies despite the damaged name. The full matrix also exercises this cut at other signed/stored text limits. A separate position sweep finds that an intact, in-limit signed name becomes a replacement character when the SVG badge clips across its emoji; both HTTP and MCP reproduce it.

Repair: validate and preserve the actual accepted Unicode value before payment. Count limits consistently with the published contract and never cut a surrogate pair or displayed grapheme. Apply the same rule to display clipping. `src/lib/sanitize.ts` ends with a UTF-16 slice; `src/services/badge-svg.ts` uses another for patron names. Widening the limit is a diagnostic, not a production fix. Evidence: [boundary report](buyer-boundary-fuzz-2026-09-06.md), its display controls and the safely escaped surrogate witnesses.

### BUY-027 — P1: malformed optional observation constraints are billed

**Open · boundary audit.** Settlement observations accept malformed optional payer/recipient/nonce strings, or silently omit an invalid amount or payment payload, then settle and return a signed query. These are distinct outcomes: some malformed identifiers remain literally in the query; others disappear. Neither is a validated version of the buyer's requested check. The Good Buyer likewise turns malformed client declarations into its default reading; that leniency is intentional in the implementation but does not satisfy this audit's stricter buyer-input standard.

Repair: validate supplied optional fields before settlement, return a field-specific code with `charged:false`, and distinguish omission from an invalid value. Do not invent a default claim on the buyer's behalf. `src/lib/purchase-args.ts` sanitizes identifiers, uses permissive numeric parsing, and extracts an optional nonce without rejecting a malformed supplied payload. The payment payload cases remove the explicit nonce so that the payload is the sole requested nonce source.

### BUY-028 — SEV-1: an invalid renewal target buys a different pass

Local repair commit: `01489c05`. Original reproduction and repair scope follow.

**Fixed and committed locally; not deployed · isolated boundary reproduction, not a live-money incident.** Create a valid patronage pass, then request renewal with that id plus a question mark. Six fresh payments across both doors and all rails settle, return a different pass with `renewed:false`, and leave the original pass unextended. A nonempty renewal target that cannot be resolved must not silently become a new purchase.

Repair: resolve and validate the supplied pass id before payment; refuse unknown targets rather than falling through to first-time purchase. Preserve the explicit no-id path for a new pass. Review the target again at fulfillment so a disappeared prerequisite cannot recreate the same failure. `src/services/patronage.ts:createOrRenewPass`; the shared purchase validation currently checks mandate references but not patronage renewal references.

### BUY-029 — P1: an invalid callback silently disappears after payment

**Open · boundary audit and local completion controls.** HTTP and MCP accept `callback_url:"x"` on an Aura Walk purchase, settle and queue it. Completing both local fixtures sends zero callbacks. The mapper only copies a callback that passes its URL check, with no prepayment rejection or explicit notice that the supplied callback was discarded. The original good remains retrievable, so this is a broken requested completion channel, not demonstrated loss of the entire artifact.

Repair: validate a supplied callback before charging, including its documented HTTPS requirement and usable length, and distinguish omission from invalid input. Preserve the existing recorded-outcome behavior for a valid callback that later fails. `src/lib/purchase-args.ts` and `src/services/orders.ts`.

## SSRF and target-selection UX

### BUY-030 — P1: a trailing-dot own hostname bypasses the purchase refusal

**Open · isolated target-selection audit.** Eleven probe/human-target products refuse `scvd.store` but let `scvd.store.` past the purchase gate. Nine settle (54 door/rail observations); Passport Refresh and Trust Profile refuse deeper in fulfillment and instead return a generic 500 after verification (12 observations). The generic answer says to wait and retry, although the target deterministically remains unacceptable. Six first-watch controls reproduce scheduled observations of the alias. No live self-fetch or paid incident is claimed.

Repair: canonicalize the target and configured own hostname once and use the existing guard before issuing usable terms or verifying payment. Keep target-policy failures as specific `charged:false` refusals, including late defense-in-depth failures. `src/lib/purchase-args.ts:targetVerdict` passes an empty own hostname into a guard that already strips root dots, then compares the original host strings. Evidence: [target-selection audit](buyer-target-selection-2026-09-06.md).

### BUY-031 — P1: paid human callbacks skip destination validation

**Open · target-selection audit; application egress gap, not proven live private-network access.** Aura Walk and The Collab accept private/local/metadata callback URLs, plain HTTP despite the published HTTPS requirement, URL credentials and own-host callbacks. All 480 cases designated for prepayment refusal settle and attempt a callback on fixture completion. The existing probe-target protections do not run on this paid callback path. Trade-account callbacks have a separate validator, so the protection is not absent everywhere.

Repair: validate a supplied completion destination before purchase, with a field-specific no-charge refusal; recheck at dispatch. Reuse a deliberate public HTTPS callback policy without silently dropping invalid values. Address DNS resolution limits explicitly rather than claiming a hostname string check closes them. `src/lib/purchase-args.ts` copies any syntactically valid HTTP(S) callback; `src/services/orders.ts` dispatches it. This extends BUY-029's silently discarded malformed callback with syntactically valid but unsuitable destinations.

### BUY-032 — P1: callback redirects are not confined to approved destinations

**Open · local redirect simulation.** Forty-eight public-to-private or chained callback cases follow the fixture's 307 redirect toward a private destination. The initial callback fetch supplies no redirect policy; the fixture then models runtime refusal. This is evidence of missing application redirect confinement, not successful access to internal infrastructure. Probe products' manual redirects pass the equivalent controls.

Repair: refuse redirects for completion callbacks or apply the same destination policy at every hop, with bounded hops and a deliberate policy for forwarding the completed deliverable. Record a redirect refusal as a callback outcome visible to the buyer. `src/services/orders.ts:completeOrder`. Validating only the initial URL, as proposed in BUY-031, does not close this path.

### BUY-033 — P2: buyers cannot see callback failure or its retry policy

**Open · completed-order HTTP/MCP controls.** Twelve failures (HTTP 503, simulated blocked DNS, or private redirect) are correctly recorded in `order.webhook`, but both `/api/order/{id}` and MCP `check_order` omit that field and still say “Delivered, as promised.” Four successful controls confirm that the test distinguishes success from failure. The completed artifact remains available: this is missing delivery-channel status, not loss of the completed good.

Repair: include the recorded callback outcome and one-attempt/no-retry semantics in the shared buyer order status, with clear polling/retrieval guidance. Preserve completed-work status separately from callback success. `src/lib/order-status.ts:orderStatusBody` drops the outcome that `src/services/orders.ts:completeOrder` writes. This corrects the earlier audit's assumption that recording a callback outcome made it buyer-visible.

## Human-queue products

### BUY-034 — SEV-1: a settled human purchase can have no order and false delivery recovery

**Partial repair: false HTTP completion removed.** Finding a certificate no longer deletes the outstanding delivery or claims `already_delivered`. Failed/incomplete certificate lookups also stay within the paid-failure response boundary. Identical retries return `delivery_failed`, `charged:true`, `charged_again:false`, the original transaction/network, and a recovery reason while preserving the original obligation. The certificate link explicitly describes receipt verification rather than completed work. Twenty-four signed public-door fault cases across four products and Base/Polygon failed before repair; the related 63-test gate, typecheck and both Worker builds passed. Four final contract checks were rerun against the original source and failed. This does not reconstruct missing orders/artifacts, close BUY-034, or change Solana retry handling.

**Open · persistent storage-failure fixture, not a live-money incident.** Human order creation follows settlement and certificate minting. Failing the order write through its retries, then restoring storage, leaves eight Base/Polygon purchases across both products and doors without an order after an identical paid retry. HTTP says `already_delivered:true` and returns the certificate; MCP asks for payment again. A payment certificate is not the commissioned work or even its accepted queue entry. Four Solana controls recover an order by rebroadcasting the same transfer, verified by matching transaction identifiers; those are recoverable, not evidence of another debit.

Repair: make acceptance of the human obligation durable before exposing a completed delivery state, and recover the missing order from the original accepted inputs without another payment. A certificate alone must not close a human delivery intent or justify “already delivered.” Preserve stable order identity through partial failures. Relevant paths: `src/services/fulfillment.ts`, `src/services/orders.ts`, `src/lib/payment-gate.ts` spent-payment recovery, and the corresponding MCP recovery path. Evidence: [human-queue audit](buyer-human-queue-2026-09-06.md), with initial certificates and same-request recovery results.

**Post-settlement extension.** The [fault-injection matrix](buyer-post-settlement-2026-09-06.md) reproduces this family on Context Anchor and Service Audit as well as Aura Walk. Product writes, fulfillment serialization and the settlement-to-certificate reverse-index write can fail after the certificate exists but before the good does. HTTP response-serialization failures also leave real artifacts/orders stored without returning their retrieval handles on retry. Preserve the actual good's identity and completeness in recovery; a certificate cannot stand in for either. These are failed ordinary buyer recoveries, not proof that no keeper could ever repair stored state manually.

### BUY-035 — P1: concurrent buyers oversubscribe the last human slot

**Open · deterministic local concurrency control.** Two requests pass admission while one per-item slot remains, then complete payment verification together. Both settle and create an order on HTTP and MCP across all three rails: 12 controls. Aura Walk ends with six open orders against five; The Collab ends with three against two. Sequential HTTP capacity enforcement passes, so this is distinct from the absent MCP capacity gate in BUY-013. The implementation already acknowledges an oversell race and alerts after inventory excess; that is a manual backstop, not prevention.

Repair: reserve human capacity atomically before payment can settle, with safe release/recovery semantics and one shared admission path for both doors. Rechecking an eventually consistent counter alone is not a reservation. Preserve the existing alert for exceptional oversells. Relevant paths: `src/services/queue-capacity.ts`, `src/routes/door-checks.ts`, `src/services/fulfillment.ts` after `createOrder`.

### BUY-036 — P2: capacity refusal explains itself only in prose

**Open · HTTP human-queue audit.** Thirty-six at-item-cap, at-global-cap and capacity-filled-after-quote requests safely refuse with a clear explanation and next steps, but their bodies omit `charged:false` and a machine-readable refusal code. The human understands “Nothing charged”; a literal agent must infer it from text. This does not claim the prose is unhelpful or that these HTTP refusals moved money.

Repair: include the standard no-charge state and a stable capacity refusal code on the existing response, preserving its useful explanation, counts and alternatives. `src/routes/door-checks.ts` capacity response. The settlement-decline envelope has a related omission already tracked under BUY-011.

## Post-settlement failure injection

### BUY-037 — SEV-1: MCP cannot reconstruct some settled purchases even with the original key

**Open · local confirmed-settlement fault injection, not a live-money incident.** Eighteen Base/Polygon cases fail certificate generation, certificate signing or certificate KV storage after the facilitator fixture confirms payment. An identical MCP request with the original payment and idempotency key does not retrieve the promised good. All equivalent HTTP cases recover. The original MCP failure reports `delivery_failed` and `charged:true`; its promised manual intervention is not an exercised reconstruction path. Unlike BUY-014, the original key was not lost or replaced.

Repair: give both paid doors the same authenticated, idempotent reconstruction path from the original settlement and accepted inputs. A cache miss after partial fulfillment must not turn an existing purchase into a demand for new payment. Keep payment identity distinct from whether an authorization may be spent again. Evidence: [post-settlement report](buyer-post-settlement-2026-09-06.md), three fulfillment representatives through both doors and all three rails. Solana same-transfer recovery is recorded separately and does not prove another debit.

### BUY-038 — P1: MCP can claim no charge after paid response serialization fails

**Open · raw response controls.** After fulfillment and cache persistence, a failure while encoding the tool response escapes the payment-aware exception boundary. Three raw MCP cases, one per rail, return a generic HTTP 500 saying “no charge for the noise” despite confirmed settlement. The identical retry retrieves the cached good. This is a false payment-state message on a recoverable delivery, not demonstrated loss of the artifact or a second transfer.

Repair: keep response flattening/serialization within the payment-aware failure boundary, returning the confirmed charge state and an authenticated recovery handle when encoding fails. Ensure delivery completion and cleanup do not depend on an unencoded response being assumed delivered. Relevant paths: `src/routes/mcp.ts` after `fulfillPurchase`, `toolText`, and the global error handler.

## Findings discovered during repair

### BUY-039 — P1: discovery labels a paid delivery failure as unpaid

Local repair commit: `0b61e5fc`. Original reproduction and repair scope follow.

**Fixed and committed locally · not deployed.** While publishing the unknown-receipt contract, the served `/menu/daily_fortune` listing described `delivery_failed` with `charged:false`, even though its actual response means money settled. `doorErrors()` assigned false to every entry, including the paid-delivery failure. A buyer trusting discovery could treat this as permission to purchase again.

Repair: derive payment state from each error's contract. Safe refusals remain false, `delivery_failed` is true, and `invalid_settlement_receipt` is explicitly null. Publish the new code on MCP purchase tools as well as HTTP listings. Three discovery regressions were observed red before these changes; all pass afterward in `test/settlement-receipt-integrity.spec.ts`. This fixes discovery metadata; it does not close the separate runtime response-serialization defect BUY-038.

## Coverage to retain and extend

The [input-survival report](buyer-input-survival-2026-09-06.md) records the full tested denominator, passing controls and limitations. The initial `#481` URL/bundle subjects survive; the detector was demonstrated red by temporarily dropping the mapper's URL and restoring it. First scheduled observations and human-order completion/polling/callbacks also run locally.

The [HTTP/MCP equivalence audit](buyer-door-equivalence-2026-09-06.md) compares matching requests from identical saved state. It confirms BUY-002, BUY-008 and BUY-010; adds BUY-011 and BUY-012; and finds no difference in the tested successful purchase outcomes after allowing protocol envelopes, transport provenance and purchase-specific identifiers. Equal behavior can still be equally defective, as the earlier survival audit establishes.

Future prompts can add timeout/ambiguous settlement, payload rejection, longer-term storage/claims recovery, subject-chain variations, full watch terms, and commercial artifact-quality checks. These were not established by a successful mocked payment or a valid certificate signature. Add findings here without silently marking earlier entries fixed.

The [quote-to-fulfillment audit](buyer-quote-fulfillment-2026-09-06.md) adds near-expiry authorization and dependency-change coverage. It confirms BUY-012 after an outstanding quote and adds BUY-013. Mocked settlement success does not establish live chain finality or completion of a multi-day promise.

The payment-ambiguity suite also extends BUY-007: Solana rebroadcasts can mint new certificates for one simulated transfer, and fresh transactions with the same key can debit again. These are distinct: rebroadcast alone is not evidence of a second debit. BUY-011 remains visible in MCP settlement-failure envelopes.

The cross-rail audit buys eight representative products through both doors on all three advertised rails using signed fixtures. It extends BUY-007 with 16 Solana duplicate-artifact cases, and leaves the earlier payment-ambiguity findings open. Payment rail and the chain being observed by a complex product are distinct.

The price-integrity audit checks all 32 catalog items, all offered tiers, both doors and all MCP shelf memberships on all three rails. All 249 original purchases match quoted and simulated settled amounts; the two new findings concern contradictory price guidance. No real money moved.

The wrong-good suite defines commercial assertions for all 32 items, checks only recipient-visible evidence, and reproduces BUY-005 with six newly paid corrected claims. It adds BUY-022 through BUY-025. It accepts genuine subject proof through a certificate-bound digest even where BUY-006 still breaks the standalone signature, rather than duplicating that finding. Bundle membership/order, explicit duplicate refusals, exact multiline context, Bitcoin digest and subject-chain fixtures pass.

The [boundary audit](buyer-boundary-fuzz-2026-09-06.md) covers every catalog buyer field: 14,460 core observations across 116 product/field memberships, with 263 supplemental controls. It reproduces existing input-loss findings and adds BUY-026 through BUY-029. A temporary Unicode control passed, exact source restoration returned the baseline failures, and no production fix was retained. All payments were simulated.

The [target-selection audit](buyer-target-selection-2026-09-06.md) exercises 14 URL-field memberships on 13 products, with 2,880 core observations and 54 scheduled/raw-error/callback-visibility controls. Direct probe refusals give useful explanations before verification; unsigned HTTP terms still reproduce BUY-002. It adds BUY-030 through BUY-033. All destinations and payment rails are simulated; live DNS/edge egress protections remain unverified.

The [human-queue audit](buyer-human-queue-2026-09-06.md) adds 590 observations covering admission, callbacks, polling, deadline boundaries, concurrency and order-write recovery. All 14 first-view SLA checks and 72 deadline-boundary classifications pass; completed work is retrievable without a callback or prior polling. It reproduces BUY-007, BUY-011, BUY-012/013 and BUY-033, and adds BUY-034 through BUY-036. Settlement rejection is counted as no money moved, not as a charge merely because settlement was attempted.

The [post-settlement suite](buyer-post-settlement-2026-09-06.md) reaches every requested failure category on three fulfillment representatives. Of 126 injected cases, 68 recover, 6 fail before settlement and 52 fail ordinary same-request recovery; all 18 fault-free controls pass. Three raw MCP encoding controls add false no-charge responses. It expands BUY-034 and adds BUY-037/038. Manual Claims/reconstruction and live-chain finality were not exercised; no production fixes are retained.
