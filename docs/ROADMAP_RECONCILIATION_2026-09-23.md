# Roadmap reconciliation — September 23, 2026

The keeper asked to update stale roadmap entries, comment on ordering, and
put historical evidence first, then address recurring OpenAPI headroom.
The initial pass updated planning and recorded one public size measurement.
The keeper then requested implementation in a local batch, with no PR yet.
The completed local steps and remaining release gates are recorded below.
No purchases, publication or deployment occurred.

## Source correction

The initial chat inventory read the shared checkout at `7059dc8a`, an older
feature branch. It omitted subsequent roadmap work and overstated what
remained unbuilt. This reconciliation uses fetched `origin/main` at
`9d04efe5` in an isolated checkout, preserving the unrelated work in the
original directory. The earlier chat's sixteen-row inventory is not the
current backlog.

The current historical reading is September 15: 418 certificates verified,
41 immutable reports verified, all 277 signed catalog commitments matched,
and 28 report bindings unresolved beyond the recovered evidence. It is a
different cohort from September 9; matching unresolved totals cannot join
the two populations. Original deliveries or older retained archives are
the next recovery inputs. See [the historical evidence record](HISTORICAL_EVIDENCE_2026-09-15.md).

MPP census/passport and paid-audit reading have since merged; V3's remaining
task is fresh census qualification. Native MPP checkout and UCP checkout
also shipped. The earlier chat's descriptions of those as wholly future
capabilities or read-only checkout restrictions are superseded by the
dated records already on main.

## OpenAPI: a fresh warning, with a history

The September 23 public fetch returned **700,901 decoded UTF-8 bytes** and
185 paths. The unchanged local warning budget is 700,000 bytes and the
hard cap is 1,000,000: 901 bytes over the warning, 299,099 below the cap.
This is a warning-budget breach, not evidence that a reader failed to
fetch the contract. It is not a latency measurement.

The [measurement record](../research/roadmap-review-2026-09-23/measurement.json)
derives limits from `src/store/reader-limits.ts` and records the capture's
hash. The [compressed public response](../research/roadmap-review-2026-09-23/openapi.json.gz)
preserves the exact bytes. Decompress it, count UTF-8 bytes, parse its
`paths`, and hash the decompressed bytes to reproduce the reading.
The checkout revision is not evidence of which deployed Worker answered.
No full six-door sweep or local test run is claimed by this measurement.

Previous dated repairs explain why another small trim is insufficient:

- August 31: repeated inline schemas had taken the document over the
  fetch cap. Component reuse reduced it; PROBLEMS #25 records the incident.
- September 10: [VQ5](OPENAPI_HEADROOM_2026-09.md) corrected character
  counting and incomplete rail coverage in the test. Its local reduction
  left only 4,544 bytes below the warning budget; the release shipped.
- September 12: further thinning restored the original budget after the
  proposed increase. `src/store/reader-limits.ts` records the changes.
- September 19: [the native payment lane was absent from the size fixture](OPENAPI_READ_BUDGET_2026-09-19.md).
  Tests measured a smaller document than production. That repair enabled
  the lane and removed repeated metadata. A [shared production fixture](BUDGETS_PRODUCTION_SHAPE_2026-09-19.md)
  was added for other budget guards.

At the initial planning pass these established two recurring risks: small reserves are consumed by the
next features, and a test configuration can lag enabled capabilities.
They did not yet establish the cause of the 901-byte excess; the local
implementation below subsequently reconciles it. In the original reviewed
source, `openapi-headroom.spec.ts` still constructs its own configuration
alongside `test/helpers/production-shape.ts`; reconcile these before adding
another manually maintained configuration or calling the issue fixed.

VQ5 remains in DONE as the September 10 release. VQ5-R is the new follow-through:

1. Compare a fresh served contract with the answering release and its
   enabled configuration; retain byte contributions and explain differences.
2. Reuse and reconcile existing production-shape guards. Count actual UTF-8
   bytes; cover enabled capabilities and representative growth. A passing
   smaller fixture cannot close a larger served reading.
3. Remove repetition while preserving paths, payment terms, fields and
   supported reader behavior. Show the relevant regression failing before
   the fix and report remaining headroom afterward, including what the
   representative growth case consumes.
4. Verify the released public document. Budget increases and the separately
   pending parameter-reference compatibility decision are not implied by
   this priority update.

## Ordering and cleanup

- Move VQ4 to first and VQ5-R to second on the keeper's direction. Keep the
  other current rows in their relative order, including TR3's buyer journey.
  When historical originals are unavailable, preserve that gap and continue
  to VQ5-R; another census is not historical recovery.
- Move D-AVU to DONE: its own acceptance records that the last stage landed
  September 15. The old heading still said the stage remained.
- Keep M1, M2, D1 and V3 open for their specified qualification evidence.
  They should not trigger a rebuild of already implemented capabilities.
  D1 activation and trailing-slash repair are complete; overnight evidence
  remains to reconcile. A future cleanup can move a fully closed build to
  DONE once its remaining reading is recorded, not merely presumed.
- Remove duplicate completed L6/L7 entries from LATER; preserve their DONE
  records. Correct L9 to gaps 3–5 because Solana bounty claims shipped.
- Treat L3 as additional protocol inspection, reconciling V3 and PS7/PS9
  first. Do not build the MPP reader twice. Preserve the distinction between
  observing another protocol and operating our own checkout.
- Retain the demand gates on LATER. S1/S2 are already shipped distribution
  assets; arrivals do not turn them into future builds. The empty L8 slot
  remains the explicitly reserved place for later parked tickets.

The keeper list's old empty-queue assertion and OpenAPI headroom context
are corrected. Other pending decisions remain pending; no new approval is
inferred for their implementation choices.


## Local implementation batch — September 23

### VQ4: archive search complete; original-report recovery remains open

The retained private census and key-file hashes still match. A bounded search
of seven named local archive roots recovered none of the 28 unresolved report
bindings. The completed search and its limits are in the
[reviewed aggregate](../research/historical-evidence-2026-09-23/README.md).
Keep VQ4 first but input-blocked while working the next actionable row. Original
buyer responses or another retained archive remain the next input.

### VQ5-R: repair and regression guards complete locally

The previous size fixture generated **699,967 bytes**, just 33 under the
700,000-byte warning budget. Its 32-character Solana recipient was shorter
than the 44-character production-shaped recipient repeated across the document.
Using the shared fixture adds **480 bytes**, yielding **700,447** and a failing
regression. The live capture differs by another **454 bytes**: the public
ownership extension contributes 273; saved almanac slugs and the selected example
contribute 181. A recursive comparison found only recipient values, that
extension, and those almanac values different. This reconciles the document
shapes without claiming a deployed Worker version was independently attested.

The guard now uses the existing shared production fixture, which explicitly
includes UCP and signature-shaped fixture provenance. No real credential or
private signature is copied into tests. Nine repeated request/response schemas
now live once in OpenAPI components, removing **13,003 bytes**. Paths, fields,
prose, payment terms, parameters and inline 402 responses are preserved. A full
expanded-contract comparison passed; the retained regression fixture covers
every changed schema location. Existing type/response tests now follow the same
internal references they already support for other components, including when
checking actual returned fields rather than silently iterating an empty schema.

The repaired production fixture is **687,717 bytes**, leaving **12,283 bytes**.
The new bounded growth case adds one spot-check-sized paid path and 31 saved
80-character slugs: **697,693 bytes**, leaving **2,307**. Both size checks failed
before the source repair and pass afterward. These are modest, measured reserves;
the test now fails before that reserve is consumed. This is not a claim that
arbitrary new features or the full 200-page keeper capacity fit. The live saved
content remains a release-time check. [Machine-readable measurements](../research/roadmap-review-2026-09-23/local-repair.json).

**Still open:** publish only with the later batch, then re-read the actual live
contract and existing six-door checks. No budget increase or parameter-reference
ruling has been applied. VQ5-R stays in NOW as release verification pending;
the local build should not be requested again.

### TR3: nested-row guidance complete locally; buyer qualification remains open

The September 20 completed buyer verified the original but stopped before
inspecting its nested endpoint rows. The existing host-history scope paragraph
now names `snapshot.round.hosts`, exact `url` matching including path/query,
row `observed_at` versus publication `taken_at`, and the existing
`verify-source --subject` selector. A missing observation date remains unknown;
absence in one snapshot is not absence from the whole history. The paragraph is
shared by normal/stable JSON, HTML and Markdown. No new endpoint, verifier,
signature or signed artifact was introduced.

The regression failed before this clarification, then passed for all four
views while preserving the exact signed-original bytes. This is guidance
validation, not evidence that a fresh native buyer succeeds. Release readback,
a new frozen cohort and an awake bounded execution window remain required.
All previous cohort scores, spending/call limits and age limits remain unchanged.


## Validation and handoff

- Both OpenAPI size/growth regressions failed before source changes; the
  host-history regression failed before its scope clarification.
- The broader OpenAPI/shared-fixture run checked 86 files: 84 passed, while
  two schema-reader files reported six failures from stopping at references.
  Those readers were corrected to resolve fields, not to waive assertions.
  The final focused run passed all 126 tests across those two files, the
  headroom tests and host history. All 1,213 cases from the broader selection
  therefore have passing results across these runs; this is not one fully
  green 86-file invocation.
- Typecheck, Worker/doors/SDK dry-run bundles, documentation checks and
  whitespace/link checks passed. Documentation checks still report unrelated
  dated pages as aging. The complete repository suite and hosted CI were not
  run for this local batch; required pre-merge checks remain outstanding.
- Work remains uncommitted on `codex/roadmap-refresh-2026-09-23` in
  `/private/tmp/scvd-roadmap-refresh-2026-09-23`. The original shared checkout's
  unrelated changes were left in place. No commit, PR, push or deploy occurred.


## Next batch — D1 and V3 closed from retained evidence

The later September 23 pass obtained the previously outstanding readings:
[D1 overnight qualification and V3 signed census](../research/roadmap-next-2026-09-23/README.md).
Both whole rows now move to DONE. The initial ordering comments above describe
what was still unverified before this follow-through. A newly found cold-read
artifact defect is repaired locally with a failing-before/passing-after workflow
regression; its release readback joins the existing batch release gate.
No PR, commit, push or deployment was performed.


## Further batch — VQ8 closed, guide and comparator repaired

The original September 10 production acceptance records for VQ8 were retained
only on the release branch. Three files were restored unchanged with source
commit and byte hashes; [release scope](ADOPTION_AND_LATENCY_2026-09.md#release-acceptance-recovered-september-23).
That whole row now moves to DONE. No new latency reading is claimed.

CT1's stale unbuilt list also reached the live machine-readable guide: it denied
wallet streaks that the reward service already supplies. The local correction
uses the same constants as the reward service and bell response. The new
regression failed first; all 36 card tests then passed. CT1 remains in NOW for
that correction's release readback, not for rebuilding already-shipped features.

The [fresh unsigned buyer run](../research/buyer-public-recheck-2026-09-23/REPORT.md)
rechecked BUY-040/042/044 without reproducing them at their stated scope. Its
raw comparison exposed 35 false contradictions from ignoring shared OpenAPI
schemas. A bounded local-reference/allOf comparator repairs that instrument;
unresolved and ambiguous schemas remain missing evidence. Two collector
regressions failed before the repair; the final buyer command passes 239 tests.
Original acquisition and erroneous outputs remain intact beside the offline
replay. One link timeout and the broader Wave 1 gaps remain explicitly open.

Typecheck, Worker/doors/SDK bundle checks and documentation checks passed for
this batch. Full repository tests and hosted CI remain outstanding before any
future commit/merge. No commit, PR, push, deploy or paid request was made.


## PR preparation — September 23

The keeper subsequently authorized a PR for the accumulated batch. Earlier
statements that no PR or commit had occurred describe the preceding local work.
The branch was updated to `origin/main` at `4be8dc24`. PR #899 had already
landed the nested signed-row guidance, with a stronger exact-subject regression;
that implementation and test are preserved from main and excluded from this
PR's code changes. The former local wording is retained only in this historical
work record, not layered over the shipped guide.

The PR contains OpenAPI component reuse and production/growth guards, one-run
cold-reading artifacts, the Paywall streak guide correction, the buyer schema
comparator repair, and dated evidence-backed roadmap closeouts. Remaining
historical originals, release readbacks and fresh buyer qualification stay open.


PR-preparation validation on the refreshed base: typecheck, both Worker/SDK
bundles, 16 cold-reader tests, 239 buyer tests, documentation/claims and both
evidence replays pass. The complete `npm test` attempt was interrupted after
more than an hour, with 33 reported failures across five payment/recovery files
and individual cases taking roughly 7–16 minutes. The cause was not established;
that run is not represented as green or complete.

With concurrency limited to two, the five affected application files passed
163 tests in 24 seconds. Every reported failure then passed without changing
source, assertions or timeouts: the small settlement suite passed all 7 tests,
and the other 32 named cases passed with 1,103 unselected cases skipped. These
rechecks do not replace the full hosted gate. The PR is submitted as a draft
pending that qualification. [Exact validation record](../research/roadmap-review-2026-09-23/pr-validation.json).
