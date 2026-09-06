# Buyer repair checklist

Checked means the repair is committed and its regression was observed failing before the fix and passing afterward. It does not mean deployed. All payment tests use local fixtures. The initial six repairs are published in [PR #540](https://github.com/seancrecord/scvd-general-store-repo/pull/540), with auto-merge enabled after required checks; production deployment is a separate status.

The full audit contains six SEV-1 findings. The three wrong-good cases are BUY-001, BUY-005, and BUY-028; the other three require durable payment and delivery recovery.

## SEV-1 findings

- [x] **BUY-001 — SEV-1: empty essential text can settle** — fixed locally; commit ed57dc36; PR #540.
- [x] **BUY-005 — SEV-1: a new case-file purchase returns the old claim** — fixed locally; commit 929d6b3a; PR #540.
- [ ] **BUY-017 — SEV-1 fault case: lost settlement acknowledgement can leave no artifact and report “No charge”** — open.
- [x] **BUY-028 — SEV-1: an invalid renewal target buys a different pass** — fixed locally; commit 01489c05; PR #540.
- [ ] **BUY-034 — SEV-1: a settled human purchase can have no order and false delivery recovery** — open.
- [ ] **BUY-037 — SEV-1: MCP cannot reconstruct some settled purchases even with the original key** — partial repair in `f8f8d34f`; remains open until interrupted reconstruction and retained older purchases can recover safely.

## Remaining findings

- [ ] **BUY-002 — P1: invalid HTTP requests receive usable payment terms** — open.
- [ ] **BUY-003 — P2: MCP silently coerces wrong primitive types into text** — open.
- [ ] **BUY-004 — P2: over-limit purpose silently truncates after payment** — open.
- [ ] **BUY-006 — P1: observation signatures are overwritten in the purchase response** — open.
- [ ] **BUY-007 — P1: Solana retries bypass the purchase cache** — open.
- [ ] **BUY-008 — P1: HTTP stock checks block recovery of an already-paid order** — open.
- [ ] **BUY-009 — P1: valid text advertised as verbatim is changed** — open.
- [ ] **BUY-010 — P2: the first MCP purchase shelf forbids a supported field** — open.
- [ ] **BUY-011 — P1: MCP returns a settlement refusal as a successful tool result** — open.
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
- [ ] **BUY-038 — P1: MCP can claim no charge after paid response serialization fails** — open.
- [x] **BUY-039 — P1: discovery labels a paid delivery failure as unpaid** — fixed locally; commit 0b61e5fc; PR #540.

## Verification and scope

Every repair gets a separate commit. The focused regressions exercise the public purchase doors, with the served catalog and local payment processor fixtures; they do not establish live-chain settlement or production deployment.

The broad untracked audit probes intentionally fail for unresolved findings. They remain separate from the normal regression gate; they have not been deleted or relabeled as passing.

Final validation on the repaired current-main snapshot covered 552 test files: 551 passed, with one outdated source-inspection assertion failing (5,244 tests passed, one failed, one skipped). The assertion was corrected to recognize an awaited assigned result, with negative controls for unawaited writes. Its final recheck and the affected receipt/discovery suites passed all 22 tests across three files. Typechecking and both Worker dry-run builds passed. No production source changed after the full run. See the [verification record](buyer-repair-progress-2026-09-06.md).

## BUY-037 progress (finding remains open)

- [x] Reconstruct the reproduced pre-certificate failures using the original verified payer, chain, amount, receipt and full input digest — `f8f8d34f`.
- [x] Prevent overlapping recoveries from minting competing certificates, using a durable per-transaction claim — `f8f8d34f`.
- [ ] Resume a recovery that itself stops after its durable claim, including crashes and partial writes, without guessing whether another certificate exists.
- [ ] Recover retained purchases that predate the complete input binding. Never infer their original inputs from a truncated desk preview.

The completed substeps passed 206 focused tests across nine files, typechecking, and both Worker dry-run builds. The full suite is delegated to GitHub as requested. The three SEV-1 findings BUY-017/034/037 stay unchecked; successful first reconstruction is not the complete durable-recovery guarantee.
