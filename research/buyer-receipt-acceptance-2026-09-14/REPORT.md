# Receipt repair live acceptance — September 14, 2026

**The receipt repairs passed their targeted live checks. 22 distinct purchases cost 0.199 USDC, with no duplicate settlement, wrong transaction subject, replacement good, or unrecovered purchase observed. Two recovery UX follow-ups remain. This is not a completed full four-wave acceptance run.**

[PR #680](https://github.com/seancrecord/scvd-general-store-repo/pull/680) merged at 2026-09-14T17:35:00Z as `574698394575101667755644de220b0c11015b48`. The required CI run passed 705 files: 13,849 tests passed and 1 existing skip. Its test stage took 4,549.85 seconds; the earlier uninterrupted local run took 1,117.32. All 1,471 frozen source/test/config inputs match the deployed merge tree. A concurrent merge added one documentation file, not a runtime change.

Production reported Worker `fd002b34-2e6b-445d-ab49-2d2ac2d76a2f` after the merge; both Worker builds at the merge commit passed. The public version marker and battery-v4 specimen agreed. The before/after deployment observations, public goods, quotes, exact inputs, retained response codes, signatures, independent receipt reads and money review are in [evidence.json](evidence.json). [summary.json](summary.json) gives request counts and observed recovery timing. [LOG_ADDITIONS.md](LOG_ADDITIONS.md) names the ledger changes.

## What was actually bought and checked

All payments used Base and the declared house wallet. The run covered a simple generated good (`small_blessing`), Settlement Attestation, Settlement Reconciliation and Attestation Bundle. The blessing was a low-cost seed with no external input dependency; it is not claimed to be the globally cheapest SKU. Attestations, reconciliations and bundles were bought through both HTTP and MCP. One additional attestation observed a real Polygon transaction while being **paid on Base**; this is a Polygon reader check, not a Polygon checkout test.

- 19/19 ordinary and distinct-input concurrent purchases returned goods on their first paid submission, with one retained quote and one paid call each. Required inputs and prices were known to the instrument before payment; it read repository context, so these are not cold-buyer discovery scores.
- 9/9 signed observations matched independently fetched receipts: correct chain, transaction, transfer parties, amount and block. Nonce-bound attestations matched the actual AuthorizationUsed/Transfer positions. Reconciliations attributed the fixed authorization value to the selected transfer. Both bundles contained the two requested, distinct seed transactions.
- All 22 purchase certificates, 15 purchased-text envelopes and 9 observation signatures verified; deliberate changes were rejected. Displayed signed fields, price, payer, network, buyer name and purpose matched. Public verification returned the same signed bytes; recovered goods retained their original text and proof.
- The final wallet debit and all outgoing USDC in the measured block window both equal 0.199 USDC. 31 signed authorizations reserved at most 0.244 USDC; only 22 were used. Every authorization was expired by the final chain observation. Unused authorizations were not counted as spending.

This used the house marker and funded house wallet. It does not establish ordinary-buyer rate-limit behavior, neutrality of a store observing its own payment, or final chain consensus beyond the recorded RPC evidence.

## Retries, concurrency and deployment continuity

Ten simultaneous purchases with distinct keys and purposes, split evenly between HTTP and MCP, produced ten correctly bound purchases. Ten simultaneous copies of one payment/key produced one success and nine `settlement_unknown` responses describing the existing purchase and prohibiting a fresh payment. The original goods were later recovered without another charge.

Ten distinct authorizations with identical inputs and one shared HTTP idempotency key likewise produced one success and nine pending responses. Every pending request recovered the same original certificate, text, proof and private status handle when retried with its retained authorization. The chain recorded only the winner's payment. No error was counted as a delivered good until recovery actually succeeded.

The controlled response-loss case withheld the completed response from the simulated buyer. A fresh process, retaining the original signed payment, key and inputs, recovered exactly that purchase. This is controlled response loss, **not** a timed transport interruption or a crash during settlement. Original-interface HTTP and MCP retries also recovered their purchases after authorization expiry.

Three unsigned quotes obtained before the merge were answered successfully by the new deployment. A pre-existing artifact under a retired key, [cert_4dww28dx5j](https://scvd.store/api/verify/cert_4dww28dx5j), retained its exact signed payload hash and valid signature after deployment; the public key history still identified the retired signer. This did not exercise a human order or paid traffic during Worker propagation.

The runner retained 87 purchase-interface calls: 31 unsigned quotes and 56 signed requests, including 16 intentional replays. The signed requests yielded 36 successful deliveries/re-deliveries, 18 pending notices and 2 cross-interface refusals. HTTP 200 alone is not the verdict: one MCP refusal was carried inside HTTP 200. Separate verification and chain reads are not included in this purchase-interface denominator.

## New follow-ups, not hidden failures

**LA-01 / B-RSTATUS — explain pending status-handle recovery.** 16 of 22 successful purchases had a free status read reporting `payment_state: settled` and `delivery_state: not_established_by_this_record`, without the goods. Every one later returned the exact original delivery. For the first HTTP seed, the missing read occurred 15.388 seconds after the successful response; a ready read occurred 59.724 seconds after it. Those are observation bounds, not the exact recovery duration. Source review identifies the background recovery alarm; buyers should not need that implementation knowledge to choose a safe polling action. The response gives no polling interval or explicit temporary-recovery state. Follow-up: make pending recovery and the next safe read clear, or serve the already-retained delivery directly. No lost good or additional charge is claimed.

**LA-02 / B-RDOOR — disclose the interface boundary on replay.** Reusing the HTTP seed's original authorization, key and logical inputs through MCP returned `purchase_input_mismatch` inside HTTP 200. Reusing the MCP seed through HTTP returned the same code with HTTP 503. Both said the payment bought a different request, declared no additional settlement attempt, and supplied the original private handle. Original-interface retries succeeded. Source review confirms an intentional `record.door` boundary, not missing ownership protection. The buyer-facing message does not identify that boundary or tell the buyer which interface to return to; HTTP 503 also suggests a temporary failure. Follow-up: preserve scope protection while exposing the correct recovery action. Changing authorization scope is a separate design decision.

These behaviors were first observed here, not shown to have been introduced by this release. They are new recovery-language/timing follow-ups, not new entries in the original BUY-001–039 count. The separately logged reconciliation Approval-to-transfer attribution and its own RPC-envelope review remain open at their original, unproven-impact scope.

## Fresh, cheaper recipient

A separate ephemeral CLI process requested `gpt-5.6-luna`, with user configuration ignored, project documents disabled, source/credential access forbidden, and only [the new reconciliation artifact](https://scvd.store/api/reconciliation/srec_72cecej9) as its entry. It received the question “Determine whether this claim is authentic and what, precisely, it proves.” No hints or rescue followed. It reported no initial issuer context; the saved trace contains public retrieval and generic computation, with no source reads. This is trace-supported context isolation, not an OS-level claim that all local files were unreadable. The resolved backend model revision was not recorded.

It independently verified the reconciliation and certificate signatures, the certificate binding and chain transfer, and explicitly separated signature validity from delivery, identity, fairness and neutrality. It also checked the separate transaction that paid for the reconciliation. Historical key data was fetched in the registry, but the recipient did not explain historical-key verification: **that requested criterion remains undemonstrated by this cold walk**. The parent's retired-key control does not fill in the agent's score.

Reviewed counts: 13 public HTTP requests, 1 web-tool rejection before origin access, and 2 local script failures followed by successful verification. The agent's final account omitted its second script failure. Four fetches in that failed script did not have response statuses printed; do not promote its blanket “all HTTP 200” statement into measured evidence. [recipient-calls.json](recipient-calls.json) records the executed commands and output hashes; the unedited agent report and reviewer corrections are both in `evidence.json`. No account or purchase was used by the recipient. This is one recipient test, not another six-entry purchase cohort or a commissioned Aura Walk.

## Recheck the saved evidence

From this checkout, run `node research/buyer-receipt-acceptance-2026-09-14/verify.mjs`. It checks the saved signatures, buyer fields, quoted payment fields, exact purchased words and observation bindings without a network or wallet. It also rejects four corruptions: changed signed input, replacement words, changed observation subject and a missing artifact. It does not turn saved RPC JSON into an independent consensus proof; the retained transaction hashes permit fresh chain reads.

Two collector assumptions were corrected without changing production or repurchasing: reconciliation's factual evidence hash excludes its signed prose `reading`, and MCP exposes signed bytes plus flat receipt fields rather than HTTP's nested `certificate`. Neither was promoted to a product defect. Raw payment envelopes and recovery capabilities remain private; the exported file is checked against the exact retained secrets before publication.

## Remaining coverage

Other payment rails, mixed-SKU concurrent purchases, deliberately varied concurrent response delays, true interrupted settlement, adversarial live RPC injection, lost-state recovery from only an order/transaction/wallet-time hint, human queues, watches, anchors, inventory/capacity, all-region deployment propagation and the full shelf remain outside this run. The preflight wallet had no funds on the other EVM checkout rails and no configured Solana signer. The repaired receipt readers have local negative controls and live positive receipt evidence; this run does not claim that every buyer failure code, fulfillment architecture or discovery surface passed.

## Evidence publication checks

The saved-artifact verifier passes all 31 payment records / 22 distinct certificates and rejects its four corruption controls. Fresh typecheck, both Worker dry-run bundles, documentation checks and whitespace checks passed for the report publication. The complete CI/local application suites above cover the unchanged 1,471 runtime/test/config inputs; they were not rerun solely for these research notes. The public ending version remained the release version at 2026-09-14T18:01:14.632Z, and the retrieved deployment history showed no later deployment during the run.
