# Paid MPP discovery comparison

Initial implementation: 2026-09-14. Integrated with current main: 2026-09-15.

The paid `service_audit` now carries `surfaces.mpp`, separately versioned
as `mpp-discovery-v1` and citing discovery draft-01. Its input is the
initial GET's Payment challenge, the OpenAPI document already fetched
by Tier B, and the existing closing GET. It makes no additional request.
The free preflight and census retain their single-read budgets; the
x402 verdict, totals and frozen `mpp-v1` checks keep their meaning.
The store observes MPP; its till does not speak it.

For the exact GET operation, the reader accepts flat `x-payment-info`
and the `offers` array. Each observed challenge is compared with every
advertised alternative on method, intent, atomic amount and currency.
The signed result keeps all candidate field comparisons and matching
offer indexes, rather than guessing a pairing by position. A difference
counts only when every candidate conflicts on at least one named field
and the compared terms are identical at both bookends. Rotating IDs do
not imply moving terms; changed or disappearing terms suppress counted
differences. A failed closing read also suppresses them, as unmeasured.
Counts describe observed challenges and carry their denominator.

Dynamic amount (`null`) and omitted currency are unmeasured fields, not
price agreement. Missing discovery is optional, not a defect. Unsupported
or malformed offers, incomplete challenge terms, ambiguous server
mapping, path templates and references remain gaps. The reader resolves
JSON OpenAPI 3.0/3.1, exact paths and an omitted or single same-origin root
server only. It compares literal currency identifiers without alias
conversion, and does not test whether unobserved alternatives are
available, whether challenge binding is valid or whether delivery occurs.

The existing streaming body reader was extracted from the A2A instrument
into a shared helper so surface reads stop at their byte limit instead
of first buffering an unbounded body. The A2A wrapper retains its public
API and default limit. The unsigned audit specimen uses the same MPP
reading function over its constructed absent discovery and challenge.
Vocabulary v16 records MPP as a second reader of the existing paid
`surface-contradicts-challenge` class, retaining the earlier assertion in
the changelog. No new defect class or general conformance claim is added.

Prepared as a separate review branch. No live MPP endpoint was probed,
no payment was attempted and no deployment was run during local validation.

Verification: the focused MPP comparison tests were first run against the
old audit behavior and failed; the streaming test also demonstrated that
the old reader did not cancel the oversized stream. The final audit,
surface, sample, vocabulary, frozen MPP battery, A2A instrument and
collector import-boundary selection passed. Typechecking, documentation
checks and both Worker dry-run bundles passed. Signed-report verification
includes tampering with the MPP finding; request-count coverage confirms
that the new reader adds no network call. These are fixture and local
build results, not live MPP interoperability or a full-suite claim.

## Current-main validation — 2026-09-15

All 13 new comparison tests first failed on current main without the source
changes. With the implementation, all 138 selected checks passed across
discovery, audit, samples, vocabulary, the frozen MPP battery, A2A and the
collector import boundary. Typecheck, both Worker dry-run bundles, docs,
audit and claims checks passed.

The full run completed all 714 files: 713 passed and one failed, with
14,060 tests passing, one failing and one skipped. Its sole failure was
the explicit-null server regression below; this run began before the
final correction. After the full run ended, a fresh run of all 14 tests
in `test/mpp-surface-reads.spec.ts` passed on the corrected code. No files
were omitted by worker startup errors. This records the full run and
final rerun separately; it is not a claim of a wholly green full run
after the correction.

The companion vocabulary snapshot was regenerated as `scvd-defects`
0.16.0 with its changelog and shipped-content hashes. The existing parity
guard failed against the stale snapshot, then all 11 package-contract
checks passed after regeneration. Registry publication is separate.

The generated A2A runner was rebuilt after its stale-copy guard failed.
Its build and standalone tests pass; all 31 A2A validation checks pass.
A review control also reproduced an explicit-null server declaration being
treated as omitted. The fix preserves null as unreadable, with the affected
audit/surface tests, typecheck and both bundles passing afterward.
