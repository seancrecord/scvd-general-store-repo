# scvd-defects — changelog

The minor version tracks the vocabulary version; patches fix the
package, never a definition. Versions are immutable once published.

## 0.13.0 — 2026-09-07

Vocabulary v13: `cleared-not-examined` keeps its assertion and loses
its falsifier. No class moved, no other definition changed.

v12 read `checks.assessed_for` as the check's published coverage set.
It is the check's subject — the principals whose exposure the statuses
describe, the payer rather than the sender on a relayed transfer. The
examined set is derived from that field, not equal to it: the
`assets_moved[].to` whose `.from` appears in `assessed_for`.

The v12 rule misfired on ordinary transfers, where the recipient was
screened but is absent from `assessed_for`, reporting unscreened about
an address the check had examined. The correction is 0200project's,
against the line in their own source, found by running the rule rather
than reasoning about it. The v12 text stays readable in the vocabulary
changelog, which is where withdrawn definitions live.

The derivation holds on relayed settlements. Non-relayed transactions
and any transaction carrying an approval are shapes it does not reach,
stated in the entry rather than noted beside it.

If you pinned 0.12.0 and built on that falsifier, this is the upgrade
that matters.

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
