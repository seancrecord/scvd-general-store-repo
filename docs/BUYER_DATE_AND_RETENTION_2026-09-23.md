# Buyer date, scope and retention guidance — September 23

The [fresh cohort](../research/nested-row-buyer-2026-09-23/README.md) exposed two
interpretation failures and two incomplete runs. This follow-through repairs the
existing explanations and retention guidance. It does not change signatures,
verifier output, signed history, capture limits, the scorer or any prior score.

## Changes

The focused installable skill now says explicitly that a missing signed row
`observed_at` means an unknown observation date. Publication, acquisition and
unsigned timeline dates cannot fill it. Such a row can remain valid historical
evidence while failing to establish observation-age freshness. Another dated row
must qualify on its own exact endpoint and date.

Both the skill and the existing host-history scope explanation require each
claimed authenticated week to have its own retained, successfully verified
original. The skill also distinguishes an attempted verification loop from
successful results actually returned. This addresses the recipient's unsupported
all-four result claim as well as the buyer's one-signature/four-week overclaim.
The history explanation is shared by normal/stable JSON, HTML and both Markdown
paths. The verifier README carries the same date and scope distinction.

Acquisition notes and exact verifier results now belong in one shared
`./evidence/journal.md`, with each entry naming its original file. Source URLs,
acquisition times, request outcomes and key-source observations no longer imply
separate sidecar files. Required originals and bound evidence remain separate,
complete and unchanged. Optional headers can share the journal; original headers
that are required evidence must still be retained. A capture limit remains a
reported gap, never a reason to delete prior evidence or enlarge the budget.
The standalone original/key capture commands are unchanged, preserving their
compatibility with the qualified hosts. Installed tooling stays outside evidence.

## Validation

The guide checks failed on the previous text for both the absent-date explanation
and the shared journal. The served-history regression also failed on the previous
source; the repair was restored afterward. The retained test record distinguishes
those assertion failures from initial sandbox refusals to bind fixture servers.

The guide command is exercised against a genuinely signed legacy-row fixture with
no observation timestamp, a dated publication and adjacent unsigned context. The
signature verifies, but the returned row still has no `observed_at`; no unsigned
context date is imported. Existing cases retain exact-query selection, separate
publication time, tamper rejection, wrong-key rejection and refusal to treat an
unsigned history as a signed original. The capture example preserves a large
original and separately fetched key byte for byte without creating per-response
sidecars. These tests validate instructions and underlying behavior, not model
compliance or an actual reduction in native tool calls.

The focused Node suites pass 59 tests. The served history, skills index and
preflight handoff suites pass 36 tests, including equality of the shared scope
across all history views and the served skill's identity with its source.
Typecheck and the Worker/SDK dry-run build are required for this local batch;
[validation record](../research/buyer-guidance-repair-2026-09-23/validation.json)
records their final outcomes. No package publication or deployment occurred.

## Remaining acceptance

Release this guidance through the normal PR gate and read back the served skill
and all host-history representations. Then freeze and qualify a separate native
cohort before claiming buyer improvement. Existing qualification cannot establish
acceptance of changed guide bytes. Prior attempts stay closed, with unchanged
budgets, zero spend and the same observation-age ceiling. The underlying
September 14 observation cannot satisfy that ceiling after September 28 at
01:30:09.376 UTC; a later freeze must check the evidence it actually receives.

TR3 stays open and ahead of merchant/platform qualification. The failed buyer's
many small calls and host permission refusals remain an observed execution cost;
this guidance repair does not claim to eliminate them. No queue reorder or keeper
press is needed for this local implementation. The September 23 implementation pass created no new experiment, commit or PR;
September 24 PR preparation is recorded below.

## PR preparation — September 24

The keeper requested checks and a PR, explicitly excluding buyer qualification.
The branch is refreshed onto main's distribution and qualification-reporting
repairs before validation. Existing frozen cohort results are preserved against
their original source, not rerun under the newer instrument. Release readback
remains a post-release gate; native buyer qualification is deferred.

[PR validation](../research/buyer-guidance-repair-2026-09-23/pr-validation-2026-09-24.json)
records the complete passing local suite on refreshed main, offline regressions,
typecheck, dry-run builds, documentation/skill checks and evidence replays.
GitHub CI still qualifies the pushed PR head before merge.

## Released guidance — September 24 follow-through

PR #904 merged at 14:30:09 UTC. The later [public readback](../research/buyer-guidance-readback-2026-09-24/REPORT.md)
returned HTTP 200 and exact merged guidance on the installable skill and all five
host-history representations. Exact responses, source reference and hashes are
retained. The release-readback gate is complete.

No new qualification, buyer or recipient ran in this follow-through. The separate
September 24 cohort froze before #904; its two complete journeys out of four
remain evidence for that earlier source. Updated-guidance comprehension and
reduced native file/call use remain unmeasured.
