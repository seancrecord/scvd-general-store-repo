# scvd-defects — changelog

The minor version tracks the vocabulary version; patches fix the
package, never a definition. Versions are immutable once published.

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
