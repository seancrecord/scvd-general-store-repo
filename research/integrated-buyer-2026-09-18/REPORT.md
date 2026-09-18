# Integrated referred-buyer result — September 18 UTC

**One of four complete journeys; one failed interpretation and two incomplete
journeys.** Both native hosts passed their new generic capability probe. Two
buyers verified and retained signed originals; only one fresh offline
recipient completed verification and interpretation. This is controlled,
unpaid usability evidence, not takeoff readiness.

## What was frozen

[freeze.json](freeze.json) fixes source commit
`82a419ffc236aff401444243b175699e3271e537`, seven instrument hashes, the
public guide, registry publication check and [four-cell plan](plan.json).
This integrates the already-merged scratch workspace (#783), corpus guide
link (#786) and invocation-scoped refusal guidance (#788). It does not
attribute the result to one repair. Buyer models, permissions, budgets and the
14-day historical observation window are unchanged. Each host got one probe;
each planned buyer ran once. No missing acquisition was repaired afterward.

The [publication check](publication.json) reconfirms x402-verify 1.5.0 from a
fresh registry install: all 24 shipped files match, registry signatures and
provenance verify, and the retained-original control succeeds. It is the
already published release, not another publication.

Two separately fixed [Claude completion diagnostics](completion-diagnostics.json)
completed before this freeze: a plain response and two local commands plus a
retained report. They show that the current host can complete those tasks.
**The preceding #787 timeout remains unexplained.** Its capped probe and four
unlaunched cells remain in [their original record](../verify-source-qualification-2026-09-17/REPORT.md).

## Concurrent acquisition, kept separate

During merge preparation, [PR #789](https://github.com/seancrecord/scvd-general-store-repo/pull/789)
added a [separate four-cell cohort](../takeoff-directed-release-2026-09-17/REPORT.md)
frozen about one minute earlier on the same source and plan. Its directory uses
the local September 17 date; both cohorts ran September 18 UTC. The eight buyer
trace hashes are distinct ([comparison](concurrent-cohort.json)); identically
named cells belong to different record directories. That cohort reports one
complete journey, two interpretation failures and one incomplete handoff.
These are overlapping acquisitions, not a controlled comparison. Keep both
frozen denominators and their original outcomes. Shared host activity and sleep
limit timing interpretation; do not infer causes from differences or pool the
cohorts retrospectively to declare readiness. Its existing [delivery-guidance repair #792](https://github.com/seancrecord/scvd-general-store-repo/pull/792)
remains separate from the address-digest clarification found here.

## Recipient review limits

The [recipient protocol](recipient-protocol.json), recorded from unchanged
launch records, used fresh offline Codex gpt-5.6-luna sessions: 180 seconds,
12 tool calls, 4,194,304 output bytes and an advisory 1,800-token target.
Both eligible pairs received exactly one attempt. The original acquisition
freeze names the recipient step but does not numerically freeze its budgets;
the four-buyer plan's unchanged budgets are the buyer budgets. These recipient
limits differ from #789's 240 seconds, 20 calls, 4,000,000 bytes and advisory
2,500 tokens. No cap was changed during a run or afterward. Do not describe
all acceptance-protocol budgets as identical, or compare the cohorts' complete
journey rates as a controlled test. The 1/4 result below uses this record's
actual recipient protocol, including its incomplete capped attempt.

## Outcomes

The [reviewed score](score.json) is computed by the unchanged scorer from
[hash-bound reviews](reviews.json). The [acquisition-end score](score-at-acquisition-end.json)
is preserved separately; it predates review and is not overwritten.
[Acquisition details](acquisition.json) derive counts and timings from captures.

| Cell | Buyer outcome | Retained capture | Fresh recipient | Full journey |
|---|---|---|---|---|
| Codex directed 1 | Signed original verified using installed `verify-source`; completed in 11 calls | Complete: 29 files, 23,037,195 bytes | Stopped at 12-call cap; 13th call observed, no completed verification output or final report | Incomplete |
| Claude directed 1 | Completed in 10 calls; falsely alleged a contradiction between different digest roles; no signed snapshot/key obtained | Complete: 5 unsigned files, 15,481 bytes | Ineligible | Fail |
| Codex directed 2 | Signed original verified with independent Node cryptography; completed in 12 calls | Complete: 14 files, 11,531,987 bytes | Completed in 8 calls; signature and scope verified with caveats below | Pass |
| Claude directed 2 | Interrupted by host sleep; wall-time stop, 8 calls, no final report | Complete: 5 unsigned files, 23,034 bytes | Ineligible | Incomplete |

Complete capture means that the files the buyer saved were retained. It does
not mean those files include the required signed evidence. Output-token targets
are advisory; tool, byte and time limits are distinct. Both Codex buyers kept
the exact frozen guide bytes. Claude read WebFetch output rather than retaining
the raw guide; its first response was a lossy summary.

## What worked, and what did not

Both new [capability probes](qualification.json) passed retention and the local
signature test with no denied command. This qualifies those host invocations,
not every subsequent buyer behavior.

Codex 1 installed a verifier in scratch space, discovered `verify-source` in
its help and recovered from the default size refusal by explicitly choosing
the existing 32 MiB ceiling. The resulting compact verification was valid and
complete. Dependencies stayed outside decision evidence. Its captured files
still include a redundant large corpus response. The buyer trace does not
independently pin the installed version; the registry control separately pins
1.5.0. The fresh recipient began a verification command but was stopped before
its result. Parent verification is not substituted for that missing result.

Codex 2 independently recomputed the digest and checked Ed25519 over the signed
snapshot. Its fresh recipient used both the supplied public verifier modules
and independent Node cryptography. It correctly identified the exact endpoint,
the September 7 observation inside the September 8 snapshot, no declared
expiry, and the distinction between a payment timeout and evidence expiry.
It excluded current behavior, merchant identity, settlement and paid delivery.
Its core scope review passes with two retained caveats: its approximately nine-day age estimate fits the snapshot date, while the
underlying endpoint observation was about eleven days old; it also called the
OTS proof structurally bound. Only metadata
binding was checked; no OTS operation or Bitcoin anchor verification is claimed.
The scorer computes age from exact dates against the frozen 14-day policy.
The recipient received the original, key, final buyer report and two review
modules, not the buyer's whole live-response capture. Its inability to confirm
acquisition provenance from that subset is correctly retained.

Claude 1 compared address hashes with snapshot hashes and reported an internal
contradiction. [Independent recomputation](digest-review.json) shows that the
address hash matches `pay_to.digests`; `observed.digest` and
`unchanged_since.digest` correctly identify their timeline snapshots. There is
also a concrete wording problem: the existing help begins “Each digest” without
explicitly limiting the address formula to address-digest fields. The model's
claim is false, and the guidance should be clearer. The trace fetched unsigned
host history and a direct merchant challenge, not the SCVD preflight API despite
the final report calling it a free preflight. It did not follow the snapshot
link it had printed, so no signed evidence or recipient qualified.

Claude 2 obtained a free SCVD preflight and direct merchant challenge, but
never obtained the signed original or wrote a final report. Local
[sleep/wake evidence](sleep-interruption.json) directly overlaps the attempt.
The four-minute timer terminated it after waking, at 478,435 ms elapsed.
One API retry also appears with an unknown error. Sleep is an observed host
interruption; it does not explain every delay or diagnose the earlier timeout.
The cell remains in the denominator and was not retried. A temporary idle-sleep
assertion was used for subsequent offline review, without changing saved power
settings. Both Claude cells recovered from an initially denied compound command;
the second explicitly corrected its early overgeneralization of that denial.

## Next bounded work

1. Clarify the existing `pay_to.how_to_match` guidance: name address-digest
   fields (`digests`, `changes[].from`, `changes[].to`) and distinguish
   `observed.digest`, `unchanged_since.digest` and `changes[].digest` as
   snapshot references. Keep values,
   schema and historical signed bytes unchanged. Demonstrate a focused
   regression before the source fix, then follow normal checks and PR/CI merge.
2. Before another timed acceptance experiment, resolve the interruption-aware
   timing and explicit recipient-scope gaps also recorded in #789. Then freeze
   its purpose and host conditions, including a temporary awake assertion and
   actual sleep events so suspension cannot be mistaken for product latency. Do not silently extend current caps
   or rerun these cells until they pass.
3. Revisit the incomplete recipient's acquisition/navigation costs using its
   retained trace before changing handoff guidance or its budget. The completed
   recipient is evidence that this artifact is interpretable, not that every
   cold handoff is reliable.
4. Keep discovery/admission and paid acceptance separate. The roadmap still
   requires two complete journeys per host/lane; this cohort does not meet it.
   No paid trial or external submission is authorized by these results.

## Reproduction and handoff

[validation.json](validation.json) records local checks. The full local attempt
reported 758 passing files, one failing file and two runner-start timeouts out
of 761 expected files. It reported 14,691 passing tests, one skipped and a
homepage timeout overlapping verified lid/maintenance sleep. The unchanged
homepage file passed all nine tests on rerun. The shared cache retains old
entries and cannot identify the two unreported files reliably; this local run
remains partial, not green. The 62 focused controls, typecheck and document
checks passed. No test timeout or product source changed. CI must pass all four
suite shards and the aggregate gate before merge; the durable merge receipt
records that decision. [private-manifest.json](private-manifest.json) binds raw
native events, commands, launches, debug output, exact responses, recipient
inputs and local verification logs. Those files stay private; public records
publish reviewed facts and relative references rather than account/host data.
Hash identity does not establish the truth of a model's statement.

Durable pickup: `~/scvd-takeoff-handoff-2026-09-17/integrated-buyer-2026-09-18/`.
Use `PICKUP.md` and `MERGE.json` there. Preserve the older cohorts, this freeze,
the unreviewed score and all four attempts. Recompute by importing `scoreCohort`
and writing a new output file; the CLI `--score` would overwrite the original.
