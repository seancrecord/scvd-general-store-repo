# Six-session PS4 comparison — September 17

The shortened skill preserves task access in this small synthetic comparison,
but **does not yet pass behavioral acceptance**. Its MPP answer overstated
challenge presence as challenge validity. The revision is held from release.
No additional trial or silent replacement was run.

| Condition | Metadata decisions | Task cases passing the frozen rubric | Task session duration |
| --- | --- | --- | --- |
| Old skill | 10/10 | 5/7 | 100.937 s |
| New skill | 10/10 | 6/7 | 44.972 s |
| No skill | 10/10 correctly selected none | 4/7 | 48.951 s |

Both offered descriptions selected all seven relevant prompts and rejected
all three unrelated prompts. The no-skill condition had nothing to activate;
its selections are a control, not evidence of discovery. Metadata decisions
were requested explicitly, not observed through a host's native auto-trigger.

The task rubric required tool execution and correct bounded interpretation.
The old and no-skill answers omitted signing-key/resource authority from
verification limitations and omitted the preflight observation date. Those
fail the corresponding predeclared interpretation criteria. The no-skill
reader also failed to retrieve history and returned a blocker. The new reader
retrieved all required observations, but called an MPP challenge **valid** when
the only MPP check was `mpp-challenge-present`. This is the remaining release
blocker; the raw answer and the narrower tool output are preserved together.

The old skill also made an unnecessary `http_get` call to the MPP subject.
The fixture adapter returned an unavailable-operation error, then the reader
recovered with preflight. The shell exited zero for that returned error:
zero failed commands must not be mistaken for zero tool errors.
All three readers declined payment authorization and did not require a wallet
or package installation for the one-off checks. No secrets, real payments,
external requests, implementation reads or workspace-boundary violations were
observed. The new reader compressed verification exclusions rather than
copying them verbatim; its semantic denial passes this rubric, while exact
adherence to the skill's quotation instruction remains unestablished.

## Context and execution evidence

The new task reader loaded the entry plus five relevant references:
verification, inspection, payment diagnosis, history and MPP. It did not read
the purchase catalogue, package map, buyer/seller testing or transport guide.
The old reader read and searched selected ranges of its monolithic entry,
including unrelated shelf material. The new inspection reference still carries
paid options not needed for a free probe; shorter entry size alone does not
prove minimum context use.

| Observable per task session | Old | New | No skill |
| --- | --- | --- | --- |
| Captured command output bytes | 32,037 | 24,386 | 1,591 |
| Host-reported input tokens | 177,409 | 80,122 | 121,052 |
| Of those, reported cached input tokens | 140,288 | 57,344 | 108,800 |
| Host-reported output tokens | 2,491 | 1,832 | 1,451 |

Token counters include host instructions, tool turns and repeated context.
Command output includes tool results and can be truncated. Neither is a clean
measure of document tokens, cost savings or necessary context. Durations
include model/tool latency, with conditions running concurrently. These are
observations from one session per condition, not a statistical comparison or
speed promise. Each task session contains seven cases sharing context.

[Scores](readers/scores.json), [manual review](readers/trace-review.json),
[execution reconciliation](readers/execution-review.json) and raw session
folders retain every attempt. All fixture calls reconcile with host-command
stdout; source inputs and the frozen criteria/scorer hashes remain unchanged.

## Follow-up and release boundary

Before release, clarify the difference between the presence of a challenge
and whichever individual validity checks were actually performed, then run a
separately recorded corrective reader check on the revised bytes. Preserve
this cohort. The PR is a draft checkpoint, not a publication approval.

The first launch stopped during initialization because `acceptance.json` had
been part of the previously rejected shell operation and therefore was never
written. No reader had launched. The file was restored before these six
sessions and hashed in their protocol. The startup error is retained in
`launch-initialization-failure.txt`. Explicit payload/destination approval
and commit/PR authorization are recorded in `authorization.json`.

## Upstream integration boundary

After the cohort, a fetch found main at
`57af0fc73c4e6f6cfd758ed5db5b5833ff98aba3`, ahead of the evaluated base
`7059dc8ab6207195776c85e4fd67a621240403d2`. Main includes newer context-anchor
privacy, purchase-key/recovery guidance, replay evidence, archived Almanac
status, pinned tab installation and quote/settlement evidence descriptions.
Those updates must be carried into the references before merge; this draft
checkpoint does not supersede them. Its original trial inputs remain frozen.
Local tests against the checkpoint do not establish compatibility with current
main. The integration inventory is in `upstream-integration.json`.
