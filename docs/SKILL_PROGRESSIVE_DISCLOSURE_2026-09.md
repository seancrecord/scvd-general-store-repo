# PS4 — one skill with progressive disclosure

September 17, 2026. Local draft on `codex/skill-progressive-disclosure`,
worktree `/private/tmp/scvd-skill-progressive-disclosure`, based on
`7059dc8ab6207195776c85e4fd67a621240403d2`. Commit and draft PR are authorized as a progress checkpoint; integration,
publication and deployment remain separate. Prepared skill release version: 3.17.0.
The existing published record is unchanged.

## What changed

`skills/scvd-general-store/` is the canonical installable tree. Its entry is
78 lines instead of 926, with shared safety limits, access choices and a task
router. Ten references hold verification, inspection, payment diagnosis,
buyer/seller testing, host history, MPP, purchases, store tasks, transports and
the package map. The public skill identity remains `scvd-general-store`.

`npm run skill:build` generates the ClawHub Markdown tree. `skill:check` rejects
drift, missing or escaping links, unreachable files, symlinks, unexpected payload
files and ignore rules that would drop references. Existing price, freshness,
claim, cadence, safety and recovery guards now traverse the reachable installed
graph. Entry-specific metadata and safety checks still inspect the entry.
A regression guard preserves all previously advertised SCVD HTTPS endpoints.

The publisher checks canonical/distribution parity and content guards before
upload, and records a fingerprint of the complete tree in addition to the
legacy entry hash. Reference-only changes are now visible to its unchanged-
release refusal. ClawHub's local publication bookkeeping is excluded from the
payload. The deployed `/skill.md` remains the separate full, dynamically derived
store guide; this change refactors the installed skill, not its runtime route.

## Copy and measured corrections

The short description retains verification for any issuer, including competing
stores. A broader guard caught its accidental omission in the first draft;
the failure and corrected rerun are retained. The entry keeps the credentials
promise before task instructions, and makes free checks, paid actions and free
contributions distinct authorization decisions.

References correct transaction-hash network inference (EVM hashes do not name
the chain), the old denial of evidence-bundle support, and a browser paragraph
that described a surface with a consequential completion tool as free-only.
Verification guidance preserves unsupported/unobserved states and distinguishes
signature validity, signing-key authority, settlement, delivery and permission
to spend. MPP guidance follows the existing preflight implementation: the
outer verdict remains x402-specific; MPP observations are separate.

PS3's 1.4.0 library remains explicitly described as an unpublished preview.
No registry version is claimed to contain its new API. The new wording remains
draft pending the keeper's publication review.

Release note, September 17: the keeper authorized the release; 1.4.0 is
published and 3.17.0 submitted. Current status is in
[the release record](PACKAGE_SKILL_RELEASE_2026-09-17.md); the paragraph
above describes this document's own date.

## Reuse of buyer-flow evidence

Reviewed the September 12 cold skill trace in
`research/buyer-waves-2026-09-12/cold/skill.json` in the shared checkout and
TR1/TR3's contract. That trace distinguishes fetch-tool timeouts from a real
origin error, and reaches a usable quote only after adding a required host.
The purchase reference now says to obtain the actual subject rather than fill
it with an example. Existing request, retry identity, consent and recovery
instructions are retained. This work does not repeat the paid buyer journey,
claim a discovery success, or replace the separate TR1/TR3 gates.

## Qualification and remaining boundary

Local-source installation through cached `skills@1.5.26`, in copy mode, puts
all eleven files into fresh Codex and Claude-style project directories with
matching tree fingerprints. Cached ClawHub 0.23.3's actual preparation and
archive-extraction functions also preserve the complete tree. Neither check
uploads, authenticates to a marketplace or proves a future remote download.

All 159 content checks across 16 affected files, four packaging checks, the
format validator, typecheck and dry-run Worker bundle check pass. New
packaging checks include before/after failures and a controlled reversion to
entry-only hashing. Existing content tests caught and verified the description
correction. Exact commands/results and installation hashes live in
[the evidence directory](../research/skill-ps4-2026-09-17/).

The prepared behavioral comparison has six fresh CLI sessions: old/new/no-skill
metadata selection, separately from old/new/no-skill task handling. Each task
session covers verification, unsupported interpretation, preflight, payment
diagnosis, history, appropriate free access and MPP. Three unrelated prompts
probe false activation. Tool responses are synthetic and read-only. Multiple
cases share a session; this measures evidence interpretation/access selection,
not live cryptography, native automatic triggering or statistical reliability.
The criteria and inputs are saved before any run.

**Six approved fresh-reader sessions completed.** Metadata selection was 10/10
for each condition (the no-skill control selected none). Task interpretation
passed 5/7 with the old skill, 6/7 with the new skill and 4/7 with no skill under
the frozen rubric. The new reader completed all tool paths but overstated an
MPP challenge's presence as validity. Behavioral acceptance remains open; the
revision is held from release. Original/new/no-skill results and exact failures
are retained in [the comparison](../research/skill-ps4-2026-09-17/RESULTS.md).

The user explicitly approved transfer of the draft skill and synthetic inputs
to OpenAI, then authorized a commit and PR to preserve progress. The earlier
automatic-review rejection remains on record. No further trial, publication or
merge is implied. Full repository testing completed before the checkpoint
commit: 10,270 passed, three failed and one pre-existing skip across 627 files.
All three failures reproduced on the untouched starting commit and an isolated
checkpoint rerun. The suite is not green; no test was waived or weakened.
Baseline-control logs identify the counter-note cadence, expired bounty listing
and expired passport fixture checks. Fetched main already contains controlled-
clock repairs for the two fixtures and newer notes; it was not tested here.

A post-comparison fetch found newer main guidance at
`57af0fc73c4e6f6cfd758ed5db5b5833ff98aba3`. Before merge, preserve its
context-anchor privacy, persistent retry/recovery, replay, archived Almanac,
pinned tab and quote/settlement guidance in the new references, resolve the MPP
interpretation failure and recheck the integrated tree. The evaluated bytes
and results remain a dated checkpoint, not qualification of newer main.
See [the integration inventory](../research/skill-ps4-2026-09-17/upstream-integration.json).
