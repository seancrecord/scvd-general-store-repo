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

## October 2 live acceptance

#967 is merged. The authenticated books check now completes its metric scan,
with no INCOMPLETE warning. It reports counters one settlement above derived
payer purchases. All three chain walks pass; seven historical holes show as
backfilled, and the last raise made no increases. The delivery panel checked
zero records, so it does not establish comprehensive delivery.

Transaction-level arithmetic remains to be inspected before proposing any
correction. Browser access became busy during that step. No private records
were exported, no repair action was pressed and no paid qualification ran.
