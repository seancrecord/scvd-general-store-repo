# Buyer repair checklist

Checked means the repair is committed and its regression was observed failing before the fix and passing afterward. It does not mean deployed. PRs #540, #544, #549, #551 and #552 have merged; #541 has merged. All payment tests use local fixtures.

The finding rows below are the current status; dated entries retain earlier status and validation counts.

The full audit contains six SEV-1 findings. The three wrong-good cases are BUY-001, BUY-005, and BUY-028; the other three require durable payment and delivery recovery.

## SEV-1 findings

- [x] **BUY-001 — SEV-1: empty essential text can settle** — fixed locally; commit ed57dc36; PR #540.
- [x] **BUY-005 — SEV-1: a new case-file purchase returns the old claim** — fixed locally; commit 929d6b3a; PR #540.
- [ ] **BUY-017 — SEV-1 fault case: lost settlement acknowledgement can leave no artifact and report “No charge”** — partial: verified purchase intents, truthful payment status and original-evidence recovery are implemented for the checked product families below. Remaining product families and historical obligations still need delivery recovery or explicit resolution.
- [x] **BUY-028 — SEV-1: an invalid renewal target buys a different pass** — fixed locally; commit 01489c05; PR #540.
- [x] **BUY-034 — SEV-1: a settled human purchase can have no order and false delivery recovery** — human-purchase repair complete: checkpointed orders reconstruct; authentic legacy orders return their original work; irrecoverable briefs require a durable signed resolution backed by completed original work or a finalized full refund. This is a tested repair and manual-resolution mechanism, not a claim that production customers have been refunded. See the resolution evidence below.
- [ ] **BUY-037 — SEV-1: MCP cannot reconstruct some settled purchases even with the original key** — partial: HTTP and both MCP profiles recover the checked product families from authenticated purchase records. Uncheckpointed products and older purchases missing original input/evidence bindings remain open.

## How to read progress

The parent count measures complete original findings, not commits or equal-sized units of work. The recovery findings span products, HTTP/MCP profiles, rails, partial writes and historical records. The checked substeps below are completed work inside those findings; some overlap, so they must not be presented as a count of unique fixes. CI/build repairs are tracked separately and do not close a buyer finding.

The two remaining recovery parents need a product-by-product finish line. Existing complete coverage is named by `supportsArtifactRecovery()` in `src/lib/artifact-checkpoint.ts`. Partial progress and CI repairs must stay visible without counting either as a fully closed buyer finding. A 2026-09-08 snapshot derived from `MENU_ITEMS.filter(supportsArtifactRecovery)` admits 18 of the 33 current catalogue products to artifact recovery. That is implementation coverage, not a claim that all historical obligations or non-catalogue commissions are resolved; the open parents retain those limits.

## Recovery SEV-1 status

The checked substeps below are completed repairs, not provisional work. An open parent does not mean those repairs failed. The original audit and regression evidence use local fixtures, including deliberately constructed legacy state; this checklist is not an inventory of unresolved production customer orders.

- **BUY-017:** finish original-deliverable recovery for the remaining paid product families after an ambiguous settlement answer. A truthful unknown/settled status is necessary but does not itself deliver the good.
- **BUY-034 — complete:** original human work is recovered when retained, and a missing brief cannot be replaced by retry input or a desk preview. An authenticated completed order or finalized refund can now resolve the obligation durably. Missing payment identity/handles and expired verification remain BUY-014/015; unrelated instant-product recovery remains BUY-017/037.
- **BUY-037:** finish equivalent authenticated MCP recovery for the remaining products and older purchases whose original input/evidence was never retained. The original payment must not buy replacement evidence or trigger a second charge.

Inventory and commission side effects need their own recovery proof before those products join the supported set. Missing private recovery handles and expired/rejected verification also remain tracked under BUY-014/015; they must not disappear merely because a product's reconstruction substep passes. Parent closure needs explicit evidence for the remaining obligation or a documented resolution, not an unchecked promise to reconstruct data the store never retained.

## Remaining findings

- [ ] **BUY-002 — P1: invalid HTTP requests receive usable payment terms** — open.
- [x] **BUY-003 — P2: MCP silently coerces wrong primitive types into text** — fixed in `94561d25`.
- [x] **BUY-004 — P2: over-limit purpose silently truncates after payment** — fixed in `35df82f6`.
- [ ] **BUY-006 — P1: observation signatures are overwritten in the purchase response** — open.
- [x] **BUY-007 — P1: Solana retries bypass the purchase cache** — repaired on `codex/buyer-solana-replay`: verified Solana payer scopes cached retries; missing identity safely refuses settlement. Merged in PR #551; production release is a separate status.
- [x] **BUY-008 — P1: HTTP stock checks block recovery of an already-paid order** — authenticated cached/recoverable purchases now precede weekly stock, shutter and capacity admission. MCP also preserves paid replay when its shutter closes; new sales still run their admission checks.
- [ ] **BUY-009 — P1: valid text advertised as verbatim is changed** — open.
- [x] **BUY-010 — P2: the first MCP purchase shelf forbids a supported field** — fixed in `df3b1e64`.
- [x] **BUY-011 — P1: MCP returns a settlement refusal as a successful tool result** — repaired: both MCP profiles return an error tool result with the same refusal reason and no-charge state as HTTP.
- [x] **BUY-012 — P1: MCP accepts new labor orders after the weekly stock limit** — MCP now checks the shared weekly inventory before quotes or new settlement; authenticated paid replay remains available. Both payment profiles return the HTTP waitlist instructions.
- [x] **BUY-013 — P1: MCP sells labor after the open-work queue reaches its ceiling** — both MCP profiles now apply the shared per-item/global queue verdict before quotes or new settlement, including refusal when counting is incomplete. Paid recovery precedes admission.
- [ ] **BUY-014 — P1: a spent payment without its original key does not retrieve the receipt** — open.
- [ ] **BUY-015 — P1: payment expiry blocks receipt replay, and the suggested replacement key can charge again** — open.
- [ ] **BUY-016 — P1: concurrent fresh authorizations bypass the same-key safeguard** — open.
- [x] **BUY-018 — P1: a Solana signer can claim an EVM payer's cached receipt** — fixed locally; commit 005df923; PR #540.
- [x] **BUY-019 — P1: malformed Solana settlement IDs are signed into receipts** — fixed locally; commit 1a0b3827; PR #540.
- [ ] **BUY-020 — P2: OpenAPI budget guidance quotes an obsolete range** — open.
- [ ] **BUY-021 — P2: purchase receipts recommend a four-tenths-cent good for one-tenth cent** — open.
- [ ] **BUY-022 — P2: the purchased blessing and fortune text is not signed** — open.
- [ ] **BUY-023 — P2: a confession buyer cannot prove which confession was heard** — open.
- [ ] **BUY-024 — P1: term-service receipts do not prove the purchased commission** — open.
- [ ] **BUY-025 — P1: completed human work is not verifiably bound to the brief** — open.
- [ ] **BUY-026 — P1: character cuts damage Unicode in signed fields and badges** — open.
- [ ] **BUY-027 — P1: malformed optional observation constraints are billed** — open.
- [ ] **BUY-029 — P1: an invalid callback silently disappears after payment** — open.
- [ ] **BUY-030 — P1: a trailing-dot own hostname bypasses the purchase refusal** — open.
- [ ] **BUY-031 — P1: paid human callbacks skip destination validation** — open.
- [ ] **BUY-032 — P1: callback redirects are not confined to approved destinations** — open.
- [ ] **BUY-033 — P2: buyers cannot see callback failure or its retry policy** — open.
- [ ] **BUY-035 — P1: concurrent buyers oversubscribe the last human slot** — open.
- [ ] **BUY-036 — P2: capacity refusal explains itself only in prose** — MCP now returns capacity_unavailable, charged:false and open_orders/cap; HTTP/commission refusal fields remain open.
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

Every repair gets a separate commit. The focused regressions exercise the public purchase doors, with the served catalog and local payment processor fixtures; they do not establish live-chain settlement or production deployment.

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
- [ ] Extend capture to commission/publication doors and recover a lost status handle after payment verification expires.
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
