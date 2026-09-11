# Buyer repair checklist

Checked means the repair is committed and its regression was observed failing before the fix and passing afterward. It does not mean deployed. PRs #540, #544, #549, #551 and #552 have merged; #541 has merged. All payment tests use local fixtures.

The finding rows below are the current status; dated entries retain earlier status and validation counts.

The full audit contains six SEV-1 findings. The three wrong-good cases are BUY-001, BUY-005, and BUY-028; the other three require durable payment and delivery recovery.

## SEV-1 findings

- [x] **BUY-001 — SEV-1: empty essential text can settle** — fixed locally; commit ed57dc36; PR #540.
- [x] **BUY-005 — SEV-1: a new case-file purchase returns the old claim** — fixed locally; commit 929d6b3a; PR #540.
- [x] **BUY-017 — SEV-1 fault case: lost settlement acknowledgement can leave no artifact and report “No charge”** — complete: retained purchase intents provide truthful status and original-good recovery for every current catalogue product and newly recorded commission/publication purchase. Historical retries cannot invent replacement goods; unrecoverable obligations remain open until evidence-backed resolution. See the historical retry guard below. This closes the tested repair, not an inventory of production customer refunds.
- [x] **BUY-028 — SEV-1: an invalid renewal target buys a different pass** — fixed locally; commit 01489c05; PR #540.
- [x] **BUY-034 — SEV-1: a settled human purchase can have no order and false delivery recovery** — human-purchase repair complete: checkpointed orders reconstruct; authentic legacy orders return their original work; irrecoverable briefs require a durable signed resolution backed by completed original work or a finalized full refund. This is a tested repair and manual-resolution mechanism, not a claim that production customers have been refunded. See the resolution evidence below.
- [x] **BUY-037 — SEV-1: MCP cannot reconstruct some settled purchases even with the original key** — complete: HTTP and both MCP profiles recover authenticated original goods, preserve unresolved historical obligations and return verified resolutions. A matching request digest alone cannot authorize replacement fulfillment, and an unlinked spent payment cannot become a fresh quote. See the historical retry guard below.

## How to read progress

The parent count measures complete original findings, not commits or equal-sized units of work. The recovery findings span products, HTTP/MCP profiles, rails, partial writes and historical records. The checked substeps below are completed work inside those findings; some overlap, so they must not be presented as a count of unique fixes. CI/build repairs are tracked separately and do not close a buyer finding.

**30/39 original findings are complete, including all 6/6 SEV-1s.** Existing catalogue recovery coverage is derived from `supportsArtifactRecovery()` and `MENU_ITEMS`; all 33 current products are admitted. Newly recorded commission/publication recovery, historical original-order retrieval, evidence-backed resolution and the final legacy retry guard complete the recovery parents. Atomic admission also prevents concurrent fresh authorizations from charging the same new keyed purchase twice. Original signed payments now recover retained goods or private status after expiry without the original key. The remaining P1/P2 findings below retain their own scope.

## Completion-callback, target and capacity evidence — 2026-09-11

BUY-029/030/031/032/033/036 are repaired together. Unsafe supplied human-order callbacks fail before a new quote or verification and are rechecked before dispatch. Redirects are not followed; outcomes and the no-automatic-retry policy are visible through HTTP and MCP polling beside the completed goods. Own-host aliases are normalized. HTTP catalogue and commission capacity refusals carry the same machine-readable no-charge facts as MCP. The URL policy does not resolve DNS or claim protection against DNS rebinding.

Older authenticated payments still retrieve their retained original goods when today's destination policy would refuse a new purchase. Tests cover both human products, every checkout rail and both MCP profiles, legacy/managed callback records, all affected probe targets and capacity refusals. No live payment, completion callback or human order was sent.

Validation: **12,268 passed across 658 files**, one existing key-continuity skip, zero failures; 2,357.86 seconds. All 1,367 source/test/config hashes matched before and after the full run. **509 regression failures** were observed with the corresponding source fixes removed. Typecheck, both Worker bundles, native startup, audit, claims and docs checks passed. BUY-002's broader HTTP quote policy and BUY-035's atomic capacity reservations remain separate PRs.

## Recovery SEV-1 status

The checked substeps below are completed repairs, not provisional work. An open parent does not mean those repairs failed. The original audit and regression evidence use local fixtures, including deliberately constructed legacy state; this checklist is not an inventory of unresolved production customer orders.

- **BUY-017 — complete:** original purchase records survive ambiguous settlement and drive truthful status, reconciliation and original-good delivery. Missing historical goods stay owed and require verified resolution; retry input cannot replace them.
- **BUY-034 — complete:** original human work is recovered when retained; missing briefs cannot be replaced by retry input or a desk preview. Authenticated completed work or a finalized refund resolves the obligation durably.
- **BUY-037 — complete:** HTTP and both MCP profiles recover retained original goods or report the same unresolved historical obligation without creating new payment terms. Signed evidence-backed resolutions precede delivery/replay.

These are tested repair mechanisms, not production-customer inventory or live-refund claims. BUY-014/015 now separate authenticated purchase recovery from current authorization spendability; historical records lacking an authentication proof or retained association still require private-status, Claims or keeper resolution. Capacity reservations and ordinary signatures binding human work to its brief remain separate findings.

## Remaining findings

- [ ] **BUY-002 — P1: invalid HTTP requests receive usable payment terms** — open.
- [x] **BUY-003 — P2: MCP silently coerces wrong primitive types into text** — fixed in `94561d25`.
- [x] **BUY-004 — P2: over-limit purpose silently truncates after payment** — fixed in `35df82f6`.
- [x] **BUY-006 — P1: observation signatures are overwritten in the purchase response** — complete for all four audited products: Spot Check, Provenance Check, Passport Refresh and Trust Profile carry independently verifiable observation envelopes beside their purchase certificates. See the proof-completion evidence below. Durable response-loss recovery remains BUY-017/037.
- [x] **BUY-007 — P1: Solana retries bypass the purchase cache** — repaired on `codex/buyer-solana-replay`: verified Solana payer scopes cached retries; missing identity safely refuses settlement. Merged in PR #551; production release is a separate status.
- [x] **BUY-008 — P1: HTTP stock checks block recovery of an already-paid order** — authenticated cached/recoverable purchases now precede weekly stock, shutter and capacity admission. MCP also preserves paid replay when its shutter closes; new sales still run their admission checks.
- [ ] **BUY-009 — P1: valid text advertised as verbatim is changed** — open.
- [x] **BUY-010 — P2: the first MCP purchase shelf forbids a supported field** — fixed in `df3b1e64`.
- [x] **BUY-011 — P1: MCP returns a settlement refusal as a successful tool result** — repaired: both MCP profiles return an error tool result with the same refusal reason and no-charge state as HTTP.
- [x] **BUY-012 — P1: MCP accepts new labor orders after the weekly stock limit** — MCP now checks the shared weekly inventory before quotes or new settlement; authenticated paid replay remains available. Both payment profiles return the HTTP waitlist instructions.
- [x] **BUY-013 — P1: MCP sells labor after the open-work queue reaches its ceiling** — both MCP profiles now apply the shared per-item/global queue verdict before quotes or new settlement, including refusal when counting is incomplete. Paid recovery precedes admission.
- [x] **BUY-014 — P1: a spent payment without its original key does not retrieve the receipt** — original signed payments locate authenticated retained goods or private status without the old key. Missing original goods remain owed; unsigned payer assertions reveal no purchase facts. See signed-payment recovery below.
- [x] **BUY-015 — P1: payment expiry blocks receipt replay, and the suggested replacement key can charge again** — recovery verifies ownership independently of spendability, survives verifier/startup outages and retains supplied keys in refusal instructions. Exact previously verified contract payments use retained one-way fingerprints; older usable EVM/Solana signatures are checked cryptographically. See signed-payment recovery below.
- [x] **BUY-016 — P1: concurrent fresh authorizations bypass the same-key safeguard** — new keyed purchases atomically retain one payment identity before settlement. Concurrent duplicates retrieve the original purchase or its status; storage failure refuses another settlement. See the atomic-admission evidence below.
- [x] **BUY-018 — P1: a Solana signer can claim an EVM payer's cached receipt** — fixed locally; commit 005df923; PR #540.
- [x] **BUY-019 — P1: malformed Solana settlement IDs are signed into receipts** — fixed locally; commit 1a0b3827; PR #540.
- [ ] **BUY-020 — P2: OpenAPI budget guidance quotes an obsolete range** — open.
- [ ] **BUY-021 — P2: purchase receipts recommend a four-tenths-cent good for one-tenth cent** — open.
- [ ] **BUY-022 — P2: the purchased blessing and fortune text is not signed** — open.
- [x] **BUY-023 — P2: a confession buyer cannot prove which confession was heard** — complete: the buyer receives a private ed25519-signed receipt binding the exact stored confession, original date and purchase certificate. Public verification and the anonymous drawer remain separate. See the personal-goods evidence below.
- [x] **BUY-024 — P1: term-service receipts do not prove the purchased commission** — complete for all five audited products: Standing Watch, Conformance Watch, Opening Day, Operator Statement and Recurring Patronage now retain independently signed purchase commissions naming the exact subject, service identity and original dates. Patronage grants identify each paid renewal separately. See the term-product evidence below.
- [ ] **BUY-025 — P1: completed human work is not verifiably bound to the brief** — open.
- [ ] **BUY-026 — P1: character cuts damage Unicode in signed fields and badges** — open.
- [ ] **BUY-027 — P1: malformed optional observation constraints are billed** — open.
- [x] **BUY-029 — P1: an invalid callback silently disappears after payment** — complete: Supplied human-order callbacks are validated before quotes or payment; malformed values cannot disappear silently. See the completion-callback evidence below.
- [x] **BUY-030 — P1: a trailing-dot own hostname bypasses the purchase refusal** — complete: Probe purchases compare canonical own hostnames, including case and trailing DNS root dots. See the completion-callback evidence below.
- [x] **BUY-031 — P1: paid human callbacks skip destination validation** — complete: Human completion callbacks are validated at admission and again before dispatch. See the completion-callback evidence below.
- [x] **BUY-032 — P1: callback redirects are not confined to approved destinations** — complete: Completion callbacks use manual redirects; no redirect destination is followed. See the completion-callback evidence below.
- [x] **BUY-033 — P2: buyers cannot see callback failure or its retry policy** — complete: HTTP order polling and MCP check_order expose callback outcomes, retrieval and the no-automatic-retry policy. See the completion-callback evidence below.
- [ ] **BUY-035 — P1: concurrent buyers oversubscribe the last human slot** — open.
- [x] **BUY-036 — P2: capacity refusal explains itself only in prose** — complete: HTTP catalogue and commission capacity refusals return capacity_unavailable, charged:false and their counts, matching MCP. See the completion-callback evidence below.
- [x] **BUY-038 — P1: MCP can claim no charge after paid response serialization fails** — fixed in `6b23454c`; PR #541 (merged).
- [x] **BUY-039 — P1: discovery labels a paid delivery failure as unpaid** — fixed locally; commit 0b61e5fc; PR #540.

## 2026-09-08 — Legacy human-order audit

- [x] Refuse to build a human order from the retry's brief when the old HTTP delivery record contains only a desk preview. Identical and changed briefs sharing the same 600-byte preview both leave the original obligation open.
- [x] Give HTTP and both MCP payment profiles the same recorded-payment failure when an authenticated legacy human purchase has no complete input binding. Do not offer a fresh payment as recovery, create an order/certificate, or close the delivery row.
- [x] Withhold purchase details when the old record's payer, product or transaction does not match. Report status as unknown rather than inventing payment identity, and never infer the historical chain from today's offer.
- [x] Preserve automatic recovery when a newer purchase retained its complete brief but could not open the artifact journal. Return its protected status handle, then reconstruct from the original acceptance time, brief and terms without another settlement.
- [x] Recover an existing legacy order/certificate association when sufficient original records survive, preserving its brief, SLA, ID and completed work. See the retained-order retrieval evidence below.
- [x] Establish explicit resolution evidence for records that cannot yield the original work; require matching completed work or a finalized full refund before clearing the obligation. See the signed-resolution increment below.

These are synthetic historical records, not evidence of unresolved production customers. The new public-door matrix exercises both human products through HTTP and both MCP profiles on Base and Polygon. The initial 72 cases failed before the guard; the additional 48 product/transaction mismatch cases failed before their identity checks. All 120 passed alongside the existing recovery controls. Six additional capture-before-artifact cases failed before preserving the newer purchase record; the resulting integration gate passed 267 cases across six files. The historical certificate-only fixture now removes the newer purchase journal and uses its actual signed payer; all 24 obligations remain covered. The final related gate passed 203 tests across six files. The shared recovery description stays within the unchanged MCP catalog budget; detailed instructions remain in the failure response. A separate full run caught one stale hand-maintained error-code list; its guard now reads the published contract and includes an unpublished-code negative control. Known legacy payment failures retain the contract's HTTP 500, and identity-unknown records use its HTTP 503. The completed guard does not claim to reconstruct a missing brief or to issue refunds automatically. At that guard commit, both follow-up steps above remained open; the retained-order step is now completed below. Unrelated instant-product families do not gate BUY-034.

Final local validation passed all 591 files: 7,766 tests passed with one existing conditional key-continuity skip (799.03 seconds). Typecheck, both Worker dry-run bundles, native Worker startup and the 203-case focused gate passed. The existing legacy-fixture, source-code-list and MCP catalog-size checks caught integration issues locally; their corrections preserve the money-safety assertions and the original catalog ceiling. No live payment was submitted.

## 2026-09-08 — Retained legacy human-order retrieval

- [x] Authenticate a surviving certificate against the verified payment's payer, product, transaction and network, then recover its unique original order. A certificate signature that omits the payment fields or uses an unrecognized key cannot authorize this retrieval.
- [x] Return the original brief, order ID, acceptance time, purchased SLA, amount and current completed work through HTTP and both MCP profiles. Changed retry arguments create no replacement work. The response states that the certificate signature does not cover the historical order or completed work; BUY-025 remains separate.
- [x] Preserve retrieval after the delivery-intent row closes, including work completed between retries. If neither an authentic association nor an open payment record can be read, return unknown payment status without asking for a new payment.
- [x] Keep incomplete scans, duplicate associations, malformed records, read failures and mismatched identities unresolved. No order, certificate, callback, inventory sale or settlement is created by recovery.

The synthetic legacy matrix covers both human products, Base and Polygon, and all three transport profiles. The final regression was run with the tracked source fix stashed: 27 failures, including the 24 original-order retrieval cases and three missing-delivery-record refusals. Negative controls also cover signed certificates naming another payer/product/transaction/chain, unsigned payment fields, an unrecognized signing key, damaged or missing work and incomplete storage reads. Recovery still requires a verifiable payment and a retained spent-payment record; expired verification and missing recovery handles remain BUY-014/015. This does not inventory production customers or reconstruct data that no longer exists.

Final local validation: all 597 test files passed, with 8,118 tests passing and one existing skip (801.37 seconds). The focused recovery gate passed 234 tests across four files; typechecking, both Worker dry-run bundles, native Worker startup, audit, claims and docs checks also passed.

At this retrieval increment, BUY-034's remaining step was explicit resolution evidence when the original work could not be recovered. Parent findings remain open; the completed retrieval substep does not imply an automatic refund. The next fix must also correct `runDeliveryAudit`'s alert text: it currently calls the truncated query preview enough to produce the goods, although that preview is not the retained original brief. A resolution must cite the actual work or refund record rather than treating that preview or an outcome label as proof.

## 2026-09-08 — Evidence-backed human resolution

- [x] Refuse an outcome label alone. Fulfillment requires the authenticated original completed order; a refund requires the original finalized native-USDC payment and a subsequent full refund to its payer on the same network. An unrelated transfer, wrong asset/amount/recipient/chain, failed transaction, pending finality or unavailable RPC leaves the obligation open.
- [x] Sign the resolution statement and its work/refund evidence; commit it before projecting the desk record or deleting the intent. Preserve earlier signed revisions. Identical retries repair interrupted publication without reading the chain again or creating another resolution.
- [x] Allocate a refund transaction to at most one purchase, including simultaneous resolutions. House absorption requires the exact registered house payer; Solana casing is preserved.
- [x] Check durable resolutions before HTTP/MCP delivery caches. Return retained completed work or a terminal refunded response without settlement, even after order/desk records disappear. Protected purchase status returns the resolution; a later recovery alarm creates no replacement order.
- [x] Label the desk and alert query as a possibly truncated preview. All resolution forms expose network, completed-order and refund evidence fields.

The entry-point regression was run with its tracked production changes stashed while retaining the storage implementation: 46 tests failed and three independent controls passed. With the fix restored, the final focused gate passed 211 tests, including both HTTP and MCP catalog/source-contract guards. Two additional stale-status controls were observed failing before removing the old queued snapshot. Additional integration runs covered the existing legacy-order, capture and paid-retry paths. The final full suite passed all 599 files: 8,177 tests passed with one existing skip (416.13 seconds). Typecheck, both Worker dry-run bundles and native Worker startup passed. Rebase onto merged #582 changed no tested source or test bytes. The explicit Durable Object write guard also passed after recording the three reviewed atomic writes; its checks against KV aliases remain enforced.

Refund observations cover Base, Polygon and Solana using local finalized-chain fixtures. Buyer retry equivalence covers HTTP and both MCP profiles on Base/Polygon; protected status is tested independently of the spent-nonce row. This request sends no refund. The keeper transfers funds, then supplies evidence. Partial refunds and allocating one refund transaction across multiple purchases are refused. A missing or unverifiable original payment identity stays open for recovery rather than being guessed. Expired payment verification and missing private handles remain BUY-014/015. Ordinary human-work signatures remain BUY-025; this increment signs only explicitly resolved work.

BUY-034's human-order scope is closed by the combined checkpoint, legacy retrieval and explicit-resolution proofs. BUY-017 and BUY-037 still own the remaining artifact families and historical nonhuman obligations. No production-order inventory or live payment was performed.

## Verification and scope

Related repairs are batched into one PR, with separate coherent commits and one full-suite run on the completed batch, as requested on 2026-09-08. Focused regressions run during development. The focused regressions exercise the public purchase doors, with the served catalog and local payment processor fixtures; they do not establish live-chain settlement or production deployment.

The broad untracked audit probes intentionally fail for unresolved findings. They remain separate from the normal regression gate; they have not been deleted or relabeled as passing.

Final validation on the repaired current-main snapshot covered 552 test files: 551 passed, with one outdated source-inspection assertion failing (5,244 tests passed, one failed, one skipped). The assertion was corrected to recognize an awaited assigned result, with negative controls for unawaited writes. Its final recheck and the affected receipt/discovery suites passed all 22 tests across three files. Typechecking and both Worker dry-run builds passed. No production source changed after the full run. See the [verification record](buyer-repair-progress-2026-09-06.md).

## BUY-037 progress (finding remains open)

- [x] Reconstruct the reproduced pre-certificate failures using the original verified payer, chain, amount, receipt and full input digest — `f8f8d34f`.
- [x] Prevent overlapping recoveries from minting competing certificates, using a durable per-transaction claim — `f8f8d34f`.
- [x] Retrieve an already completed durable response after cache loss or a connection failure after the completion write; authenticate its saved owner, chain, transaction, product and full inputs — `3ce5d0bc`.
- [x] Resume checkpointed Context Anchor certificate/anchor publication and final-response failures through HTTP/MCP on Base/Polygon, preserving the exact signed good across concurrent retries. See the Context Anchor entry in the progress log.
- [x] Resume checkpointed human orders through HTTP/MCP on Base/Polygon without overwriting completed work or counting inventory twice; preserve the original SLA and acceptance time.
- [ ] Extend durable resumption to remaining paid products and their partial external side effects; interrupted legacy claims still need safe resolution.
- [ ] Recover retained purchases that predate the complete input binding. Never infer their original inputs from a truncated desk preview.

The completed substeps passed 206 focused tests across nine files, typechecking, and both Worker dry-run builds. The full suite is delegated to GitHub as requested. The three SEV-1 findings BUY-017/034/037 stay unchecked; successful first reconstruction is not the complete durable-recovery guarantee.

Completed-result follow-up: four public MCP regressions failed at receipt replay on the prior code (Base/Polygon, cache loss/completion-response loss); all pass with authenticated durable reads. Final focused gate: 212 tests across nine files, typecheck, and both dry-run bundles. This does not cover a crash before the complete result is saved. PR #541 is merged; the broader recovery findings remain open. The storage prerequisite and earlier preview-upload failure were resolved; see the release prerequisite below.

BUY-038: all 30 new failure-injection cases were observed red before the repair and green afterward. Coverage includes Base/Polygon/Solana, legacy/standard payment profiles, tool text/JSON-RPC/modern envelope encoding, and EVM cached replay. Identical EVM retries return the original verifiable artifact without settlement, and only an encoded response closes its delivery row. The final related gate passed 236 tests across seven files, typecheck, and both dry-run builds. Solana retry recovery remains BUY-007; partial fulfillment remains BUY-034/037.

## Solana retry repair

BUY-007: HTTP and both MCP payment profiles now use the Solana token payer returned by successful verification, carried through request-local state. Valid same-key retries return the original cached good before settlement. Solana public-key case is preserved; EVM address normalization stays compatible. A missing or malformed verified payer refuses with `payment_identity_unavailable`, `charged:false`, and an instruction to retain the original payment and key; both discovery doors publish that outcome.

The catalog-wide signed-fixture regression covers 32 products, three doors and three retry modes: identical transaction, fresh transaction, and a processor that rejects rebroadcast. The original 304 runtime checks and two discovery checks were observed red. The broader focused gate passed 397 tests across nine files, with typechecking and both Worker dry-run builds passing. Cross-buyer, tampered-signature and concurrent cached-retry controls preserve authentication. No live payment was submitted; the full suite runs on GitHub.

This closes the missing Solana cache identity, not every retry failure. Stock admission before replay (BUY-008), unavailable/expired verification (BUY-015), concurrent initial charges (BUY-016), and durable recovery (BUY-017/034/037) remain open.

## Input-contract repairs

BUY-003: non-text JSON is refused for every advertised string field before quoting or verification. The public-door matrix covers all 32 current products, five invalid JSON types, and signed controls for five buyer fields on every offered rail. All 37 new tests failed on unchanged source. The repaired gate passed 70 tests across four files and typechecking. The full suite remains delegated to GitHub.

BUY-004: the schema and validator share one purpose limit. Both doors reject excess length before quoting or verification; accepted text is signed exactly as sent, with Unicode code-point counting and no post-payment truncation. All 44 new controls were observed red before the fix. The related gate passed 105 tests across four files, typecheck, and both Worker dry-run bundles. This also fixes purpose-specific whitespace/Unicode loss; BUY-009 and BUY-026 remain open for their other affected fields.

BUY-010: buy_simple now derives all optional receipt fields from its eligible products, keeping only item_id required and no conditional branches. The served-schema and three-rail literal-buyer controls all failed before the fix; they now verify purpose survival and price agreement through both simple and theme shelves. The final combined gate for BUY-003/004/010 passed 112 tests across six files, typecheck and both Worker dry-run builds. BUY-002 remains open: changing bare HTTP purchase URLs from discovery probes to strict purchase requests requires a coordinated discovery/client transition.

Recovery release prerequisite: PR #542 adds only the coordinator storage class/binding/migration. Cloudflare preview error 10211 requires this additive migration to be applied by main's regular deployment before #541's preview can upload. PR #542 merged as `e00307bd`; its production build succeeded. The #541 consumer preview also passed after merging main (`81caaaf3-9d55-4dc0-a614-df81548b1566`). This release prerequisite does not close BUY-037.

## BUY-017 progress (finding remains open)

- [x] Report thrown/lost settlement acknowledgements and unconfirmed transaction claims as `charged:null`, `payment_state:unknown`, with the existing reconciliation reference and same-payment guidance. HTTP returns 503; both MCP profiles signal errors. The discovery contract names the state too.
- [x] Persist the full catalogue request, item snapshot and selected payment terms before settlement on HTTP and both MCP profiles. A failed capture submits no payment; concurrent identical authorizations share one durable attempt.
- [x] Retain a protected purchase status handle across ambiguous retries, changed inputs, closed shelves and authorization expiry. Status reads submit no payment; existing paid cache/artifact recovery still runs first.
- [x] Commit an alarm with the catalogue purchase before settlement, independently of the legacy reconciliation row; recover original Context Anchors and unstocked human orders once payment is established.
- [x] Reconcile ambiguous Base/Polygon/Arbitrum/World catalogue payments using finalized receipts matching payer, nonce, recipient, token and amount, then expose the checkpointed good through HTTP/MCP private status. Re-scan bounded windows for delayed RPC indexing; outages retain scheduled retries.
- [x] Capture newly accepted commission briefs and quote windows before settlement, then recover the original checkpointed order after a lost response or partial write. See the commission evidence below.
- [ ] Extend capture to paid publication doors and recover a lost status handle after payment verification expires.
- [x] Establish ambiguous Solana settlement independently of the lost facilitator receipt for newly captured purchases; recover supported anchors and unstocked human orders through the existing scheduled delivery path.
- [ ] Extend checkpointed recovery to the remaining products and recover pre-capture Solana obligations without retained message evidence.

The 27 public-door fault cases were observed red before the repair, including identical retries after a simulated landed payment, on Base/Polygon/Solana through HTTP and both MCP profiles. The discovery guard separately failed before the code was advertised. These fixtures do not prove live settlement, automatic reconciliation delivery, or universal retry safety; the SEV-1 stays unchecked.

## BUY-011: confirmed settlement refusals

- [x] Preserve the processor's refusal reason and explicit `charged:false`, `payment_state:not_settled` on both doors.
- [x] Mark the result `isError:true` for both MCP payment profiles; the standard profile retains the refusal instead of replacing it with a fresh quote.
- [x] Describe the tool-result error in the served discovery contract.

All 192 catalog × three-rail × two-profile public-door comparisons failed before the repair; each checks both HTTP and MCP reached settlement, the same machine-readable reason, and no certificate or order. They passed after the fix, along with the separately red discovery assertion. This closes BUY-011; it does not close the unknown-settlement or fulfillment-recovery findings.

## 2026-09-07 — purchase status integration / PR #559

- [x] Reconcile the README tool table, route telemetry and feature register with the protected purchase-status door.
- [x] Keep recovery instructions within the existing MCP catalog budget; remove the duplicated, contradictory one-minute retry paragraph.
- [x] Document private status retrieval in the buyer guide and retain its existing size limits.
- [x] Teach the source guards where the shared purchase codes and Durable Object transaction writes live. Keep explicit unknown/charged/refused distinctions.
- [x] Assert that malformed Solana receipts retain unknown status without submitting the payment again. Automatic Solana ambiguity resolution remains open.

GitHub exposed these integration gaps in both runs of #559. All 260 focused cases across the 12 affected files pass, plus typecheck and both dry-run bundles; the full suite remains delegated to GitHub. This repair changes no SEV-1 completion claim.

## Recovery import-guard integration

- [x] Express the recovery-store binding with an explicit `import type`. The collector safety scanner mistook the inline TypeScript `import(...)` type expression for a runtime dependency on the payment signer. The unchanged safety test reproduced red and passed after this source-only clarification; TypeScript output contains no recovery-store import in either form.

The safety and recovery gate passed 43 cases, typecheck and both Worker dry-run builds passed. This corrects the shared #560/#561 CI failure without relaxing signer isolation or closing a parent buyer finding.

## 2026-09-07 — scheduled delivery from retained purchases

The next increment resumes the original signed anchor or creates the original human order without another payment submission. It retains the purchase time/SLA across shelf closure and catalogue changes, serves completed human work through the protected status doors, and resumes after an interruption between artifact publication and purchase-status publication. Wrong-chain/token/recipient/amount/payer/nonce evidence, failed transactions, unavailable finality and RPC failures leave payment unknown and recovery scheduled.

This does not close BUY-017/034/037: unknown Solana receipts, uncheckpointed products, pre-capture/legacy obligations and missing handles remain. The long human-detail truncation observed while building the fixture is still an input-survival defect; these recovery assertions use valid briefs within the current limit. All payment/chain evidence is local fixture data, not a live payment test.

Validation: all 39 new scheduled-recovery cases failed on the prior source and passed after restoration. The related gate passed 215 cases across nine files, plus typecheck and both Worker dry-run bundles. The full suite runs on GitHub.
## Discovery integration follow-up

- [x] Restore the suggested retry key beside the MCP repeat-charge warning; keep the standard payment profile's quote location consistent; render the private status URL template as inline code so crawlers cannot follow a literal placeholder.

All three GitHub failures reproduced locally before these copy repairs; 62 focused discovery checks and typecheck passed afterward. This is integration cleanup for #559, not closure of a parent SEV-1. The full suite remains on GitHub.

## 2026-09-07 — Solana settlement ambiguity

- [x] Retain a digest of the verified transaction message before settlement, without retaining executable signed payment bytes. Legacy and v0 messages remain identifiable after the facilitator adds its signature.
- [x] Walk bounded pages of finalized payer history on a genesis-checked mainnet RPC; require the exact original message and transaction identity, successful execution and quoted USDC balance changes for both payer and recipient.
- [x] Resume the original anchor or human order through HTTP and both MCP payment profiles after a lost acknowledgement, shelf closure or quote expiry. Preserve original input, certificate chain/transaction, purchase time and completed human work.
- [x] Keep missing, malformed, unfinalized, unrelated and wrong-chain/token/amount/recipient/payer evidence unknown and scheduled; never submit another payment during lookup.

All 30 new buyer regressions failed without the production fix and passed with it. The adjacent Solana gate passed 622 cases across six files; the retained-purchase gate passed 101 cases across three files. Typecheck and both Worker dry-run builds passed. Full CI remains on GitHub; no real money was sent.

BUY-017/034/037 remain open for uncheckpointed products, commission/publication capture, legacy obligations and loss of the private recovery handle. Existing Solana purchase records without the message digest are not silently treated as reconcilable. These checked substeps do not change the 15/39 completed finding count or claim production deployment.

Implementation references: [Solana transaction format](https://solana.com/docs/core/transactions), [finalized transaction lookup](https://solana.com/docs/rpc/http/gettransaction), [paged address history](https://solana.com/docs/rpc/http/getsignaturesforaddress), and [Solana CAIP-2 genesis identification](https://namespaces.chainagnostic.org/solana/caip2).

## 2026-09-07 — recovery for simple instant goods

- [x] Extend durable certificate and response recovery to the active Signed Hello, Certificate of Patronage, Small Blessing and Daily Fortune products.
- [x] Retain the selected instant text before response publication, so repeated or concurrent recovery returns the same good with the same certificate and one settlement.
- [x] Preserve the original purchase day when a fortune resumes after midnight, including an interruption before its text was selected.
- [x] Exercise HTTP and both MCP profiles across all five supported rails after certificate publication, saved-text acknowledgement loss and response checkpoint failures; verify the recovered certificate and original buyer canaries through public status and verification doors.

All 252 new cases passed with the fix and failed when the production changes were removed. The affected discovery group and adjacent fortune/delivery checks passed 72 cases, including the catalogue byte ceiling, retry-key guidance and both payment profiles. Full CI remains delegated to GitHub, and no real payments were submitted.

This extends BUY-017/034/037 recovery without closing the parent findings. Inventory-consuming goods, term services, external observations, commission/publication capture and legacy/missing-handle recovery remain. The unsigned blessing/fortune-text finding (BUY-022) is separate and stays open: retaining a selected text does not itself bind that text into the certificate signature. The finding count remains 15 checked and 24 open; these additional recovery substeps are checked separately. The final shared recovery gate passed 396 cases across four files, followed by typecheck. Both Worker dry-run bundles passed.

## 2026-09-07 — instant recovery CI integration / PR #562

- [x] Give separate purchases separate settlement identities in the affected HTTP/MCP test fixtures, including the Arbitrum/World wrapper; assert that fresh purchases really settle separately. Keep fixed-transaction legacy fixtures explicit in the existing mock behavior.
- [x] Assert that a completed checkpointed purchase returns the exact original response on retry without another settlement or patron allocation.
- [x] Preserve the legacy certificate-only failure case by removing its artifact journal, leaving the actual purchased text unavailable; assert that the delivery obligation stays open and no second settlement occurs.

Both GitHub runs and the local reproduction failed the same 21 assertions across ten files. Those files now pass all 86 cases; the final combined gate passed 445 cases across 19 files, including checkpoint recovery, wrong-input/owner controls, legacy recovery, receipts and duplicate protection. Typecheck passed. This repairs the test integration for simple instant recovery; it changes no production payment safeguards and closes no additional parent buyer finding. Full CI remains delegated to GitHub.

## 2026-09-08 — payment fixture hook compatibility / PR #562

- [x] Restore the argument-free `installFacilitatorMock` entry point used directly by ten Vitest setup hooks; expose the distinct-transaction setup through a separate argument-free installer. Keep the existing hook callers unchanged.

The preceding repair removed the 21 payment assertion failures, but its optional helper parameter was interpreted by Vitest as a fixture dependency. Both GitHub runs failed the same ten setup hooks, preventing 124 tests from running; the local reproduction confirmed all ten failures. This is a test API compatibility repair, not a production payment change or closure of another buyer finding.

After the compatibility repair, all 244 tests across the 26 affected/adjacent files passed, with no skipped cases; typecheck passed. Full CI remains on GitHub.

## 2026-09-08 — original settlement-observation recovery

- [x] Retain the signed Settlement Attestation or Attestation Bundle before admitting settlement, bound to the verified payment identity, product path and complete request digest. Atomic admission requires that snapshot to exist.
- [x] Resume the original evidence through HTTP and both MCP profiles, or the purchase-status alarm, without rereading the subject chain after payment. Preserve evidence hashes, signatures, observation time, exact requested transactions and bundle order.
- [x] Refuse settlement when observation storage fails; a lost write acknowledgement can retry the same request using the first saved bytes. Concurrent requests cannot replace the saved question or evidence.
- [x] Preserve confirmed-charge reporting when an HTTP recovery fails before reaching its memoized settlement call. Missing legacy evidence stays an open delivery obligation; recovery does not create a new observation and pretend it was the purchased one.

The new public-door suite passed all 120 cases across five payment rails. Removing the production patch made 114 regression cases fail; six legacy safety controls passed both ways. The final integration gate passed 476 tests across 25 files, including existing payment fixtures, buyer-input mapping, discovery, collector isolation, deliver-before-settlement and EVM/Solana reconciliation. Typecheck and both Worker dry-run bundles passed. Full CI remains delegated to GitHub.

The ambiguity cases simulate a lost settlement response and then inject its confirmed payment result to test evidence survival; they do not claim new coverage of chain finality verification. That verification retains its separate negative-control suites. All payments and chain observations here are local fixtures.

This extends BUY-017/034/037 without closing their parent findings or changing the 15/39 completion count. Other external observations, inventory/term services, commission/publication capture, pre-capture obligations and lost status handles remain. This increment covers settlement attestations and bundles only; it does not claim every observation product is recoverable.

Storage uses the existing coordinator and its [transactional Durable Object storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/); no new migration is required.

## 2026-09-08 — observation journal CI integration / PR #570

- [x] Register the reviewed `DurableObjectTransaction.put` for the original observation in the KV-write scanner's exact-line exceptions. The scanner still rejects ordinary KV aliases, including a different write through a receiver named `txn`, and rejects the same exception in an unrelated source file.

GitHub reported one failure with 6,935 passing tests: the scanner treated this Durable Object transaction as an unguarded KV write. The same assertion reproduced locally; all four scanner checks passed after the exception was added, followed by typecheck. No production storage or payment behavior changed. This does not close another buyer finding.

## 2026-09-08 — original URL-report recovery

- [x] Retain Service Audit, Good Buyer, Signature-Agent Card and On-Page Audit signed observations before settlement. A recovery publishes those exact bytes without probing a changed or unavailable target.
- [x] Preserve the public report ID, certificate linkage and purchase timestamp when report publication fails before the write or loses its acknowledgement. The free report URL and protected purchase-status response serve the same purchased evidence.
- [x] Exercise certificate, public-report and response-checkpoint failures through HTTP and both MCP profiles on all five configured rails. Recover a day later with the target unavailable; check exact URL canaries, signatures, tampering rejection, certificate evidence hashes and one settlement.
- [x] Exercise pre-settlement journal failure, lost journal acknowledgement, changed-input replay and concurrent initial requests. Use real report construction/signing with local pages and local signed payment fixtures.
- [x] Give the older MCP argument-survival spec unique settlement identities for independent purchases using the existing scoped multi-purchase fixture.

All 288 new cases failed with the production repair temporarily removed and passed after restoration. The final related gate passed 1,050 cases across 17 files, plus all four KV-write scanner checks. Typecheck and both Worker dry-run builds passed; the full suite runs on GitHub. After integrating current main, the recovery/A2A conflict gate passed 465 cases across seven files, with typecheck and both dry-run builds passing again. These are local fixtures, not live-chain or production-deployment evidence.

BUY-017/034/037 remain open. This increment covers these four URL reports, not every external observation or paid product. Other observations, inventory/term services, commission/publication capture, pre-capture obligations and lost private handles remain. The completed parent count stays 15/39.

### Completed-record retry — BUY-014/015 and recovery follow-up

- [x] A verified payment whose durable purchase record already contains the completed good returns that original fulfillment after the response cache expires. HTTP and both MCP payment profiles preserve the original payment receipt and explicitly report `charged: true`, `charged_again: false`, and `paid_retry: true`. Same, new, and omitted idempotency keys retrieve the same purchase without fulfillment, probing, certificate creation, or settlement running again.
- [x] The completed-record read binds the verified payer, network, original product, door, and full request digest. A same-price different product or changed input is refused without another settlement; tampering with the Solana signature cannot retrieve the saved good. Concurrent completed retries return the same artifact.
- [x] A completed human order returns its current status and submitted work through ordinary purchase retry, using the same projection as protected purchase status.

The regression has 96 cases across HTTP, both MCP profiles, all five advertised fixture rails, four URL reports, and a human order. With the production fix temporarily removed, all 93 new behavior cases failed and the three existing signature-tampering controls passed. The repaired focused gate passed 181 tests across four files plus typecheck before integration with main. After integrating main at `498c3714` and installing its updated lockfile, the full local suite passed all 585 files: 7,320 tests passed with one existing conditional key-continuity skip (695.82 seconds). Typecheck, A2A runner/schema checks, Tab/browser-bridge/Action/example/package tests, audit, claims, docs checks, both Worker dry-run builds, and native Worker startup also passed.

BUY-014/015 and BUY-017/034/037 remain open. This path still requires successful payment verification and an existing completed purchase record; it does not repair expired/rejected verification, legacy or uncheckpointed obligations, or loss of the private status handle. The completed parent count stays 15/39. No live payment was submitted.

Validation policy, updated 2026-09-08 at the keeper's request: run the full local suite before committing and pushing each fix, in addition to typecheck and the applicable CI/build checks. Earlier entries describing GitHub-only full-suite validation are historical.


## 2026-09-08 — A2A Repair Kit recovery

- [x] Retain the prepared A2A kit before settlement: the signed original observation, kit ID, private recheck token, and signed service dates travel together in the purchase journal.
- [x] Resume certificate and kit publication from those exact bytes after a confirmed payment. Recovery does not re-read the card, rerun runtime tasks, replace the token, restart service dates, overwrite recorded watch passes, or grant a second recheck.
- [x] Move live A2A availability/permission checks into new-purchase admission after authenticated recovery on HTTP and both MCP profiles. Static target validation remains before payment. A fresh purchase still requires current operator permission; a supplied HTTP quote target is checked before terms are issued.
- [x] Exercise certificate signing/publication, kit writes before/after acknowledgement, final response checkpoints, and lost settlement responses across every configured fixture rail. Check the exact URL canary, signed evidence, tampering rejection, protected purchase status, public kit retrieval, token privacy, and one settlement. Include pre-settlement journal failure, direct EVM recovery, concurrent buyers of the same payment, changed inputs, consumed rechecks, and missing original snapshots.

The new public-door regression contains 114 cases, all passing locally. Removing the production repair made all 111 new behavior cases fail; the three current-permission controls passed both ways. The adjacent gate passed 167 checks across five files before the final six recovery controls were added. The final full local suite passed all 586 files: 7,434 tests passed with one existing conditional key-continuity skip (464.18 seconds). Typecheck, both Worker dry-run builds, A2A runner/schema checks, Tab/browser-bridge/Action/example/package tests, audit, claims, and docs checks also passed. Native Worker startup passed on a standalone rerun; its first concurrent attempt stalled on the empty control Worker. Payment and target execution use local signed fixtures. Lost-settlement tests inject the already-confirmed local payment result after demonstrating the ambiguous answer; chain finality retains its separate negative-control suites. Missing original snapshots remain an explicit owed purchase and never authorize a replacement observation.

BUY-017/034/037 remain open for the other uncheckpointed products, inventory/commission services, and legacy obligations. BUY-014/015 still include expired/rejected verification and missing recovery handles. These completed substeps do not change the 15/39 parent count or establish production deployment.

## 2026-09-08 — Separate archive-report proofs from purchase certificates

- [x] Preserve Spot Check and Provenance Check's complete signed report under `observation`, beside the purchase certificate's proof. The report's own verification instructions name that field explicitly; neither proof can overwrite the other.
- [x] Exercise a recipient's independent signature, canonical-signature, evidence-hash and certificate-binding checks through HTTP and both MCP profiles, including tampered-report rejection.

All six recipient regressions failed without the production correction and passed with it. The existing flat report fields remain compatible; `observation` carries the complete report proof. This is a separate artifact correction discovered during the recovery work; the larger recovery findings remain open.

## 2026-09-08 — Complete observation proof packaging (BUY-006)

- [x] Preserve the complete signed Passport Refresh observation and Trust Profile commission under `observation`, including their exact signed payload, both signatures, key and evidence hash. Existing `refresh`/`profile` fields and the top-level purchase-certificate proof retain their meanings.
- [x] Give recipients explicit verification paths for both observation signature formats and the certificate's `attests` binding.
- [x] Verify all four affected products through HTTP and both MCP profiles on every enabled test rail. Check exact URL canaries for the two remaining products, independent observation/certificate signatures, certificate verification and rejection of a changed subject.

The expanded recipient regression was run before the source repair: all 30 Passport Refresh/Trust Profile cases failed, while all 30 previously repaired product controls passed. After the fix all 60 pass; the adjacent passport/profile gate passes 77 tests across three files. This closes the successful-response proof-packaging finding; it does not claim retained-response recovery, term-service commissioning safety or live payment finality. Those remain separate findings.

Final validation on current main passed all 597 test files: 8,172 tests passed and one existing skip (868.69 seconds). Typecheck, both Worker dry-run bundles, the standalone native-startup check, audit, claims and docs checks passed. The initial concurrent startup probe stalled on its empty control and was stopped; the separate rerun completed normally. Payment and probe traffic use local fixtures.

## 2026-09-08 — Spot Check and Provenance Check recovery

- [x] Retain each original signed archive report in the purchase journal before settlement; recover it without rederiving from newer, changed or unavailable books.
- [x] Resume certificate signing, provenance-record publication and response publication with the original subject, report ID, evidence hash and signatures. Provenance retrieval keeps the original purchase timestamp.
- [x] Exercise HTTP and both MCP profiles across all five configured fixture rails, with unique buyer canaries in actual archive rows and recipient verification of the purchased good.
- [x] Exercise pre-settlement journal failures, lost settlement acknowledgements, changed inputs, concurrent duplicates, missing original evidence, and changed/unavailable archive data. A missing original remains an owed purchase; it cannot authorize a replacement observation.

The 186 recovery cases failed with recovery support removed while the independent report-proof correction remained in place, and passed after restoration. The separate six recipient-proof regressions also passed. Ambiguous-settlement cases inject the already-confirmed local receipt to isolate artifact survival; chain finality remains covered by its own negative-control suites. No live payment was submitted.

BUY-017/034/037 remain open for other uncheckpointed observations, inventory/commission services, legacy obligations and missing private recovery handles. These checked substeps do not change the 15/39 parent-finding count. Next observation families to examine are wallet statements and settlement reconciliation; their original chain readings also need durable recovery.

Final local validation passed all 588 files: 7,626 tests passed with one existing conditional key-continuity skip (337.93 seconds). Typecheck, both Worker dry-run bundles, native Worker startup, A2A runner/schema checks, Tab/browser-bridge/Action/example/package tests, audit, claims and docs checks passed. The first full run exposed two older provenance tests sharing a constant settlement transaction across distinct sales; the two product specs now use the existing multi-purchase facilitator fixture. Both affected specs passed all 15 tests, followed by the complete passing rerun. No timeout or production recovery guard was relaxed.

## 2026-09-08 — Wallet statement recipient chain

- [x] Derive the purchase response and retrieval page's chain references from the signed wallet statement instead of describing every purchase as Base. Preserve chain-specific RPC instructions from the shared rail definition, including Solana's slot/token-account reader.
- [x] Exercise Base, Polygon and Solana subject chains through HTTP and both MCP profiles, checking the signed subject chain and the recipient's verification instructions together.

All nine new recipient regressions failed without the correction and passed with it. The existing statement suite also passes; its assertion that the Base reading explains `eth_getLogs` remains intact. This correction is committed separately from durable chain-report recovery.

## 2026-09-08 — Wallet statement and settlement reconciliation recovery

- [x] Retain the original signed wallet statement and settlement reconciliation before settlement. Recovery restores the original IDs, subjects, chain, transfer rows, amounts, requested window and declared-versus-observed ceiling instead of reading the chain again.
- [x] Preserve the original publication timestamps through certificate, report-storage and response-checkpoint failures; retrieve and verify the original reports through their public record URLs and protected purchase status.
- [x] Exercise HTTP and both MCP profiles across all five configured payment rails. Separate Polygon and Solana statement cases pay on Base and prove the subject chain remains independent of the checkout rail.
- [x] Exercise journal failures before settlement, lost settlement acknowledgements, concurrent requests, changed inputs, changed chain data and missing original observations. Missing original evidence remains an owed purchase without replacement or a second settlement.

The recovery regression has 222 cases. RPC fixtures feed the real chain readers, report arithmetic and signing code; assertions require the purchased transaction rows and amounts, not an empty or merely well-shaped report. Ambiguous-settlement cases retain the actual confirmed fixture receipt and inject its confirmation to isolate original-evidence survival; they do not claim live chain-finality coverage. No live payment was submitted.

BUY-017/034/037 remain open. Other observation, inventory and commission products still need recovery coverage; historical obligations that predate retained input/evidence still need safe resolution. The human-order reconstruction already completed is not being reopened by this increment. The parent count remains 15/39.

All 231 new cases were observed failing with the production fixes removed. The focused gate passed all 222 recovery cases, and the recipient/statement gate passed 21 tests after preserving the existing Base RPC guidance. Final local validation passed all 590 files: 7,857 tests passed with one existing conditional key-continuity skip (791.84 seconds). Typecheck, both Worker dry-run builds, native Worker startup, A2A runner/schema checks, Tab/browser-bridge/Action/example/package tests, audit, claims and docs checks also passed. No test timeout or production money-safety guard was relaxed.

## 2026-09-08 — PR #578 check repair

- [x] Rebase the chain-report recovery branch onto current main to remove its merge conflict.
- [x] Derive synthetic Solana subject identities from the purchase canary digest instead of passing random bytes into the Base58 encoder. CodeQL traced those two fixture calls into the codec's radix arithmetic; production encoding, payment signatures and the security check remain unchanged.

The rebased fixture gate passed all 231 cases. The full local suite passed all 591 files: 7,870 tests passed with one existing conditional key-continuity skip (822.56 seconds). Typecheck, both Worker dry-run builds and the separate A2A/Tab/till/Action/example/package/audit/claims/docs checks passed. The remote CodeQL result must be checked on the new commit; this record does not mark it green in advance.

## 2026-09-08 — PR #583 security-check fixture repair

- [x] Replace random-byte synthetic Solana transaction IDs with deterministic canary digests. CodeQL followed the fixture data through reversible Base58 radix arithmetic; no secret is sampled or reduced here. Production encoding and the security check remain unchanged.

The same fixture pattern had already been corrected for #578 and was reintroduced in the new resolution spec. That repetition was avoidable. The existing refund success, wrong-recipient/token/amount/chain, finality and failure controls remain the behavioral gate. Remote CodeQL must pass on the corrected commit before this PR can merge.

Final local validation of the fixture correction: typecheck and all 599 test files passed, with 8,177 passing tests and one existing skip (894.53 seconds). No production source changed in this correction.


## 2026-09-08 — Passport Refresh and Trust Profile recovery

- [x] Retain the exact signed refresh or profile commission before settlement, bound to the verified purchase and complete input digest. HTTP and both MCP profiles recover that original evidence after certificate or response failure and after a lost settlement acknowledgement.
- [x] Give each hosted commission a durable per-purchase grant. Retrying a profile never adds another term; concurrent separate purchases each extend once. A grant whose acknowledgement was lost retains its original timestamp and subject.
- [x] Publish through a per-host coordinator so an older recovery preserves a newer refresh or profile term. The retained record is authoritative; public KV remains an eventually consistent projection. Recovery repairs a missing projection without probing again or renewing the term.
- [x] Apply Trust Profile readiness to new commissions after authenticated replay lookup. An already paid buyer can retrieve the original commission after readiness disappears; a new buyer is refused before settlement.

The initial 144-case regression produced 138 failures and six passing controls before source changes. Coverage spans both hosted products, HTTP and both MCP profiles, and every configured fixture rail. It verifies exact subject URLs, original signed/JCS bytes, evidence hashes, certificate binding, verification, protected status retrieval, missing-original refusals and newer-publication preservation. No live payment or production migration is involved.

## 2026-09-08 — Hosted storage failures and retry status

- [x] Return explicit payment status and the existing machine-readable observation-storage error when a hosted grant or publication fails. No new settlement is attempted; an unreadable purchase record is unknown rather than silently reported unpaid.
- [x] Preserve the original commission across lost grant/publication acknowledgements. Concurrent duplicate payments settle once; changed-input replay is refused.
- [x] Leave paid recovery owed while publication is unavailable. Once storage returns, its alarm publishes the original evidence and delivers it without another observation, term extension or transfer.

The expanded 186-case regression produced 177 failures and nine passing controls with the tracked source changes stashed. The final focused gate passed 566 tests across seven files, including earlier observation recovery and proof packaging. The former Trust Profile refusal fixture now makes an unpaid quote request; signed-payment controls separately prove that readiness disappearing after a quote still prevents a new settlement.

BUY-017 and BUY-037 remain open for other product families and historical obligations. These completed hosted-product substeps do not reopen completed work or claim that every paid product is recoverable. A 2026-09-08 snapshot evaluated from the current `MENU_ITEMS` and `supportsArtifactRecovery()` now admits 20 of 33 catalogue products, up from 18 before this batch. This is current implementation coverage, not historical-obligation closure. Validation was rebased onto main after #583/#584 merged, including the subsequent bounty-board changes. The initial unbounded local full run was stopped without a verdict under heavy memory pressure; the replacement uses `npm test -- --maxWorkers=2`, with the same files and assertions. The bounded full run finished with 587 files passing and 12 failing (8,387 tests passed, 21 failed, one existing skip), plus two worker-startup timeout errors without file names. System sleep interrupted that run. All 12 failing files then passed with no source changes: 2,013 tests, no unhandled errors (281.28 seconds). The original full run is not relabeled green; GitHub's complete suite remains the merge gate. Typechecking, both Worker dry-run bundles, audit, claims and docs checks pass on current main.

The first recovery commit (`2311bd6e`) also passed its standalone typecheck and all 144 core regression cases before committing. The final batch passed native startup for both Workers; the startup timing control was noisy, so this is startup validation rather than a performance claim. The second commit restores the exact source/test bytes used by the 2,013-case retry gate.

## 2026-09-09 — Mandate and Bitcoin Anchor recovery

- [x] Retain the original signed Mandate or prepared Bitcoin Anchor before settlement, bound to the verified authorization and complete purchase inputs. Recovery keeps the original ID, timestamps, text/digest, label, certificate binding and proof URL.
- [x] Recover through HTTP and both MCP payment profiles after certificate, record-publication and response-checkpoint failures, including lost write acknowledgements. A lost settlement acknowledgement retains the original preparation; the existing reconciliation path resumes from the confirmed receipt.
- [x] Refuse replacement work when the original preparation is absent or incomplete. Concurrent duplicates settle once, changed-input replay cannot substitute a different good, and persistent publication failure remains owed until storage recovers.
- [x] Coordinate Anchor recovery and proof upgrades through the existing paid-recovery Durable Object class. A stale retry cannot overwrite an upgraded proof; recovery restores a missing public projection from the durable latest record. No new binding or migration is required.

The final regression set in `test/mandate-anchor-paid-recovery.spec.ts` produced 280 failures and six passing controls with the source changes stashed against main. With the fixes restored, all 286 new cases and 30 existing Mandate/Anchor/storage checks passed. Coverage uses locally signed payment fixtures over every configured test rail, real record/certificate signing, protected status retrieval, verification and local OpenTimestamps proof bytes. No live payment or Bitcoin-finality claim is made. The older Mandate and cross-door integration fixtures now give distinct purchases distinct settlement transactions, using the existing multi-purchase facilitator helper. The full-suite run exposed the cross-door fixture collision; its input-survival assertions remain unchanged.

BUY-017 and BUY-037 remain open for the other product families and historical obligations without retained original input/evidence. The parent finding count remains 17/39. A 2026-09-09 snapshot evaluated from `MENU_ITEMS` and `supportsArtifactRecovery()` now admits 22 of 33 catalogue products, up from 20 before this batch. Remaining products: the Confession, the Case File, Luckies, Coffees for Closers, Graffiti on a Train, Standing Watch, Conformance Watch, Launch Check, Opening Day, Recurring Patronage and Operator Statement.

Final batch validation: the complete local run finished all 603 files with 8,716 passing tests, one failing cross-door fixture and one existing skip (1,580.60 seconds). After switching that fixture to distinct transaction IDs, all 39 tests in its file passed, with no assertion removed and no production source change. The original full run is not relabeled green; GitHub must run the complete final tree before auto-merge. Final typechecking, both Worker dry-run bundles, audit, claims and docs checks pass. The optional native startup diagnostic stalled while shutting down its empty control Worker and was stopped before evaluating the store, so it is not counted as a pass.

## 2026-09-09 — Recover a completed Anchor upgrade after public storage fails

- [x] Republish the durable proof before the sweep asks an upstream calendar for more work. If an upgrade was retained but its KV write failed, a later calendar outage cannot hide the completed proof. The sweep still bounds work per pass and leaves completed public records alone.

The dedicated regression first failed with the public record left pending after the upgrade write failed. It now restores the original completed proof and upgrade timestamp without another upstream request or payment. The incomplete-preparation controls also first exposed three Anchor replacements and now keep those purchases owed instead of creating new records.


## Case File recovery — 2026-09-09

- [x] Retain the original signed Case File and reuse decision before settlement. HTTP and both MCP profiles recover its original assembly, declared claim, transaction, endpoint, mandate, launch-check reference, payer, recipient and expected amount; the certificate remains bound to that evidence hash.
- [x] Exercise local signed payments on every fixture-enabled rail through lost settlement acknowledgements and failures before/after certificate creation, record publication and query-index publication, plus interrupted response retention. Recovery returns the original assembly after the clock advances and chain evidence changes, without a second settlement or a fresh observation.
- [x] Keep each purchase's certificate link and creation date immutable when multiple purchases reuse one assembly. The public case keeps its first certificate; `case_purchase_url` selects the purchasing buyer's certificate. An older recovery cannot replace a newer buyer's link, even after the older public projection is removed.
- [x] Retain publication records and the latest assembly in the existing recovery coordinator, partitioned by the complete question. Cache loss does not authorize a different assembly inside the reuse window; expired evidence cannot become fresh because an old purchase retries. No additional binding or migration is required.
- [x] Keep missing or incomplete original evidence owed, and keep a persistent publication outage owed until storage returns. Never substitute a new Case File to make a settled obligation appear delivered.

The 177-case buyer regression matrix and 19 existing Case File/identity/write-guard tests pass (196 total). With source changes stashed, 174 buyer cases fail and three existing safety controls pass. Restoring only evidence retention still leaves all six certificate-link and expiry regressions failing, independently proving the publication fix. The old multi-purchase Case File fixture now issues distinct settlement identifiers for distinct purchases; its previous constant transaction made a fresh purchase look like a paid retry.

BUY-017 and BUY-037 remain open for other product families and historical obligations without original input/evidence. The parent count remains 17/39. The current catalogue and recovery predicate evaluate to 23/33 supported products; the ten remaining products are the Confession, Luckies, Coffees for Closers, Graffiti on a Train, Standing Watch, Conformance Watch, Launch Check, Opening Day, Recurring Patronage and Operator Statement. All payment/chain evidence here is local fixture data. The full local suite passed on the final batch rebased onto #587: 604 files, 8,894 tests passed, zero failures and one existing key-continuity skip (1,633.67 seconds). Typechecking, both Worker dry-run bundles, audit, claims and docs checks also passed.

## Personal goods recovery and private Confession proof — 2026-09-09

- [x] Recover the original Confession, Lucky, Coffee win and Train tag through HTTP and both MCP payment profiles on every fixture-enabled rail. Retain original purchase inputs, certificate, record identity and creation date; a recovered Lucky keeps its original draw and signed record.
- [x] Exercise certificate, record-checkpoint, coordinator, public-write, signing and response-retention interruptions, including lost settlement acknowledgements. Persistent storage failure leaves delivery owed; authenticated recovery restores the original good without a second settlement. Replay with changed inputs refuses, and concurrent duplicates settle once.
- [x] Keep keeper decisions in the same durable coordinator used by publication. Recovery preserves printed confessions, approved tags (including the first display date) and promoted Luckies after KV loss or failed moderation publication. Adopt older KV-only records without resetting their lifecycle; preserve their actual keys when the old writer's two clock reads differ. No new binding or migration is needed.
- [x] Give simultaneous Coffee purchases separate records. Recovery keeps the original date and cannot renew the 90-day Sunday listing; the signed purchase still records the win after that listing expires.
- [x] **BUY-023 complete:** return a private, independently signed Confession receipt binding the exact stored text, confession identity, original date and purchase certificate. HTTP, both MCP profiles and protected purchase-status retrieval carry the same proof. Text and certificate-id tampering fail verification; retained proof survives a later signer outage. Public certificates and verification omit the confession and its private identity; the anonymous drawer gains no wallet or certificate link. Discovery explains the private receipt and exact signature bytes.
- [x] Preserve the Train purchase's paid amount in its wall record. The recorded bid now agrees with the signed purchase amount across doors and rails, including after recovery.

The current catalogue and recovery predicate evaluate to 27/33 supported products. Remaining: Standing Watch, Conformance Watch, Launch Check, Opening Day, Recurring Patronage and Operator Statement. BUY-017 and BUY-037 stay open for these families and historical obligations without retained original input/evidence. Closing BUY-023 raises complete original findings to 18/39; the checked recovery substeps remain visible separately. All payments are local signed fixtures, not live settlement evidence.

Validation: all 631 buyer cases pass across the four product files. With only source changes stashed, 599 fail and 32 existing-behavior controls pass. The legacy two-clock compatibility tests independently fail without the actual-key fix (two failures), and pass after restoration. The 44 existing product/write-guard tests pass; older multi-purchase Confession, Coffee and Lucky fixtures now issue distinct transaction identifiers. The initial single-file matrix was stopped without a verdict after slowing as retained fixture state accumulated. Splitting the same cases into four product isolates reduced the completed focused run to 68.74 seconds. The complete local run finished 609 files: 9,527 tests passed, five assertions failed in four files, and one existing key-continuity test was skipped (1,688.33 seconds). Three older verifier/idempotency/shutter fixtures reused one fake transaction across independent purchases; they now issue distinct transactions without weakening their assertions. The fourth file pins the generated guide: replacing only the new Confession description reproduced the old digest exactly, then the reviewed new digest was recorded. All 27 tests in those four corrected files pass together. Production source remained unchanged throughout the full run; the original failed run is not relabeled green. GitHub must run the complete final tree before auto-merge. Typechecking, both Worker dry-run bundles, audit, claims and docs checks pass.

Commit map for this batch: `a64c5b06` retains personal goods and keeper decisions; `1f56b336` adds private Confession proof and closes BUY-023. The Train bid correction and this consolidated checklist ship in the following commit of the same PR.


## Standing and Conformance Watch recovery — 2026-09-09

- [x] Retain the original target, watch ID, payer and purchased dates before publication. HTTP and both MCP payment profiles recover the same week after failed minting, signing, watch checkpoint, KV publication, response retention or an ambiguous settlement acknowledgement.
- [x] Serialize purchase recovery and scheduled publication through one durable watch journal. Stale purchase records cannot erase later signed observations; concurrent retries cannot open another watch or renew its term.
- [x] Store each signed observation separately with an atomic manifest. A complete week exceeding SQLite's single-value limit survives retention and repair without dropping rows or changing signed bytes.
- [x] Schedule projection repair atomically with durable watch writes. A failed cron publication retries independently after purchase delivery, including repeated outages; successful publication clears that wake-up.
- [x] Return signed commission proof binding the exact URL, watch ID, certificate ID, item, start/end dates and cadence. The public history retains the same proof, OpenAPI declares it before payment, and URL/date/certificate tampering fails verification. Legacy watches are adopted without inventing commission signatures.
- [x] Preserve case-sensitive Solana payer addresses and exclude other base58 wallets whose addresses differ only by case. EVM addresses still match across casing, including an uppercase prefix.
- [x] Preserve the original end date on late recovery and report elapsed gaps from the history. No replacement observations, retroactive coverage, or automatic renewal are manufactured.

The catalogue and recovery predicate evaluate to **29/33** admitted products. Remaining: Launch Check, Opening Day, Recurring Patronage and Operator Statement. BUY-017 and BUY-037 remain open for those products and historical obligations without retained original input/evidence. BUY-024 remains open for the other term products; this batch adds independently signed commission proof to the two standalone watches. Original finding completion remains **18/39**. These tests do not establish production settlement or repair previously corrupted Solana payer identities.

Validation: all 300 new watch buyer cases fail with only the implementation stashed. The full-week size test separately reproduces `SQLITE_TOOBIG` before observation rows are separated. All five wallet-identity cases fail with address preservation/matching reverted. Restored buyer/storage/write-guard checks pass 311 cases across five files; the six-file compatibility gate passes 49 cases, including the five wallet cases. An older conformance fixture backdated signed evidence to simulate tomorrow; it now advances the clock on both the due check and observation, retaining its drift assertions. A test helper now awaits RPC results so caught negative assertions do not leave unhandled test rejections. Typecheck, audit, claims and docs checks pass. Before rebasing onto #592, the complete local suite on `f13cee8d` plus this batch passed: 613 files, 9,838 tests passed, zero failures and 1 existing skipped key-continuity test (2352.16 seconds). After the clean rebase onto `f44df7b1`, all 355 watch and affected-integration cases across nine files and all 36 evidence checks pass, along with typecheck, audit, claims, docs checks and both Worker dry-run builds. GitHub’s full suite on the final PR tree remains a merge gate.

Wallet identity is committed separately as `8203ab02`; the watch journal, commission proof and completed substeps ship together in the following commit.

Watch-family follow-through, still open:

- [x] Launch Check and Opening Day retain the original upstream payment attempt and signed walk before allowing recovery; a retry cannot spend from the field wallet again. Interrupted presentations retain an explicit unknown outcome. See the launch recovery evidence below.
- [ ] Expired empty-watch history pages still describe the first observation as coming on the next rounds. Correct that wording to show the ended term and its missed observations, including late recovery. This is a remaining buyer-message defect, not an extension of the purchased period.


## Launch Check and Opening Day recovery — 2026-09-09

- [x] Retain the authorization risk before presenting the field wallet's payment. A durable journal binds the buyer's verified authorization to the original item/path, full input digest and target URL; concurrent requests cannot create another walk.
- [x] Preserve public reconciliation facts (nonce, rail, asset, amount and validity window) without retaining a spendable payment signature. A lost response or interrupted presentation reports an unknown settlement; expiry is never used as proof that no funds moved.
- [x] Retain the original observation before signing and the signed walk before buyer settlement. Failed durable writes and lost acknowledgements survive a fresh journal instance without a second upstream send; historical purchases without their original observation remain refused.
- [x] Recover the same certificate and signed walk through HTTP and both MCP payment profiles across all five fixture checkout rails. Failed certificate creation, public report writes and response retention recover through the authenticated purchase status without charging again.
- [x] Recover Opening Day's original watch, service dates and bundle record after failed checkpoints or KV publication. A signed commission binds the watch to the actual Opening Day certificate and target; a retry after the week ends does not renew it.
- [x] Preserve publication timestamps and verify the returned walk's signature, certificate evidence binding, exact target and bundled watch commission, including tampering with the target.
- [x] Bound replay-response reads, cancelling an oversized body and reporting truncation rather than consuming it unboundedly after payment.

The catalogue and recovery predicate evaluate to **31/33** admitted products. Remaining: Recurring Patronage and Operator Statement. BUY-017 and BUY-037 also retain historical obligations without original input/evidence. BUY-024 remains open for other term products. Original finding completion remains **18/39**. Checkout-rail fixtures do not expand the field wallet's Base-only upstream payment support, establish production settlement, or reconstruct historical evidence that was never retained.

Validation: all 336 buyer cases fail with only this batch's source changes stashed. All nine durable-journal cases fail with retained-report and retained-attempt reuse disabled. The restored eight-file gate passes 404 tests. The replay-body boundary fails against the unchanged previous branch. A further review regression reproduces a seller-named transfer being incorrectly promoted to confirmation of the new authorization; the new authorization status stays unknown unless that exact authorization is established. The final full local suite passed all 618 files: 10,189 tests passed, zero failed and one existing key-continuity test was skipped (2,059.57 seconds). All 347 new regressions pass in that run. The final three-file boundary gate passes 11 tests, and the separate evidence-package gate passes 36 tests. Typechecking, both Worker dry-run bundles, audit, claims and docs checks pass. At that point, advancing onto merged #595 (`35230014`) changed no tested source or test bytes; all 1,253 source/test hashes matched the full-run snapshot. A subsequent clean rebase onto merged #597 (`7694f540`) brought in the separate index-reporting repair. All 439 recovery and affected-integration tests across 13 files then passed, along with typechecking and both Worker dry-run builds. This batch's recovery source/test bytes remain unchanged; GitHub's full suite on the final combined tree remains a merge gate. No live payment was submitted.


Commit map for this batch: `39158f83` retains upstream authorization risk and observations; the following commit enables Launch Check and Opening Day delivery recovery and records these completed substeps.

Term-product batch (completed below):

- [x] Recurring Patronage: retain the original pass and each paid renewal grant; serialize distinct renewals without extending twice on replay or erasing a later renewal. Bind the purchased dates into independently verifiable commission proof.
- [x] Operator Statement: retain the original wallet, chain, asset, term, opening chain position and signed pass history. Preserve Solana payer identity. An unavailable opening head now refuses before settlement; recovery retains the actual original opening position rather than beginning at genesis or a later chain head.


Additional launch follow-through found while reviewing this batch (not complete):

- [ ] Validate public report responses against their served OpenAPI schemas. The shared signed-artifact schema currently requires `cert_id` and the audit verdict enum, while the Launch Check route returns a `certificate` URL and launch-specific verdicts such as `settled`. Cover the actual HTTP response rather than comparing schema helpers.
- [ ] Distinguish idempotent retrieval from repeated fulfillment in the launch replay verdict. The current walk treats any replayed 2xx as a defect without establishing that the seller performed fresh work; returning the original purchased artifact is also the safe retry behavior this buyer suite requires.

- [ ] Correlate the seller-named receipt with the exact authorization nonce and amount before claiming it settles the walk. The new `payment_attempt.settlement` stays unknown; the existing `tx_hash_status` describes the separate seller-named transfer read.


## Patronage and Operator Statement recovery — 2026-09-09

- [x] Retain the original pass or statement preparation before settlement. An unavailable operator chain head cannot charge or silently open from genesis. The purchase certificate binds a hash of the retained preparation.
- [x] Journal each patronage purchase grant once, atomically with the current pass and repair alarm. Distinct concurrent renewals each add one term; an old replay returns its own grant while preserving later renewals. Delayed recovery uses the original purchase date.
- [x] Retain the operator subject, chain, asset, opening block or slot, payer, original term and signed history. Recovery never rereads the opening chain head or restarts the purchased month. Solana subjects and payers retain their case.
- [x] Serialize scheduled operator publication with purchase repair. Reject overlapping ranges from stale cron reads and preserve a complete month larger than one storage value as individually retained signed rows.
- [x] Return independently verifiable commission proof on both purchase doors and public histories. Operator passes expose their exact signed bytes; patronage receipts retain their individual purchased grants. Tampering with the certificate, subject, chain, pass or dates fails verification.
- [x] Validate actual Patronage and Operator Statement HTTP responses against served OpenAPI schemas, including the separately signed monthly note, signed commission and opening chain position.

The catalogue and recovery predicate evaluate to **33/33** admitted products. Closing BUY-024 raises completed original findings to **19/39**. BUY-017 and BUY-037 remain open specifically for historical nonhuman obligations without original input/evidence and non-catalogue paid doors; no catalogue product remains on their implementation admission list. Missing private handles, expired payment verification and fresh-authorization concurrency remain BUY-014/015/016.

All **303** new buyer recovery cases failed against the unchanged source. Separate negative controls reproduce duplicate-grant replay failure, late date changes, a delivered grant with a missing current journal, overlapping operator ranges, SQLite's single-value size failure, and two incorrect response-schema outcomes. All use local signed payments and chain fixtures. The ambiguous-settlement cases lose an actual fixture settlement response, then supply that same receipt to the recovery record; they prove retained-fulfillment recovery after confirmation, not independent live-chain reconciliation. No live payment was submitted, no old evidence was invented, and this is not a production customer-obligation inventory.

Validation: the focused gate passed 433 tests across 19 files. The full local run on `08bff6a6` completed all 626 files: 10,549 tests passed, one existing key-continuity test was skipped, and one existing counter-alarm timing assertion failed (2,291.71 seconds). All 316 new buyer, journal and response-contract tests passed. All 1,306 source/test file hashes stayed unchanged during that run. Typecheck, both Worker dry-run bundles, native Worker startup, audit, claims, docs and all 36 offline evidence tests passed.

The counter fixture passed alone, then reproduced its failure under a controlled same-millisecond clock. Its producer and route reader now share an injected clock, and the explicitly later alert advances that clock. Existing assertions and timeouts are unchanged; this is a fixture correction, not a claim to repair production alarm ordering. The corrected counter and related alarm gate passed all 13 tests across three files; typechecking also passed.

Next recovery work: audit historical nonhuman paid records and the non-catalogue commission/publication doors against the same authenticated-original-good or evidence-backed-resolution standard. Preserve BUY-014/015/016 as separate buyer defects rather than silently treating a protected recovery URL as their repair.


## Counter-test timing follow-through — 2026-09-09

- [x] Remove elapsed-wall-clock dependence from the counter's ordered-alert scenario. The same-time negative control fails its original new-alarm assertion; the ordered fixture retains that assertion and controls both the producer and route reader.
- [ ] Harden production same-millisecond alarm handling separately: alert-log keys and seen-watermark comparisons currently rely on timestamps. Distinct simultaneous events and an alert arriving while a counter snapshot is being rendered need their own retention and acknowledgement proof. This adjacent follow-up is not counted among the original 39 buyer findings.

Commit map: `520b9c10` retains individual Patronage grants; `ac7792f4` enables paid-term recovery and signed Operator Statement history. The following commit records the completed checklist and the counter-clock fixture correction.

Post-rebase validation: rebased onto merged #600 (`2f9d62ef`), retaining its buyer guidance and shared OpenAPI commission references. All 869 affected integration tests across 38 files passed (138.64 seconds), including the corrected counter fixture, both new product matrices, both existing watch matrices, and main's changed buyer contracts. Typecheck, both Worker dry-run bundles, native Worker startup, audit, claims and docs checks passed again; all 33 field-accounting tests also passed. The full run above remains explicitly the pre-rebase snapshot; GitHub's full suite on the final combined tree is a merge gate.


## 2026-09-09 — Commission purchase recovery

- [x] Retain the complete accepted commission brief, quote note, rung price, delivery window and buyer name before settlement. The contact channel is excluded from the retained purchase and returned terms. A failed capture submits no payment.
- [x] Recover the original order after interrupted certificate, order or desk writes. Preserve the original order ID, brief, acceptance time and SLA, and return later completed work on authenticated retries. The original brief is no longer cut to a 600-character desk preview.
- [x] Run authenticated purchase lookup before the desk's shelf and quote checks. A closed shelf, expired/changed quote or deleted quote row cannot replace the already purchased brief or trigger a second settlement. An existing desk row is repaired to the original purchased brief, quote terms and acceptance time. Private purchase status and the order endpoint remain retrieval paths when the quote row is gone.
- [x] Expose truthful settled/unknown states and the private status handle for interrupted commission delivery; advertise that recovery on the served rung challenge. Never reconstruct an older commission as a generic collab when its original brief was not retained.

The new public HTTP matrix uses locally signed payments on every configured checkout rail. The initial 51 new cases and revised discovery claim failed against the original tracked source (52 failures; 14 existing controls passed). A separate negative control removed only the missing-brief safeguard and reproduced unsafe generic fulfillment. Review then found an immediate-retry gap before the alarm: both the newly recorded and legacy commission variants were reproduced failing before the spent-nonce guards. Five additional negative controls exposed a changed quote surviving in the public desk after recovery; the accepted desk now publishes the retained terms. The expanded matrix contains 52 cases, including immediate retries on every rail. The core 30-case matrix separately failed before the repair and passed afterward. Lost-settlement fixtures retain the actual mocked settlement receipt and later supply that confirmation to recovery; they prove original-brief delivery after confirmation, not live-chain reconciliation. No live purchase or refund was submitted.

This completes newly recorded commission delivery recovery within BUY-017/037; it does not close either parent. Paid publications and historical obligations, including older commissions, remain. Commission capacity and competing fresh authorizations, terms changed before a later payment is admitted, expired verification/missing handles, and ordinary signed human-work binding remain separate work (including BUY-014/015/016/025/035). The returned commission terms are retained purchase data; the existing purchase certificate does not newly sign the full brief. A lost public quote row does not prevent private status/order retrieval; this change does not fabricate the missing contact channel or rebuild that public ledger.

Validation resumed September 10 after the overnight run recorded multi-minute and hours-long test stalls. Rebase onto merged #609 was clean. The 16 affected files were rerun: 1,083 cases passed, with only an independently reproducible passport fixture failure remaining. That fixture seeded an August 25 observation but evaluated its page against the real clock, so its READY expectation expired on September 10. The test now injects the clock into the page handler as well as the fixture and checks both READY and EXPIRED against the returned validity boundary; production freshness behavior is unchanged. No timeout or assertion was weakened.

Final local validation on merged #609: all 633 files ran; 10,657 tests passed, two failed and one existing conditional test was skipped (2,069.50 seconds). Every source/test file stayed unchanged during that run, and all 52 commission regressions passed. The remaining failures were the new-main bounty fixture reading a September 8 sprint against the real clock after its expiry, and the import-graph guard treating an inline commission type reference as a runtime import. The bounty page now shares the fixture clock and tests removal after expiry; the commission reference is an explicit type-only import. Both failures and the related recovery/door checks then passed: 396 tests across 12 files, plus typecheck and both Worker builds. All four generated Worker JavaScript outputs are byte-identical before and after those final fixes. Native startup, audit, claims and docs checks passed. No timeout was raised, assertion removed or skip added. The full run itself was not wholly green; its two identified failures were corrected and rechecked without changing runtime JavaScript.


### 2026-09-10 — Paid publication recovery

- [x] Retain the exact prepared markdown and content type before settlement for Almanac pages, Gazette issues and Zodiac archive pages. Empty pages and failed purchase capture submit no payment.
- [x] Retrieve the original edition after edits or removal, preserving its settlement receipt and private status handle. Authenticated recovery precedes current shelf admission; retries and concurrent duplicate requests do not settle again.
- [x] Preserve the original page through lost settlement answers, failed confirmation writes and post-settlement response failures. Unknown payment remains unknown until confirmed; the existing alarm can publish the retained good after confirmation.
- [x] Retrieve the same purchased page with the private HTTP status endpoint or MCP `check_purchase`; advertise the base64 JSON `Purchase-Recovery` response header. Cached same-key responses retain that private handle too.

The new matrix initially contained 95 local tests across all three shelves and every configured checkout rail. Against the original source, 94 failed and the existing missing-page safety control passed; all 95 pass with the fix. A separate negative control caught the idempotency cache dropping the newly added recovery handle. Shared payment, commission, import-boundary and discovery integration checks passed (215 tests before the final response-loss and empty-page cases were added). All payment and confirmation evidence is local fixture data. Lost-settlement tests retain the actual mock settlement result and later supply it as confirmation; they do not establish live-chain finality. No live purchase or refund was submitted.

This completes newly recorded publication recovery within BUY-017/037. Those parents remain open for historical obligations whose original inputs or goods were never retained, including older commission/publication purchases. Original finding completion remains **19/39**. Quote edits before payment admission, expired authorization verification, missing private handles and competing fresh authorizations remain separate work (including BUY-014/015/016); the retained edition is the page prepared for the accepted payment, not a version reserved by the earlier quote. Publication purchases still return markdown and do not mint a per-purchase certificate.

Review before shipping found that a lost-settlement reconciliation counted a publication's optional tip as base price. Five additional rail cases first failed on missing original-price capture, then failed through both actual reconciliation readers with a zero tip instead of the paid tip. The retained page now includes its original minimum price; both EVM and Solana readers derive the tip from that retained price. This expands the matrix to 100 cases. The first broad run was stopped without reported test failures to include this accounting fix; a fresh full run is required before commit.

Final pre-rebase local validation passed all 634 test files: **10,759 tests passed, one existing conditional skip** (1,923.71 seconds). Every source/test file stayed byte-identical throughout the run. Typecheck, both Worker bundles, native startup and doors size/import checks, audit, claims, and docs checks also passed. Main changed during validation: PR #610 supplies its own equivalent clock-fixture fixes and OpenAPI headroom repair. Rebased onto merged #610 (`1f97e1a1`), keeping main's equivalent clock fixes and dropping the duplicate fixture commit. The only changed source/test bytes were OpenAPI source and tests plus the two upstream clock fixtures; all commission/publication recovery code and tests stayed unchanged. All **383 post-rebase checks across 20 files passed**, including the new OpenAPI headroom tests, both recovery matrices, private status/reconciliation, door parity and import guard. Typecheck, both Worker bundles, native startup and its size/import boundaries, audit, claims and docs checks passed on the combined tree. The startup instrument was retried after an idle child failed to exit; no source or assertion changed. Commission and publication repairs remain separate commits and are grouped in PR #611 to avoid a second simultaneous full CI run.

### 2026-09-10 — Historical paid-purchase resolution

- [x] Require evidence before clearing every retained paid obligation, including instant goods, commissions, all publication shelves and retired catalogue products. An outcome label, missing current catalogue entry or malformed old record cannot bypass the check.
- [x] Reuse the durable signed-resolution coordinator for full finalized USDC refunds on every configured checkout rail. The original and refund transfers must match the buyer, receiving wallet, network and amount; one refund cannot resolve two purchases, including concurrent submissions. Existing coordinator names and keys stay intact so historical and new refund claims share the same reuse guard.
- [x] Return the signed terminal resolution through the original HTTP door, both catalogue MCP profiles and authenticated private status. Check it before cached delivery and background reconstruction. Retain historical corrections and recover a resolution after its desk projection disappears.
- [x] Make the keeper's directions name the evidence-backed resolution endpoint. Only authentic completed human orders use the completed-work outcome; missing nonhuman goods require a verified full refund or remain open. The resolution operation sends no payment.

The new regression matrix covers all current catalogue products plus commissions, publications and a retired product for label-only refusal. Paid-door refund retrieval covers a canonical instant good, commissions and all three publication shelves on all five configured rails; the catalogue good also exercises both MCP profiles. Private-status and background checks cover instant goods and publications. Additional controls exercise incorrect amounts, RPC failure, concurrent refund reuse, historical corrections, retired products, tampered signatures, unauthorized readers and malformed records. Against the original source, 101 of the initial 103 cases failed, with the two existing human-product controls passing. The separate keeper-guidance regression also failed before its copy repair. All 104 final new cases pass; the related human-resolution and delivery-audit gate passed 179 cases before the final guidance addition. No live purchase, refund or production obligation inventory was performed.

BUY-017 and BUY-037 remain open specifically for the remaining legacy retry paths: an older payment must never construct replacement evidence from today's page or a retry's input when the original good is missing. This increment completes the verified-resolution mechanism; it does not claim that those legacy retry guards or any production customer refunds are complete. The parent count remains 19/39.

Final local validation passed all 636 files: 10,864 tests passed with one existing conditional skip (1,956.87 seconds). The source and test snapshot remained unchanged throughout the full run. Typechecking, both Worker dry-run bundles, native Worker startup and the discovery Worker size/import boundary, audit, claims and docs checks passed. This branch builds on the already reviewed commission/publication recovery in PR #611; its pending GitHub run is not a failed check.

### 2026-09-10 — Historical retry guard and recovery SEV-1 closure

- [x] The generic HTTP/MCP legacy fulfillment fallback is removed. A spent authorization, desk preview or matching request digest cannot create a replacement good from retry inputs or today's evidence.
- [x] The existing original-artifact, saved-response, original-human-order and signed-resolution recovery paths remain ahead of the refusal. The historical delivery row stays open when those records cannot supply the purchased good.
- [x] Legacy Solana attempts are located through their signed transaction and retained delivery obligation; EVM authorization fields are never used as Solana identity. Payer comparison preserves base58 case.
- [x] Authenticated historical rows report `charged:true`, `charged_again:false`, `settlement_attempted:false` and `original_inputs_unavailable`, with a keeper contact and instructions to keep the original payment. Missing, mismatched or malformed identity records report `charged:null` and disclose no transaction/payer/amount. The missing historical chain is never inferred from today's offer.
- [x] New regression coverage derives the catalogue and enabled rails: every catalogue item through HTTP and both MCP profiles, all five configured fixture rails, matching and changed input; older commissions and all publication families; missing or different payer, invalid amount and invalid timestamp. All 106 catalogue/publication/identity tests failed against the original implementation. Three additional unlinked-payment regressions failed before the no-new-quote response fix; standard MCP previously regenerated payment terms on that refusal. The 164 focused cases passed before this additional guard, and its three new public-door controls pass afterward.

Final validation: **10,974 tests passed across 637 files**, one existing key-continuity skip, zero failures (2,011.31 seconds). Source/test hashes were unchanged throughout the run. Typechecking, both Worker bundles, native startup, audit, claims and documentation checks pass. The new legacy matrix contributes 109 cases; preserved recovery and verified-resolution positive controls also pass in the full suite.

Together with the earlier original-record recovery and #614 verified-resolution work, this closes BUY-017 and BUY-037. Completed original findings rise from 19/39 to **21/39**, and all **6/6 SEV-1s** have tested repairs. No production payment, refund or historical-customer inventory was performed. Irrecoverable historical obligations still require the keeper to supply authentic original-work or finalized-refund evidence; a status message alone does not count as fulfillment.


### 2026-09-10 — Atomic admission for concurrent fresh authorizations

- [x] Bind one authenticated purchase scope and idempotency key to one payment identity through a real Durable Object transaction, before settlement. Preserve the existing payment-identity coordinator as the second guard against duplicate submission of the same authorization.
- [x] Look up the claimed purchase before new-sale admission. Unknown settlement, a closed human shelf, response-cache loss and object eviction cannot authorize another charge. Completed goods and signed refund resolutions remain ahead of replacement fulfillment and stale cached goods.
- [x] Fail closed on unavailable claim reads/writes and lost write replies. A claim whose reply was lost can be resumed by its original signed payment; the per-payment record still admits settlement only once. A different authorization waits for the original record and cannot take ownership.
- [x] Cover catalogue HTTP and both MCP profiles, including mixed-profile races, every enabled fixture rail, commissions and all three paid publication shelves. EVM wallet scope remains shared across EVM rails; Solana case remains identity. Deliberately choosing a new key for a new purchase remains possible.
- [x] Withdraw the public claim that idempotency cannot refuse a purchase. Explain that unresolved or unreadable admission stops settlement and that the original payment/key must be retained.

The expanded 136-case race matrix was run against the pre-fix source: every case failed on two settlement submissions instead of one. The 15 refund-precedence cases failed before the original key was resolved ahead of cached goods. Removing only the key-to-purchase lookup reproduced 33 failures across pending, cache-loss and cross-rail retrieval. Fifteen additional races hold both requests immediately before their real Durable Object claims; all fail with two settlement submissions when the claim is allowed to overwrite a different payment identity, and pass with the retained first owner. The revised public-guidance guard failed against the former wording. Failure injection also found a lost-claim-acknowledgement recovery defect on all three profiles; that owner-resumption path was corrected without releasing the claim.

New key claims use the existing `PAID_RECOVERIES` SQLite namespace, one instance per hashed scope/payer/key, and retain only the original payment-record ID. No binding migration, new dependency or production state rewrite is required. Claims persist beyond the optional 24-hour response cache; they never time out into permission to charge an unknown purchase. A definitive declined purchase retains its original status; a deliberate new purchase uses a new key. Existing HTTP and MCP purchase scopes remain distinct; the two MCP payment profiles share their scope. Historical purchases with no retained key association cannot be retroactively protected from an unknown prior fresh authorization by this change. Expired verification, missing recovery handles and changed suggested keys remain BUY-014/015. These are local signed fixtures, not live purchases, refunds or a customer-obligation inventory.

The complete sweep also exposed two existing fixtures that reused a suggested key after resetting only KV at a frozen clock. Independent receipt-integrity and rail-identity cases now use distinct purchase keys, while each retry keeps its original key; their assertions are unchanged. The explicit “no second charge” promise remains in wallet-safety copy beside the pending-status explanation. PR #620's first CI attempt exhausted one aggregate identity test's timeout and then failed the next transfer counter. An unchanged CI rerun timed out all three aggregate identity tests. Those existing identity cases are now separate tests with unchanged assertions and timeouts, so one 20-case aggregate no longer shares a single test budget.

Full local sweep: **11,260 passed across 644 files**, one existing key-continuity skip, and four failures in two files during a confirmed laptop lid-close sleep (2,693.02 seconds). Both affected files passed unchanged on rerun: **266 passed**, including all four interrupted cases. No test timeout was increased. All 1,338 source/test files and eight additional runtime/build inputs matched their pre-run hashes, with no added or removed source/test files. Typechecking, both Worker dry-run bundles, native startup, audit, claims and docs checks passed. The 208 new atomic-key regressions include the observed failing controls above. This repair is prepared for the grouped update to PR #620; deployment remains subject to its required checks and merge. BUY-016 raises unique original finding completion to 22/39; the 17 remaining findings retain their own scope.


### 2026-09-10 — Signed-payment recovery after expiry or lost keys

- [x] Recover original goods through HTTP and both MCP profiles when checkout verification rejects an expired or spent payment, even with a missing or changed idempotency key. An ordinary new purchase still requires the complete checkout verification and settlement path.
- [x] Authenticate EVM EIP-3009 signatures and Solana transaction signers locally for recovery. Fee-payer identity alone is insufficient; the signer must match the retained purchase. New verified purchase records retain only a one-way fingerprint of the original wire payment, allowing exact contract-signature replay without retaining executable payment bytes. Older records remain readable without that optional field.
- [x] Read retained responses, orders, purchased publication bytes and signed resolutions. Preserve commission quote/price/window metadata and updated human work. A missing response is a pending obligation, never permission to mint a replacement. Changed product/inputs return the original private status handle; signed resolutions remain terminal answers.
- [x] Recover through verification transport and initialization failures. Preserve truthful unknown settlement and stop without payment when storage cannot supply the original purchase. Preserve original keys in HTTP, legacy MCP and standard MCP refusal instructions, and distinguish the current verification attempt from earlier outcomes.

The complete new-regression control run against the preceding source produced **291 failures**, with 280 existing/control cases passing. Every source file was restored byte-for-byte afterward. Disabling local signature checks separately produced **78 failures** in the authentication controls; the correct verifier was restored. Fifteen additional startup-sync cases failed before the recovery catch covered initialization. Eighteen human-purchase controls passed with the reader and failed when it was bypassed, covering closed shelves, completed work and unreadable storage. Eight contract-signature cases exposed UTF-8 decoding damage to fingerprint input, and five commission cases exposed loss of the purchased quote in the response; both were corrected. No timeout was raised.

The payment signatures and contract-verifier verdicts are local fixtures. No live purchase, refund or production-customer inventory was performed. A retained fingerprint is an exact prior-verification proof, not a fresh signature check or permission to spend. Historical contract signatures without a fingerprint still need a usable private handle, Claims where supported, or keeper resolution; missing historical purchase associations cannot be invented. Preserve the original signed payment privately. The new reader never calls fulfillment, reconciliation or settlement, and it cannot turn expired authority into another payment.

Final local validation on the combined tree completed all **651 files**: **11,762 tests passed, one existing key-continuity skip, and three explanatory-text guards failed** (2,775.77 seconds). All 1,351 source/test files and eight runtime/build inputs stayed byte-identical throughout the sweep, with no added or removed files. The three final changes only restore the literal Idempotency-Key header and second-charge explanation, name Solana's BlockhashNotFound error, and explicitly name the correction's regression tests. All **507 follow-up tests across ten files passed**, including all three former failures and the expiry/authentication/fault matrices; no assertion or timeout was weakened. Typechecking, both Worker bundles, native startup, audit, claims and docs checks passed on the final text. The discovery Worker stays below its existing size limit and excludes fulfillment code; the retained commission formatter is a pure module shared with checkout.

The preceding full attempt exposed three old Solana expectations that blocked even authentic recovery during verifier refusal. Their replacement controls reject a corrupted buyer signature while retaining the transaction ID and allow only the authentic original payment to recover; all three recovery assertions failed with the reader disabled, and all 321 Solana replay cases passed in the completed combined sweep. A separate earlier attempt was interrupted by a confirmed 900-second laptop sleep: its two affected files passed unchanged (29 tests). That incomplete attempt was superseded when upstream PRs #621/#624 introduced release-text conflicts; both upstream changes and the buyer repair are preserved in the combined tree. No sleep-related failure occurred in the final completed sweep. This is prepared as one grouped update to PR #620, whose previous head passed required CI but became conflicted while main advanced. Publication and deployment remain subject to the new head's required checks and merge.
