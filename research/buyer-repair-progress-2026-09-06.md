# Buyer repair progress — September 6, 2026

Sean authorized rebasing on main and beginning implementation. Work is local; per-fix commit status is recorded in [the checklist](BUYER_REPAIR_CHECKLIST.md). Nothing was deployed and no real payments were made.

## Rebase

- Fetched `origin/main` at `a35ba5e2`.
- Created `codex/buyer-repairs` from the existing checkout and rebased successfully. Its pre-existing listing-record commit was replayed as `9f6a73f8`; that unrelated change remains intact.
- Four untracked paths now tracked on main were preserved under `/private/tmp/scvd-pre-rebase-20260906/` before rebasing: `docs/THE_MAP_2026-09.md`, `src/lib/buyer-contract.ts`, `test/machine-buyer-entrypoints.spec.ts`, and `test/purchase-refusal-fields.spec.ts`. The refusal-fields file was identical; the other local versions remain in that backup. Main's versions are in the checkout. All other untracked audit work was retained.

## BUY-018 — fixed locally

The verified payment's envelope now determines whether EVM authorization fields may identify a payer. Only exact-EVM v2 payments can supply that identity. A Solana transaction's unsigned adjacent `authorization` object cannot open another wallet's receipt cache or consume an EVM nonce.

Bare authorization fragments remain readable by the existing nonce-extraction path for buyer-supplied attestation evidence. They cannot establish an authenticated payer. This change does not introduce a Solana payer parser or claim to complete Solana idempotency recovery.

Changed source: `src/lib/replay-guard.ts`. New regression: `test/payment-rail-identity.spec.ts`, using the existing isolated buyer harness and disposable signed-payment fixtures.

Before applying the source change, all four regression cases failed: HTTP and MCP each returned another payer's cached receipt for Base and Polygon victim purchases. Afterward all four pass. Each also proves legitimate EVM same-key replay still returns the original receipt without settling again, the Solana signer gets a separate purchase, and its unsigned EVM nonce is not recorded.

Verification commands and outcomes:

```sh
npx vitest run test/payment-rail-identity.spec.ts
# Before fix: 4 failed, reproducing receipt disclosure.

npx vitest run test/payment-rail-identity.spec.ts \
  test/idempotency-replay-authorization.spec.ts test/solana-rail.spec.ts \
  test/settlement-attestation.spec.ts test/settle-rescue.spec.ts \
  test/settlement-unknown.spec.ts test/nonce-bound-settlement.spec.ts
# After fix: 7 files, 45 tests passed.

npx vitest run test/payment-rail-identity.spec.ts \
  test/discovery-hardening.spec.ts test/replay-concurrency.spec.ts \
  test/idempotency-scope.spec.ts
# Final test cleanup and remaining affected checks: 4 files, 24 tests passed.

npm run typecheck
# Passed, including after final test cleanup.

git diff --check
# Passed.
```

The two successful groups contain 65 distinct tests across 10 files; the four new identity tests run in both groups. At that checkpoint, the full repository suite and broad buyer battery had not been rerun. The existing broad audit tests intentionally contain unresolved failures and still need the explicit audit-runner/known-failure integration described in plan step 0. No full-suite or release-readiness claim is made.

## BUY-019 — receipt validation and controlled recovery fixed locally

Successful Solana settlement responses now require the selected network and an identifier decoding to exactly 64 bytes. Validation covers the initial attempt and the retry after a transient processor failure. A malformed response is not a safe decline: both HTTP and MCP report `invalid_settlement_receipt`, `charged:null`, and `payment_state:"unknown"`. HTTP returns 503; legacy MCP uses its coded JSON-RPC error, and standard MCP payment mode returns `isError:true` without a fresh payment challenge.

The existing settlement-unknown record supplies a reconciliation reference. If that write fails, the response still preserves uncertainty and explicitly reports that no reference was recorded. The buyer is told to retain the original payment and key and never authorize a fresh payment while this one is unresolved.

Ten cases across HTTP/MCP and malformed alphabet, wrong decoded length, empty ID, and wrong network were observed failing before the source patch. Afterward they produce no malformed certificate, retain uncertainty, and retrieve a valid signed receipt on retry when the processor supplies the correct acknowledgement. The fixture confirms one distinct transfer throughout. Additional tests cover reconciliation storage failure and standard MCP payment mode.

These are local signed fixtures with simulated settlement. This patch does not supply a new public status endpoint, guarantee recovery after payment expiry, or resolve all existing Solana reconciliation limitations. Unknown records still follow the existing reconciliation lifecycle; the durable purchase/recovery work in batch 2 remains necessary. EVM receipt-format validation is not added by this Solana-specific repair.

## BUY-039 — discovery payment state fixed locally

The product listing generator had labeled `delivery_failed` as `charged:false`. It now derives the field from the error contract: false for safe refusal, true for paid delivery failure, null for an unknown payment. HTTP listings and MCP tools publish the new receipt-error code and recovery instruction. Three discovery checks were observed red before the publication fix and pass afterward.

The buyer harness's Solana identifier encoder was also corrected to preserve leading zero bytes; its previous integer conversion could shorten a valid 64-byte fixture ID. This changes the test instrument, not production payment behavior.

Validation for this patch:

```sh
npx vitest run test/settlement-receipt-integrity.spec.ts \
  test/payment-rail-identity.spec.ts test/settle-retry.spec.ts test/settle-timeout.spec.ts
# 4 files, 21 tests passed at the first receipt-fix stage.

npx vitest run test/settlement-receipt-integrity.spec.ts \
  test/settlement-unknown.spec.ts test/settle-rescue.spec.ts test/machine-buyer-entrypoints.spec.ts
# 4 files, 42 tests passed after adding storage-failure and standard MCP cases.

npx vitest run test/settlement-receipt-integrity.spec.ts \
  test/mcp-tools-answer-rule-57.spec.ts test/surface-contract.spec.ts \
  test/machine-surfaces-fetchable.spec.ts
# Final contract checks: 4 files, 72 tests passed. These groups overlap.

npm run typecheck
# Passed on final source.

npm run build:check
# Both Workers bundled successfully; dry run only.

git diff --check
# Passed.
```

At this intermediate checkpoint, the full repository suite and full buyer battery remained pending, and work was uncommitted. The final validation and commit status below supersede that checkpoint.

## Next after these repairs

Continue the unchecked input-contract findings and the durable payment/delivery recovery work, rechecking changes from main. BUY-017, BUY-034, and BUY-037 remain open SEV-1s. No other finding is closed without independent verification.

## SEV-1 repairs — BUY-001, BUY-005, BUY-028

Sean requested explicit completion checkboxes and a separate commit for each fix. The [completion checklist](BUYER_REPAIR_CHECKLIST.md) records those commits and leaves the unresolved payment-recovery SEV-1s unchecked.

### BUY-001: empty essential text

The shared input checks reject U+0000 before quoting or payment verification. The fields come from the product schema. No removal or silent replacement occurs. Both HTTP and MCP return `bad_request`, `charged:false`, and the offending field. The regression covers the four reproduced products, NUL-only and embedded-NUL strings, and signed requests on every advertised rail. It asserts no verification, settlement, or business-store writes.

Observed red: eight new tests failed before the source fix. Final focused check: 27 tests passed across the new regression and existing door-parity suite. Other input-boundary findings remain open; this does not claim a complete omission matrix or exact preservation of all valid Unicode.

### BUY-005: corrected case-file claims

The case cache now hashes the complete declared assembly input using canonical JSON. Its version separates the repaired identity from existing entries that ignored corrected claims. EVM transaction hash casing is normalized; Solana transaction identifier casing is preserved. The public product description now states that identical inputs reuse an assembly and changed inputs require a new one.

Observed red: both HTTP/MCP corrected-claim tests failed before the fix. Final focused check: 15 tests passed across the new public-door regression and existing case-file suite. The new tests purchase on every advertised rail, verify the corrected claim and different case ID, verify identical-input reuse, and check that the purchase certificate verifies and binds the resulting evidence hash.

### BUY-028: invalid renewal targets

A supplied `pass_id` must name an existing pass before the store quotes or verifies payment. The exact ID is preserved. The check runs again immediately before settlement, and the service cannot silently substitute a new pass when an explicit renewal is missing. Non-string MCP values cannot masquerade as an omitted ID. Omitting the ID still purchases a new pass.

Observed red: seven renewal regressions failed, while two valid-renewal controls passed. After the core fix, all 13 tests in the new regression and existing patronage KV-retry suite passed. Cases cover both doors, invalid and unknown IDs, disappearance after quoting or during verification, direct-service fallback prevention, and correct 30-day extensions on every advertised rail. Additional malformed-value cases are included in the final gate.

This closes the wrong-good fallback. It does not make KV renewal writes atomic or solve a storage failure after settlement; the durable payment/delivery recovery work remains open.

## Commit verification and test-gate repair

Each of BUY-001, BUY-005, BUY-028, BUY-018, and BUY-039 was checked as an independent commit snapshot in a temporary checkout, with typechecking and its focused regressions. BUY-039 was additionally reproduced red as its newly separated one-test file before checking the standalone metadata patch green. BUY-019 is checked after those prerequisite commits.

The first complete-suite attempts hit repeated Workers runtime errors and timed out in `observation-time.spec.ts`. That test loaded the probe module inside the 30-second assertion timer, after replacing global fetch, and cleaned up only on success. The test-only repair moves imports to module scope and restores the mock in `afterEach`; its timeout and all assertions stay unchanged. The old test failed repeatedly at 30 seconds; the repaired file passed all nine tests in 78 milliseconds of assertion time, after about a minute of import work under load.

The full regression gate was rerun with that repair. It includes every tracked regression plus the new fix tests, excluding only the separate, untracked `test/buyer-*.spec.ts` audit probes that intentionally expose still-open findings. Those probes and their raw captures remain intact.

## Verification after the shared checkout moved

During verification, another task rebased the shared feature branch onto `4b95e4f4` and amended the existing listing-record commit as `2f8d45f2`. All buyer repair changes were preserved. The partial-commit snapshots were merged onto that new base, preserving the new payment-discovery and browser-checkout work.

The final full-suite run uses an isolated copy of the updated branch and its repair files. Staging checks the expected branch head and the hashes of all tested repair files before writing the index. This prevents a concurrent edit from being overwritten or an untested version from being committed.

The corrected discovery contracts passed 134 tests for BUY-039 independently, then 159 HTTP/MCP, receipt-recovery and discovery tests with BUY-019 applied. The guide fingerprint was reviewed again against the new main: replacing only the corrected case-file reuse sentence with the old sentence reproduces main's normalized guide digest exactly.

## Final verification and local commits

The final gate ran in `/private/tmp/scvd-buyer-current-check`, isolated at `2f8d45f2` with the final repairs applied. It included all tracked regression specs and the six new buyer regression files. The intentionally failing exploratory audit probes remained outside this regression snapshot and are still preserved locally; plan step 0's explicit audit runner remains unfinished.

- `npm run typecheck` passed.
- `npm test -- --maxWorkers=8 --reporter=verbose` completed: 552 files, 551 passed and one failed; 5,244 tests passed, one failed and one skipped. The only failure was the existing source-inspection assertion in `mcp-door-defers-its-bookkeeping.spec.ts`, which rejected `const reference = await recordSettlementUnknown(...)` despite the write being awaited.
- The detector now accepts an awaited assigned result. A new control test rejects unawaited calls, assigned unawaited promises, void calls, and deferred callbacks. No production source changed after the full run.
- Typechecking passed again. The corrected guard, `settlement-receipt-integrity.spec.ts`, and `delivery-charge-discovery.spec.ts` passed all 22 tests across three files. This is a full run plus a targeted correction/recheck, not a claim of a second clean full-suite invocation.
- `npm run build:check` passed for both Workers, dry run only.
- Every committed repair file was compared by SHA-256 with the verified snapshot before the final documentation commit.

The earlier probe timing/cleanup test repair is commit `b4f9936f`. Each buyer fix was committed separately:

- BUY-001: `ed57dc36`.
- BUY-005: `929d6b3a`.
- BUY-028: `01489c05`.
- BUY-018: `005df923`.
- BUY-039: `0b61e5fc`.
- BUY-019: `1a0b3827`.

The checklist checks off only these six findings. BUY-017, BUY-034, and BUY-037 remain unchecked. All fixes are local on `codex/buyer-repairs`; nothing was pushed or deployed. Settlement in every repair regression was simulated, with no real funds moved. Historical Markdown audit reports are preserved alongside the log; raw JSON captures and exploratory scripts/specs remain local and are not part of this commit.

## PR publication and BUY-037 continuation

Sean requested a PR with auto-merge and asked to leave the full suite to GitHub. The initial repair branch was pushed as [PR #540](https://github.com/seancrecord/scvd-general-store-repo/pull/540), with merge commits selected so the individual fix hashes survive. Auto-merge is enabled and required checks remain the gate. No local full-suite rerun was made for publication.

Follow-up work is isolated on `codex/buyer-mcp-recovery` at `/private/tmp/scvd-buyer-mcp-recovery`. Commit `f8f8d34f` is a bounded BUY-037 repair; the finding remains open.

The new MCP path verifies the payment before recovery, checks its payer, network, path and complete canonical input digest against the original delivery record, and uses the saved payment facts without calling settlement again. The original truncated desk preview remains a preview, never a recovery identity. Incomplete certificate reads, changed inputs and an already-minted partial delivery return a paid failure without new payment terms or a false delivery claim.

An explicit concurrency control reproduced two certificates from one payment in the first candidate. `PaidRecoveryStore`, one Durable Object per network/transaction, now records a claim before reconstruction and saves its response afterward. Overlapping requests cannot claim a second mint. The binding and SQLite class migration are included in the Worker configuration. A missing coordinator fails closed for reconstruction and leaves ordinary purchases unchanged.

An unfinished claim never expires into permission to mint again. This prevents duplicates after a crash, but recovery of that interrupted attempt remains unfinished. Likewise, older delivery records without the complete digest cannot safely be reconstructed from their truncated input previews. These limits are why BUY-037 remains unchecked, alongside BUY-017 and BUY-034.

Validation:

- The final 24 serial/refusal/dialect tests failed on unchanged source; source files were restored afterward. They include all 18 reported product × EVM rail × mint-failure combinations.
- A simultaneous same-payment retry failed on the first candidate by producing two different certificate IDs. After durable coordination it returns one certificate; a concurrent paid refusal can retrieve that same certificate on the next retry, without a second settlement.
- Final focused run: nine files, 206 tests passed, including 25 public-door recovery cases and three real Durable Object coordination tests.
- Typechecking and both Worker dry-run builds passed.
- GitHub will run the full suite. Every payment is a local fixture; no real funds moved.

The follow-up is kept separate from PR #540 and will remain a draft while the remaining recovery states are addressed. Completed substeps are checked off separately from the overall SEV-1 finding.

### Completed durable MCP responses remain retrievable

A finished recovery previously became unreachable after its delivery row closed and the KV replay cache disappeared. An interruption immediately after the durable completion write also hit the existing-certificate refusal. Added a read-only lookup bound to the saved verified payer, chain, transaction, product and full input digest. It retrieves the exact saved response without claiming or minting again, and closes a remaining delivery row only after successful reply preparation. Older records without owner metadata are not inferred.

Four public-door regressions were observed failing before the fix (`/private/tmp/buyer-037-completed-red.log`). Final focused gate passed 212 tests in nine files; typecheck and both dry-run bundles passed. No full local rerun, as requested. The coordinator authorization tests independently reject other owners/products/chains/transactions. BUY-037 remains open for interrupted partial writes and older unbound purchases.

PR #540 has auto-merge enabled and is awaiting GitHub CI. PR #541 is draft. Its main Cloudflare preview build failed; the separate doors build passed. The dashboard requires login and the existing Wrangler OAuth session receives 403 for the Builds logs API. The new Durable Object migration may explain the preview-upload failure, but that cause has not been confirmed from its log. No deployment or build settings were changed to bypass the gate.
