# Pickup after the September 19 cohort

The next product work is still TR3: get a buyer from the free reading to a retained,
correctly interpreted signed original within the existing limits. Do not restart
this cohort or increase its budgets. Both verifier releases are published.

A source read after the run found a concrete candidate: the existing
`theRestOfTheLadder()` in `src/services/preflight.ts` tells a caller without spend
authorization to stop with the unsigned result and mark signed evidence incomplete.
The skill separately directs that same caller to free signed corpus history. The
ladder distinguishes merchant-offer authenticity, but its signed-copy branch does
not carry the free historical route. This is a routing inconsistency to test, not
proof it alone caused the model's decision. Reuse the existing corpus citation and
verifier, and keep fresh observations distinct from historical signatures.

1. Inspect the captured first-buyer preflight, host history and public skill
   together. Existing whole-response commands, `cite.entry_url`, issuer-key link
   and free signed-history wording were present. Identify the specific routing
   ambiguity before adding more prose. Check the ladder's paid-stage language
   against those existing free historical controls; current merchant authenticity,
   historical observer signature and paid delivery are different claims.
2. Compare the second buyer's successful raw-byte signature check with its refused
   commands and repeated inspection. Prefer the existing `scvd-evidence
   verify-source --subject` path over another verifier or bespoke snapshot parser.
   Make any repair in the canonical existing surface, with a regression test that
   fails on the old behavior. A tool option being present is not buyer usability.
3. The generic Codex probe's failure is now diagnosed: its OpenSSL command
   supplied hex signature text as raw bytes. The separate [controller diagnostic](probe-diagnostic.json)
   verifies all expected outcomes when those signatures are decoded correctly.
   Keep this as native-task failure, not a missing crypto capability or runtime
   denial. Any task clarification must remain generic and must not supply expected
   answers; it needs its own regression coverage and fresh qualification. Do not
   replace this failed result or retroactively launch its skipped buyers.
4. After a justified repair merges, freeze the changed instrument and public
   package/skill bytes again. Qualify adapters once, then run a new separately
   scored cohort under the same attempt and evidence rules. The pinned CLI's native
   success path is still unmeasured here: the eligible recipient lacked originals.
   Use a genuinely eligible subject under the new plan; do not extend the old
   September 7 observation's fourteen-day window after September 21.

Preserve previous cohorts. Two complete journeys per host/lane remain the target;
this directed experiment establishes neither unbranded discovery nor adoption.
Merchant proof follows dependable buyer completion; platform embedding follows
that shared evidence contract. Directory admission continues independently.

Private run bundle, relative to the main local checkout:
`research/subject-acceptance-20260919.local/`. It contains qualification, cohort,
registry installations and logs. Read `REPORT.md`, `reviews.json`, `score.json`
and `freeze.json` before interpreting the native traces. Controller verification
of the capped buyer is explicitly separate from acceptance.
