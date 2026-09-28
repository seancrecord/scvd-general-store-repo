# Directed buyer cohort after released guidance — September 28, 2026

**1 complete journey / 4; 3 reporting failures; no incomplete journeys.** All four buyers and four offline recipients completed within their frozen limits. All four buyers retained valid signed originals and performed successful local cryptography. Three buyer explanations contain material errors: two mistyped payment addresses and one claim of four authenticated weeks after verifying one snapshot. Three recipient explanations pass review; one has a mistyped digest and unsupported freshness threshold. No payment occurred.

This is a new directed, prompted, zero-spend cohort after #904 and the #913 release readback. Prior cohorts and scores remain unchanged. It does not establish unbranded discovery, paid delivery, organic demand or a causal effect of the wording change. The [milestone](https://github.com/seancrecord/scvd-general-store-repo/issues/803) remains open.

## Freeze and qualification

[Plan](plan.json) and [freeze](freeze.json) preserve the preceding subject, models, budgets, single attempts, recipient scope, pinned verifier and fourteen-day observation-age limit. Source is `57fea3eb010c91cf7c1c2ded24ffe16f37fdaf35`. The older September 14 observation expired before this run. The controller verified a new candidate dated **September 21 at 02:30:40.084 UTC**, published in snapshot 10 on September 27. Its observation-age window ends October 5 at 02:30:40.084 UTC; publication does not refresh it. Controller evidence was not supplied to buyers.

Fresh readback matched the released guide and all five host-history views. OpenAPI was 684,059 bytes, below its unchanged 700,000-byte budget. The new original is 9,333,858 bytes; this is a changed evidence payload, another reason not to attribute differences to guidance alone.

[All three qualification checks passed](qualification-outcome.json): Codex, Claude and the offline recipient retained the expected bytes and produced correct signature results. Claude encountered a denied shell write and a disabled Write tool, then falsely included the unwritten script in its final artifact list. Its required evidence files were present and correct. The recipient encountered local shell errors and repeated its verification within the same bounded session. These caveats remain visible; no native session was restarted or permissions widened.

## Reviewed outcomes

| Cell | Buyer calls / files | Buyer explanation | Recipient review | Journey |
| --- | --- | --- | --- | --- |
| codex-directed-r1 | 18 / 19 | fail | fail | fail |
| claude-directed-r1 | 14 / 12 | fail | pass | fail |
| codex-directed-r2 | 13 / 23 | pass | pass | pass |
| claude-directed-r2 | 14 / 8 | fail | pass | fail |

[Runs](runs.json), [reviews](reviews.json), and [score](score.json) bind the outcome to the captured evidence. “Fail” concerns reporting/interpretation; all mathematical signature checks passed. Recipient corrections do not change a buyer outcome.

### Payment identifiers changed during reporting

Codex r1's journal retypes the payment address incorrectly. Claude r1's final report drops its final hexadecimal digit while claiming that the live and historical addresses match. The complete original response headers retain the correct address, and decoding them reproduces the signed row's address digest. [Exact comparisons](reported-address-checks.json) retain both values and file hashes.

These are decision-relevant payment fields. Successful cryptography does not make the buyer's report accurate, and a later recipient cannot repair the original buyer explanation. This uses the existing acceptance requirement for correct interpretation, not a new payment test. No wallet or payment was available.

### One verified snapshot still becomes several weeks

Claude r2 verified snapshot 10 over serialized snapshot bytes and located the exact endpoint's September 21 row. Its final report nevertheless calls the four-week history signed evidence. Only one weekly original was retained and verified; the others appear in unsigned history. Its report also says ten weekly rounds, although its own inspected timeline has eight entries. A sequence identifier is not a count.

Claude r1 explicitly attributes its multi-week result to the unsigned lookup before its later summary. Its definite failure is the mistyped address; this review does not automatically reuse the previous cohort's scope judgment.

### The recipient handoff omits the numeric freshness policy

The first recipient correctly executes signature verification but prints a 62-character SHA-256 different from its own output and introduces a seven-day freshness ceiling. The experiment's frozen ceiling is fourteen days.

Our handoff also owns a gap: `scripts/buyer-recipient-handoff.mjs` supplies a plan hash, while the prompt says to apply the task's observation-age policy. Neither the manifest nor prompt supplies its numeric value. The recipient should have reported that policy as unavailable rather than inventing one. This omission is an instrument finding, not evidence that the merchant or its signed record is defective. Original inputs and verdicts remain unchanged. The second recipient correctly reports that no numeric threshold was supplied. The fourth uses a conditional seven-day example; that conditional is mathematically true and is not scored as an assertion of the experiment's policy. Its authenticated-scope interpretation passes. [Recipient digest comparison](recipient-digest-check.json) independently reproduces the first recipient's definite transcription error.

## Custody and limits

All post-run captured buyer files are supplied unchanged to their corresponding recipients. A complete directory inventory is not a claim to retain every HTTP response ever fetched: Codex r2 repeated an unpaid GET into the same filenames, overwriting its first auxiliary capture; the second response and signed original survive. Its journal discloses the repeat. It also put its own installation log under `/tmp` instead of its declared scratch directory.

The Codex buyers used the public verifier version 1.6.0 cited by the guide; recipients used the frozen 1.7.0 machinery. Claude performed local Node cryptography. The requested Codex model is frozen in the plan, but its traces expose no resolved model revision; Claude traces report `claude-sonnet-5`. Host CLI versions are retained in qualification metadata. Every buyer's snapshot signature, exact subject, date and separate key were independently reproduced by the controller. The two Codex buyers wrote shared journals but also retained optional sidecars; Claude did not write journals. Reduced file/call use is not established.

All 212 [condition samples](execution-conditions.json) showed AC power and zero vitest/workerd processes. No native session had a timing interruption. Sampling cannot prove uninterrupted host state; each run's timing monitor records gaps separately. No controller tests overlapped native sessions. Complete native traces, originals, input manifests, diagnostics and controller scripts stay in the keeper's private `guidance-buyer-2026-09-28` archive; [hash inventory](private-file-hashes.json) identifies them without publishing native host configuration.

## Follow-through and remaining work

After this experiment closed, the [handoff policy repair](../../docs/BUYER_RECIPIENT_POLICY_2026-09-28.md) supplies the frozen age ceiling and buyer completion time in new recipient manifests, rejects missing/inconsistent inputs, and tells recipients to report an unavailable policy as unknown. Four controls failed before the fix; the complete buyer-control suite passes afterward. No native session tested the repair yet.

Next, address the reporting layer by deriving payment identifiers, hashes and authenticated-observation scope from retained structured results rather than retyping them. Reuse existing verification and address-digest helpers; do not add a second verifier or broaden money permissions.

Any repair needs its own failing regression, normal release checks, readback where public surfaces change, and a fresh freeze and qualification. Do not retry these cells or rescore old attempts under new instructions. Merchant and platform qualification remain downstream of buyer reliability.

Validation is recorded in [validation.json](validation.json). Native reports are also exported verbatim into eight private Markdown files with a source-trace hash per report; errors are preserved, not silently corrected.
