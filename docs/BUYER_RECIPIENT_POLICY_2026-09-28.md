# Recipient freshness policy — September 28

The [separate buyer cohort](../research/guidance-buyer-2026-09-28/REPORT.md) exposed an instrument omission: the recipient was told to apply the task's observation-age policy but received only a plan hash. One recipient explicitly reported the missing threshold; others introduced a seven-day comparison. The frozen experiment actually allowed fourteen days.

New schema-6 handoffs carry `observation_policy` in the input manifest, with `max_age_ms` derived from the frozen plan, `evaluated_at` from the buyer's recorded completion time, and `basis: buyer_completed_at`. These values ride beside the existing plan-content and buyer-run hashes. Preparation refuses a buyer policy different from its frozen plan or a missing/invalid completion time before writing recipient inputs. The evaluation time matches the scorer's existing reference time; preparing a handoff later does not silently age the observation under a different clock.

The frozen recipient prompt names these fields, separates experiment freshness from a signed issuer expiry, and requires an unknown result if no numeric policy is supplied. Historical standalone handoffs without a frozen schema-6 plan do not acquire an invented threshold. No change to budgets, verifier bytes, scoring rules or payment permissions.

Four regression checks failed on the original implementation: missing policy output, missing completion time, invalid completion time and a changed age ceiling. After repair, the complete buyer-control suite and Worker bundles pass; [validation](../research/guidance-buyer-2026-09-28/validation.json) retains the final gates and limits. Existing CLI handoff fixtures now contain the completion metadata already produced by real buyer runs; their original tamper checks remain intact.

This repair happened **after** the September 28 native experiment. All originals, prompts, hashes and scores for that experiment remain unchanged. Its complete archived score reproduces with its retained instrument plus the locked dependencies. Any new native handoff requires a new freeze and fresh qualification; current code cannot claim buyer acceptance from the old cohort.

Payment-address/digest transcription and multi-week scope overstatement remain separate reporting findings. This change supplies missing policy data; it does not establish that models will report every identifier or authenticated observation correctly.
