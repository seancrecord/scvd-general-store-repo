# Exact signed scope at the buyer's next step — September 20

The [post-routing cohort](../research/free-history-buyer-2026-09-19/REPORT.md)
retained originals in all four attempts, but only one journey passed. Two buyers
attributed unsigned host-history context to a signed snapshot; another spent its
call allowance inspecting files and guessing signature messages. The successful
buyer found the existing exact-subject verifier in the published package guide.

The focused installable skill now places that command directly after original
retention. It uses the caller's exact URL, trusted public key and size allowance.
It explains that exit zero alone does not prove the subject is present, that
omitted rows remain gaps, and that observation age differs from publication age.
It also asks buyers to keep signed observations and unsigned history separate in
saved notes as well as the final reply—the first Codex failure was in a companion
note despite a correct final answer.

This reuses `verify-source --subject`; it changes neither the verifier algorithm,
package version, signed artifacts, purchase rules nor acceptance thresholds.
The installable skill is the source of the served skill and discovery digest.
The library path remains available for an older CLI or another artifact family.

## Validation and next gate

The executable guide regression failed before the skill change because the buyer
had no exact-subject command at this step. It runs the command extracted from the
Markdown against signed fixtures with adjacent unsigned context, then checks
exact URL/query selection, separate observation/publication dates, unchanged
originals, absent subjects, wrong keys, tampered-and-rehashed rows and an unsigned
history substituted for the original. Network fetch is disabled in these controls.

Validation passes: 170 verifier tests, 46 integration tests across five skill,
discovery and evidence-handoff files, typecheck, both Worker bundles, SDK bundle
and documentation checks. The new command regression was observed red before
the guide change. Full hosted CI remains a required merge gate.

This is guidance validation, not a newly successful native cohort. After required
CI, merge and public byte/digest readback, any new native experiment must freeze
and qualify separately. Preserve every previous score and budget. The September 7
observation ages out September 21 at 02:30:20.531 UTC under the existing fourteen-day
policy; use suitable newer evidence or record incompleteness after that time.
Do not widen the window or retry closed cells to obtain a pass.

## Unsigned host-history follow-through

The guide repair merged in [PR #862](https://github.com/seancrecord/scvd-general-store-repo/pull/862).
The host page and Markdown twin still called their unsigned JSON summary “the
signed rows.” They now label the view unsigned; default and stable JSON expose
`evidence_scope.signed: false`, and OpenAPI describes that boundary. The public
correction records the withdrawn wording. Signed originals, tier calculations,
gap counts and historical bytes are unchanged.

The served-view regression failed with the source repair stashed. It covers both
JSON views, HTML, Markdown and OpenAPI, and verifies unchanged original bytes.
The pre-integration full local suite passed 798 files and 15,183 tests, one skip,
zero failures. Integration preserves #862's guide and executable test rather than
replacing them with the parallel draft. [Validation and log hashes](../research/buyer-signed-scope-2026-09-20/validation.json)
separate that full run from checks on the integrated release.

A September 20 controller read also verified public snapshot 8: one exact
endpoint row observed September 14 at 01:30:09.376 UTC, separately from its
September 20 publication. This is a controller check of available evidence,
not native acceptance or independent issuer identity. A new freeze must record
that evidence change; comparison with September 19 cannot isolate a wording effect.

Integrated checks pass: 54 tests across six served-surface files, 12 verifier CLI tests, typecheck, both Worker bundles, the SDK bundle and documentation checks. All hosted gates still apply to the final PR head.
