# scvd-defects — changelog

The minor version tracks the vocabulary version; patches fix the
package, never a definition. Versions are immutable once published.

## 0.12.0 — 2026-09-06

Vocabulary v12: adds `cleared-not-examined`, the second evidence label
and the first since Cairn's. A claim carrying a check's passing status
about a subject that was never in the set that check examined — the
status is true of the check, and says nothing about the subject.

Sourced to 0200project (github.com/0200project), who found it in their
own product and disclosed it unprompted. The falsifier is theirs: read
the check's published coverage set and treat any subject absent from it
as unscreened, whatever the status says. Exact on plain, relayed and
batched settlements; over-fires on approvals, and that boundary is part
of the finding.

No class moved, and no existing definition changed.

## 0.11.0 — 2026-09-04

Vocabulary v11: eleven classes for the Machine Payments Protocol's
challenge, one per MPP battery check that can fail, each sourced to the
specification's own MUSTs (github.com/tempoxyz/mpp-specs, draft-00).
No x402 class moved.

## 0.10.0 — 2026-09-03

First publish, roadmap C5, carrying vocabulary v10 (seventeen classes,
one evidence label, both halves of the remediation on every class) and
the nine recorded door fixtures. `defectClass`, `defectsBySignal`,
`remediationFor`, `byDetectability`, `fetchLatest`, `isStale`.
