# Make the released verifier available to the offline recipient

The next acceptance run needs to exercise the exact-subject CLI from #817,
prepared for x402-verify 1.6.0 in #819. The prior offline handoff copied only
library modules, so publication alone would leave that repair unavailable.

A new schema-6 plan may opt in through `recipient.verifier`, containing the
package name, version and SHA-256 of each supplied CLI, library and metadata
file. The runner checks those bytes before qualification or acquisition, and
again before recipient preparation. The instrument snapshot includes them.
The handoff copies the complete pinned machinery and records its hashes
separately from the unchanged buyer evidence. Existing plans without the
option retain their library-only input list and prompt.

The new recipient prompt supplies a command template with file, key and URL
placeholders. It does not choose an original or key, label evidence roles,
assert a result, or supply the expected observation. The recipient must read
the unclassified inventory and make those decisions. Time, calls, output,
retention, freshness, network restrictions and the one-attempt rule are unchanged.

## Qualification

- The added handoff tests failed before the implementation: nine failures;
  the existing 28 tests in that file passed.
- All 228 buyer/handoff/controller tests pass with the implementation.
- The executable handoff test runs the copied CLI inside the recipient folder
  against a synthetic signed original. It returns the signed historical row,
  excludes unsigned newer history, preserves gaps and original source bytes,
  and refuses a changed-and-rehashed signed row.
- The integrated local dummy process receives the pinned files. Tampering
  with the instrument's retained CLI blocks preparation; mismatched planned
  bytes block qualification before any native process or output directory.
- These are local regression controls, not native buyer acceptance or proof
  of package publication. A plan's hashes and version alone do not authenticate
  the npm registry. The separate release readback must establish that the
  supplied bytes match the published package.

## Next native plan

After #819 merges and 1.6.0 is published, install the exact registry version
in a fresh directory and retain its integrity/provenance readback. Derive
`recipient.verifier` from that installation, then confirm the checkout files
match through the runner's pin check. Freeze the new plan and instrument
before qualification. Use the existing four-cell subject/budget/freshness
plan with schema 6; do not modify the historical schema-5 cohort.

The full gate remains original retention, correctly scoped buyer reporting,
and a completed independently checked offline recipient. A passing CLI
command cannot stand in for that gate. The existing September 7 observation
ages out September 21 at 02:30:20.531 UTC under the unchanged 14-day policy.
