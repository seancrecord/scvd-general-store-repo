# Buyer repair checklist

Checked means the repair is committed and its regression was observed failing before the fix and passing afterward. It does not mean deployed. PRs #540, #544, #549, #551 and #552 have merged; #541 remains a draft. All payment tests use local fixtures.

The full audit contains six SEV-1 findings. The three wrong-good cases are BUY-001, BUY-005, and BUY-028; the other three require durable payment and delivery recovery.

## SEV-1 findings

- [x] **BUY-001 — SEV-1: empty essential text can settle** — fixed locally; commit ed57dc36; PR #540.
- [x] **BUY-005 — SEV-1: a new case-file purchase returns the old claim** — fixed locally; commit 929d6b3a; PR #540.
- [ ] **BUY-017 — SEV-1 fault case: lost settlement acknowledgement can leave no artifact and report “No charge”** — partial: unknown-state responses repaired in `092c3a2f`; durable intent/recovery after reconciliation remains open.
- [x] **BUY-028 — SEV-1: an invalid renewal target buys a different pass** — fixed locally; commit 01489c05; PR #540.
- [ ] **BUY-034 — SEV-1: a settled human purchase can have no order and false delivery recovery** — partial: HTTP retries preserve the owed-delivery record and report the confirmed charge when only a certificate exists or lookup fails. Checkpointed human orders now reconstruct with stable IDs, original briefs/terms and preserved completed work; legacy purchases and other artifacts remain open.
- [ ] **BUY-037 — SEV-1: MCP cannot reconstruct some settled purchases even with the original key** — partial repairs `f8f8d34f` and `3ce5d0bc` in draft PR #541; interrupted partial writes and legacy input bindings remain open.

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
- [ ] **BUY-012 — P1: MCP accepts new labor orders after the weekly stock limit** — open.
- [ ] **BUY-013 — P1: MCP sells labor after the open-work queue reaches its ceiling** — open.
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
- [ ] **BUY-036 — P2: capacity refusal explains itself only in prose** — open.
- [x] **BUY-038 — P1: MCP can claim no charge after paid response serialization fails** — fixed in `6b23454c`; PR #541 (draft).
- [x] **BUY-039 — P1: discovery labels a paid delivery failure as unpaid** — fixed locally; commit 0b61e5fc; PR #540.

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

Completed-result follow-up: four public MCP regressions failed at receipt replay on the prior code (Base/Polygon, cache loss/completion-response loss); all pass with authenticated durable reads. Final focused gate: 212 tests across nine files, typecheck, and both dry-run bundles. This does not cover a crash before the complete result is saved. PR #541 remains draft while recovery gaps and its Cloudflare preview build failure are unresolved.

BUY-038: all 30 new failure-injection cases were observed red before the repair and green afterward. Coverage includes Base/Polygon/Solana, legacy/standard payment profiles, tool text/JSON-RPC/modern envelope encoding, and EVM cached replay. Identical EVM retries return the original verifiable artifact without settlement, and only an encoded response closes its delivery row. The final related gate passed 236 tests across seven files, typecheck, and both dry-run builds. Solana retry recovery remains BUY-007; partial fulfillment remains BUY-034/037.

## Solana retry repair

BUY-007: HTTP and both MCP payment profiles now use the Solana token payer returned by successful verification, carried through request-local state. Valid same-key retries return the original cached good before settlement. Solana public-key case is preserved; EVM address normalization stays compatible. A missing or malformed verified payer refuses with `payment_identity_unavailable`, `charged:false`, and an instruction to retain the original payment and key; both discovery doors publish that outcome.

The catalog-wide signed-fixture regression covers 32 products, three doors and three retry modes: identical transaction, fresh transaction, and a processor that rejects rebroadcast. The original 304 runtime checks and two discovery checks were observed red. The broader focused gate passed 397 tests across nine files, with typechecking and both Worker dry-run builds passing. Cross-buyer, tampered-signature and concurrent cached-retry controls preserve authentication. No live payment was submitted; the full suite runs on GitHub.

This closes the missing Solana cache identity, not every retry failure. Stock admission before replay (BUY-008), unavailable/expired verification (BUY-015), concurrent initial charges (BUY-016), and durable recovery (BUY-017/034/037) remain open.

## Input-contract repairs

BUY-003: non-text JSON is refused for every advertised string field before quoting or verification. The public-door matrix covers all 32 current products, five invalid JSON types, and signed controls for five buyer fields on every offered rail. All 37 new tests failed on unchanged source. The repaired gate passed 70 tests across four files and typechecking. The full suite remains delegated to GitHub.

BUY-004: the schema and validator share one purpose limit. Both doors reject excess length before quoting or verification; accepted text is signed exactly as sent, with Unicode code-point counting and no post-payment truncation. All 44 new controls were observed red before the fix. The related gate passed 105 tests across four files, typecheck, and both Worker dry-run bundles. This also fixes purpose-specific whitespace/Unicode loss; BUY-009 and BUY-026 remain open for their other affected fields.

BUY-010: buy_simple now derives all optional receipt fields from its eligible products, keeping only item_id required and no conditional branches. The served-schema and three-rail literal-buyer controls all failed before the fix; they now verify purpose survival and price agreement through both simple and theme shelves. The final combined gate for BUY-003/004/010 passed 112 tests across six files, typecheck and both Worker dry-run builds. BUY-002 remains open: changing bare HTTP purchase URLs from discovery probes to strict purchase requests requires a coordinated discovery/client transition.

Recovery release prerequisite: PR #542 adds only the coordinator storage class/binding/migration. Cloudflare preview error 10211 requires this additive migration to be applied by main's regular deployment before #541's preview can upload. PR #542 merged as `e00307bd` and its production Worker build succeeded (version `6c3ac7a3-4ce7-4f9d-88e2-84e169f32673`). The consumer preview is being rechecked after merging main. This release prerequisite does not close BUY-037.

## BUY-017 progress (finding remains open)

- [x] Report thrown/lost settlement acknowledgements and unconfirmed transaction claims as `charged:null`, `payment_state:unknown`, with the existing reconciliation reference and same-payment guidance. HTTP returns 503; both MCP profiles signal errors. The discovery contract names the state too.
- [ ] Preserve a durable purchase intent and stable buyer status handle across ambiguity and retries.
- [ ] Complete the original good once settlement is established, including rails without an immediate chain rescue.

The 27 public-door fault cases were observed red before the repair, including identical retries after a simulated landed payment, on Base/Polygon/Solana through HTTP and both MCP profiles. The discovery guard separately failed before the code was advertised. These fixtures do not prove live settlement, automatic reconciliation delivery, or universal retry safety; the SEV-1 stays unchecked.

## BUY-011: confirmed settlement refusals

- [x] Preserve the processor's refusal reason and explicit `charged:false`, `payment_state:not_settled` on both doors.
- [x] Mark the result `isError:true` for both MCP payment profiles; the standard profile retains the refusal instead of replacing it with a fresh quote.
- [x] Describe the tool-result error in the served discovery contract.

All 192 catalog × three-rail × two-profile public-door comparisons failed before the repair; each checks both HTTP and MCP reached settlement, the same machine-readable reason, and no certificate or order. They passed after the fix, along with the separately red discovery assertion. This closes BUY-011; it does not close the unknown-settlement or fulfillment-recovery findings.
