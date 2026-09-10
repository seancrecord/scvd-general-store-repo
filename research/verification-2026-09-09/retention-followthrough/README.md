# Retained evidence follow-through

These reviewed aggregates describe the September 9 capture against the frozen
262-certificate census. They contain no raw purchase records or buyer digests.

- `certificate-final-proof.json`: the final previously omitted certificate
  proof, checked against matching outside Bitcoin headers. Together with the
  earlier 261 checks, this completes the original census's timestamp proofs.
- `initial-capture.json`: 44 initially unmatched bindings; three signed reports,
  two verified bundles, six unsigned projections, three opaque anchors, two
  empty-sheaf cases and 28 unresolved bindings.
- `repeat-capture.json`: the repeat recovered the same signed reports, bundles
  and anchors, but one projection capture was unreadable. Its five projection
  matches and 29 unresolved bindings are preserved as observed.
- `projection-retry.json`: the separate successful retry matched the first
  capture's bytes and the original certificate binding. It does not rewrite
  the failed capture.
- `openapi-live.json`: a fresh read at 00:30 UTC September 10, after the
  separate buyer-guidance release, confirms the OpenAPI warning remains.
- `opaque-anchor-proof-check.json`: three purchased digest proofs independently
  checked against matching outside headers. No buyer-held preimage was checked.

Public headers establish the inputs used for the checks; the aggregate records
alone are not a substitute for the private evidence and detached proofs. No
local Bitcoin consensus validation or historical issue-time claim is made.

Commands, read boundaries and outstanding sources are documented in
[`EVIDENCE_RETENTION_FOLLOWTHROUGH_2026-09.md`](../../../docs/EVIDENCE_RETENTION_FOLLOWTHROUGH_2026-09.md).
