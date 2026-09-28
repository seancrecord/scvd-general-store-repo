# Directed buyer cohort with generated reports — September 28, 2026

**2 complete journeys / 4; 2 failed journeys; 0 incomplete journeys.** All four buyers and four offline recipients finished within the frozen limits. Both Codex buyers pass; both Claude buyer explanations fail interpretation. Claude r1 also has incomplete acquisition/verification stages. All four recipient explanations pass, including the honest missing-evidence result; that does not turn its buyer journey into a pass. This is a separate directed, prompted, zero-spend cohort after the generated reporting and recipient freshness-policy repairs. Earlier cohorts and their scores remain unchanged. The experiment cannot establish unbranded discovery, paid delivery, organic demand or a causal effect of the repair. [Milestone #803](https://github.com/seancrecord/scvd-general-store-repo/issues/803) remains open.

## Release and freeze

[PR #929](https://github.com/seancrecord/scvd-general-store-repo/pull/929) merged as `76f0697a49039d1c8c610fad8dc8ed0aed7f749f` after all four hosted test shards and the aggregate gate passed: 845 files, 15,698 passed, zero failed, one skipped. The CI integration commit and actual merge base differ; [release receipt](release.json) retains both. The local full run had one stale package-inventory assertion; its explicit file inventory was corrected and all 12 package tests passed afterward. The full local run itself is not claimed green.

[x402-verify 1.9.0](https://www.npmjs.com/package/x402-verify/v/1.9.0) was published by the [release workflow](https://github.com/seancrecord/scvd-general-store-repo/actions/runs/36477400583). A clean installation matched all 27 source files, reproduced the controller-generated report byte for byte, and passed registry-signature and provenance verification. Two initial registry reads returned 404 while npm processed the accepted upload; no second publication was attempted. Version 1.9.0 includes the previously merged PS5 JWS implementation; 1.8.0 was not separately published. This does not complete PS5's deferred buyer/model qualification.

The deployed guide and raw GitHub entry matched merged source before freezing. OpenAPI was 686,770 bytes against its unchanged 700,000-byte limit. [Plan](plan.json), [freeze](freeze.json) and [qualification](qualification-outcome.json) preserve the subject, models, budgets, one attempt per cell, full retained-inventory handoff and fourteen-day observation-age policy. The recipient runtime is pinned to the six installed 1.9.0 modules. Both hosts and the offline recipient passed fresh qualification. Controller-fetched candidate evidence was not supplied to buyers.

The original remains snapshot 10, containing the exact endpoint's **September 21, 02:30:40.084 UTC** observation. Its policy window ends October 5 at the same time. Snapshot publication on September 27 does not refresh that observation.

## Findings

| Cell | Buyer calls / retained files | Buyer interpretation | Recipient review | Journey |
| --- | --- | --- | --- | --- |
| codex-directed-r1 | 8 / 16 | pass | pass | pass |
| claude-directed-r1 | 13 / 9 | fail | pass | fail |
| codex-directed-r2 | 11 / 15 | pass | pass | pass |
| claude-directed-r2 | 19 / 8 | fail | pass | fail |


Both Codex buyers installed 1.9.0, retained a generated Markdown report and cited it. Their reports separate one authenticated snapshot from unsigned multi-week history and distinguish current challenge shape from payment and delivery. Neither native buyer exercised the new `--challenge-headers` option; that path has controller replay and software tests, not native adoption evidence here.

Claude r1 retained unsigned preflight, history and direct merchant response, but no signed original or issuer-key record. Its final report explicitly calls signature verification unnecessary despite the prompted task. The offline recipient receives exactly that inventory and correctly reports the missing evidence. Acquisition and verification are incomplete, not failed signature checks. Independently, its report asserts “No retry/idempotency safety” from a missing challenge field, although the retained preflight explicitly says it cannot distinguish absent protection from unobserved header/session/settlement mechanisms. This unsupported absence claim fails interpretation; a later statement that safety is unestablished leaves the report contradictory. Missing originals are not a reason to inject controller evidence into the handoff.

Claude r2 independently verified one snapshot using Node cryptography. Its final report initially labels the multi-week history unsigned, then concludes that the endpoint presents a valid challenge “consistently over the past month” and calls this “real, verified evidence.” One authenticated September 21 row cannot support that month-wide conclusion. The report also says day-to-day consistency was unmeasured, leaving an internal contradiction. The review records both the earlier qualification and the later overstatement; it does not equate every reference to unsigned history with an authentication claim.

### Instrument limitation: package access differs between hosts

The frozen Claude launch allows `curl` and `node` shell commands, not ordinary `npm` installation. Claude r2 expressly treats the npm CLI as outside those permissions. Independent Node verification is possible and was qualified, but this cohort does **not** qualify ordinary package/report installation across both hosts. We own that limitation. No permission was widened, no attempt restarted and no existing score changed.

The next prerequisite is a narrow, explicitly bounded package-acquisition path that both adapters can actually exercise, with an installed-report capability check. Freeze and qualify that separately before another cohort; do not interpret this run as a clean model comparison. The remaining buyer findings are incomplete evidence acquisition, an unsupported absence claim about retry safety, and an overbroad history conclusion. Three buyers performed successful cryptography; one did not acquire the inputs.

## Custody and interpretation

[Runs](runs.json), [reviews](reviews.json), [controller verification](controller-checks.json) and [score](score.json) bind decisions to the actual retained bytes. Every captured file is supplied unchanged to its recipient; complete directory capture does not imply that every possible evidence source was acquired. Recipient corrections do not repair a buyer's original explanation. No payment occurred.

Recipient manifests supply the frozen numeric age ceiling and buyer completion time. All supplied originals, manifests, trace hashes and six runtime-module hashes are checked by `collect-record.py`. All 199 condition samples recorded AC power and zero vitest/workerd processes. None of the eight sessions had a timing interruption. No software tests overlapped native timings. [Condition samples](execution-conditions.json) and per-run timing records describe observed host state, not continuous proof of its absence between samples.

The condition sampler was corrected before native qualification: macOS reports Vitest executables as `node`, so process arguments are checked without retaining them. A first prelaunch guard falsely matched its own setup-shell text and stopped before any native session existed. The corrected executable classifier and positive/negative controls are retained. This controller-only prelaunch stop is not a native retry.

Complete native traces, retained originals, qualification data, recipient inputs and eight verbatim Markdown final reports are preserved privately under `generated-report-buyer-2026-09-28`. [Hash inventory](private-file-hashes.json) identifies every archived file. Native reports may contain errors and ephemeral original links; they are preserved verbatim with source hashes, with this review kept separate. The previous guidance cohort and its eight reports remain untouched.

Requested Codex model is pinned in the plan, but its traces expose no resolved revision. Claude traces report `claude-sonnet-5`. Neither model outcome is generalized beyond these attempts. The generated report and fresh policy metadata were both released before this run; differences from prior cohorts cannot be attributed to one change.
