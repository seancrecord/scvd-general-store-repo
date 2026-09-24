# Nested-row buyer qualification — September 23

**Four attempts: zero complete journeys, two interpretation failures, two
incomplete. TR3 remains open.** This is a new directed, zero-spend cohort after
PR #899's nested-row guidance, frozen on the released #900 source. All three
generic capability checks passed; the four buyers ran once, serially, followed
by one offline recipient for each of the three eligible completed buyers.
All three recipients completed. No timing guard interruption occurred. Prior
cohorts and scores remain unchanged; this is not a controlled wording comparison.

| Cell | Buyer calls / seconds | Capture | Result and reason |
| --- | --- | --- | --- |
| Codex r1 | 11 / 131.826 | 32 files, incomplete | **Incomplete.** Correct single-row interpretation and successful offline handoff, but the 32-file ceiling omitted two files. |
| Claude r1 | 18 / 103.471 | 4 files, complete | **Fail.** Found and verified the September 14 row, then described four weekly observations as independently signature-verified after fetching only snapshot 8. Its recipient identified the unsupported claim. |
| Codex r2 | 8 / 122.676 | 30 files, complete | **Fail.** Retained and verified four originals, but called the publication dates of snapshots 4/5 signed observation dates. Those rows have no `observed_at`. Its recipient identified the distinction. |
| Claude r2 | 21 / 47.693 | 11 files, complete | **Incomplete.** Hit the 20-call ceiling before acquiring a signed snapshot or giving a final report. No recipient was eligible. |

The [score](score.json), [hash-bound reviews](reviews.json), [run summaries](runs.json)
and [independent controller checks](controller-checks.json) retain each attempt.
A correct recipient cannot repair an incorrect buyer conclusion. A valid
signature cannot supply a missing observation date. Codex r2's latest September
14 row does satisfy freshness; its failure is the unsupported dates asserted for
the older rows, not an invalid signature or stale latest observation. This
follows the frozen guide's distinction between `value.observed_at` and
`snapshot_taken_at`, not a new post-run criterion.

## What the handoffs establish

The first recipient independently verified snapshot 8 and correctly separated
its one signed observation from unsigned current/history readings. It named the
capture failure. A filename-only controller diagnostic found 34 created files
and 32 retained: `did.source.txt` and `key-observation-result.json` were omitted.
The collector records its first limit marker and stops; that single marker does
not mean only one file was omitted. No omitted bytes were restored or supplied.

The second recipient independently verified the same snapshot and rejected the
four-week authentication claim. Its report also said the current preflight's
top-level timestamp fields were absent; the retained `mpp_core` block does carry
its own unsigned observation timestamp. That narrower timestamp caveat does not
change the signed-scope finding.

The third recipient verified the exact September 14 row and explained that
snapshots 4/5 have publication dates but no signed row observation timestamps.
Its loop visibly printed successful verification results for 5/7/8, while its
final claimed all four verified; no result for 4 is visible in that loop output.
The controller separately verifies all four originals, but that cannot become a
native recipient result. The selected snapshot 8 has its own successful native
bundle verification. This additional reporting gap is retained, not silently
repaired by the controller.

All reviewed handoffs distinguish published-key consistency from independently
established issuer identity, and signed history from current behavior, payment,
settlement, delivery and verified Bitcoin anchoring. None of those latter
properties was established by this zero-spend cohort.

## Frozen conditions and execution limits

The [plan](plan.json) preserves the September 20 exact endpoint, models, four
directed cells, budgets, retention bounds and fourteen-day observation-age
ceiling. The [freeze](freeze.json) records clean source
`00aad2937844f0218869d99085385fef371c696d`, source/public guide agreement and
controller-only availability checks. The source remained clean through the end.
The controller did not supply its fetched evidence to buyers.

The signed September 14 observation's age ceiling ends September 28 at
01:30:09.376 UTC. Publication on September 20 does not refresh it. Buyer hosts
were requested as Codex `gpt-5.6-luna` and Claude `sonnet`; Claude traces resolve
to `claude-sonnet-5`, while Codex traces do not report a resolved model identifier.
The offline recipient uses the frozen Codex adapter and pinned verifier 1.7.0.
Buyer verifier acquisition varied: Codex r1 explicitly used 1.6.0, Claude r1
performed local cryptography, and Codex r2 installed an unversioned package whose
resolved version was not retained. Do not claim identical buyer verifier builds.

[Fresh qualification](qualification.json) and [qualification runs](qualification-runs.json)
precede every buyer. A missing controller dependency stopped an initial startup
before any qualification directory or model launch; locked dependencies were
installed before the first actual attempt. [Setup record](setup-record.json)
preserves that distinction. No agent attempt was retried.

[Execution observations](execution.json) contain 112 samples, all on AC power,
with no timing guard interruption in qualification, buyers or recipients. The
controller used a temporary sleep inhibitor and stopped it and the sampler after
the last recipient. It launched no heavy local tests during native sessions.
Unrelated `vitest`/`workerd` processes appeared in 33 samples, beginning at
20:26:46 UTC during handoffs; the buyers had already ended. They were left alone.
The intended quiet window was therefore not fully achieved. Process presence is
not CPU utilization, and ten-second sampling cannot prove idleness between
samples. No load cause, speed comparison or causal wording improvement is claimed.

Raw originals, host context, traces and all recipient inputs remain private;
[relative identifiers and hashes](private-retention.json) allow later checks by
an authorized holder. Public hashes do not make private traces independently
replayable. The initial [unreviewed acquisition score](acquisition-score.json)
is preserved separately from the reviewed result. Tool-call budgets stop after
an over-budget event is observed; token targets are advisory.

## Next work, in order

1. Keep TR3 ahead of merchant/platform qualification. The shipped nested-row
   guidance is readable; dependable completion has not been established.
2. Make the existing verification explanation unmistakable about missing row
   dates and per-snapshot scope. One authenticated week cannot authenticate an
   unsigned timeline; publication is not observation. Any repair needs its own
   regression and release readback before a new cohort.
3. Keep originals and key bytes while reducing optional companion-file sprawl
   within the same 32-file ceiling. Inspect the existing acquisition example and
   native call overhead before changing the instrument; do not widen budgets or
   rescue these closed attempts.
4. A future fresh cohort needs a new freeze/qualification and a controlled awake
   window. This run does not authorize retries, paid checks, or broader lanes.

No queue reordering is warranted beyond continuing the existing buyer-first
priority. VQ4 remains input-blocked; it cannot be closed with this newer evidence.

## Record validation

[Validation](validation.json) records a clean frozen source checkout, passing
typecheck and document checks (existing age reminders only), a passing release
evidence replay, and 115 private file hash/size checks. The [offline checker](verify.mjs)
also reconciles reviews, runtime hashes, recipients and the four-cell denominator.
Run `node research/nested-row-buyer-2026-09-23/verify.mjs` for public-record
consistency; an optional private-root argument additionally verifies retained
bytes. It performs no fetch, write, agent launch or score change. These checks
do not substitute for reading the private native traces. No production behavior
changed, no new commit or PR was created, and prior cohorts remain untouched.
