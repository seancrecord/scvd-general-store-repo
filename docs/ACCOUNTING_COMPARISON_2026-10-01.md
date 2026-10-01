# Accounting comparison — October 1, 2026

The books check scanned the entire `metric:` namespace, then selected sales
counters from the first 5,000 keys. Unrelated traffic metrics could exhaust
that limit before the sales counters were reached. The page correctly called
that result INCOMPLETE, but could not resolve the comparison by reloading.

`reconcileSettles` now reads the `paid`, `paidh` and `nopayer` prefixes for
every month returned by the existing `monthsSinceOpening` helper. It still
uses the bounded, paginated KV reader and preserves every truncation flag.
A cap in any relevant month/kind still makes the comparison INCOMPLETE. Payer
rows and per-settle record scans retain their own caps and warnings.

The scope remains legacy x402, from opening through the current UTC month.
Retired item keys remain included; the current catalog is not an allowlist.
Native MPP counters are excluded. Arithmetic, founding settlement adjustment,
wallet attribution and all stored records are unchanged. This is a coverage
repair, not a transaction repair or a point-in-time database snapshot.

## Validation

- A fixed-clock regression supplies enough unrelated keys to consume the old
  scan and real KV sales from two months, including a retired item, house
  sales, an unattributed payment and a native MPP exclusion control. Before
  the source fix, the counter total was 1 instead of 10; afterward it passes.
- Cap injection covers each of the three relevant counter kinds, payer rows
  and per-settle records; partial coverage still cannot support agreement.
- 25 focused tests across five files pass, including existing reconciliation,
  burst accounting and admin verdict tests. `npm run typecheck` passes.
- Required full CI remains the merge gate.

## Live acceptance still open

After release, read the authenticated books check and confirm the metric side
is complete. If a difference remains, inspect its transaction-level evidence
before proposing any correction. Browser checks cannot currently finish while
Brave reports active user interaction. No private records were exported, no
repair action was pressed, and no paid qualification was performed.
