# Signed endpoint rows at the point of reading — September 23, 2026

The [September 20 buyer cohort](../research/exact-subject-buyer-2026-09-20/REPORT.md)
retained signed originals in all four attempts, but one completed buyer verified
a snapshot and then incorrectly reported that it contained no endpoint observations.
It inspected top-level metadata without following `snapshot.round.hosts`. Its
independent recipient found the exact signed row. The buyer failure remains in
that cohort's denominator.

The existing host-history `evidence_scope.description` now names that nested
location, exact `url` matching including the query string, and the existing
`scvd-evidence verify-source` command's `--subject` selector. It distinguishes
row observation dates from snapshot publication. JSON (including the stable
view), HTML and both Markdown access paths share the same explanation. The
unsigned summary remains unsigned; signed originals, verifier behavior and the
focused skill are unchanged. This adds no endpoint or new verification mechanism.

## Validation and limits

The new regression fails on the old response because the nested location is
absent. After the repair, it follows the advertised path in a signed fixture
with two different query strings on the same host and finds only the requested
endpoint. It checks that every history representation carries the explanation.
All 34 focused subject-history and Markdown tests pass, as do typecheck and
document checks. Full local attempts at default concurrency and with two workers
encountered internal Worker startup errors without completed test results and
were stopped; neither is counted as passing. Under the current repository
commit policy, focused checks permit a commit while the full hosted suite
remains mandatory before merge.
Release requires the normal full hosted suite; production readback and its
retained response hashes follow merge.

This is a navigation hypothesis, not demonstrated buyer improvement. The old
result remains one complete journey out of four. A separate experiment needs a
new source and plan freeze, release readback, and qualification of both buyer
hosts and the offline recipient. Preserve the existing budgets, zero-spend
limit, exact subject, fourteen-day observation age ceiling, and single attempt
per cell. Establish an awake execution window for the complete bounded run.
Merchant and platform qualification remain behind buyer reliability.
