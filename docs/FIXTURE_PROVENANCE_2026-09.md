# Fixture provenance in the corpus vocabulary

*Decided 2026-09-12 on the keeper's "close the gap and enhance, we aren't
pivoting". Ships the four fields the conformance corpus forming on
x402-foundation/x402#3396 reads, on every row this store already served.*

## What the corpus reads

smartflowproai-lang/x402-endpoint-validator v1.5.1 (tagged 2026-09-12,
MIT) cut a generated index from its fixtures under the vocabulary the
thread agreed: `proves` declared inside the vector file, `source` from
{simulated, observed, derived}, `captured_at` as the claim's birth and
`last_verified_at` as its freshness, rows regenerated from an exact tag.
This store's fixture index carried the same facts as prose (`recorded`,
`why`) and no freshness half at all.

What was read, so the record is exact: sixteen vectors, all with
`proves`; five with any capture stamp; `source` inferred by the
generator from whether a URL is present rather than declared; and
`last_verified_at` read from a watch state file on the maintainer's
machine, which a third party cannot regenerate from the tag. No
mention of this store anywhere in the tag.

## What changed here

- Wrapped fixtures (doors, mpp, settlement-responses) declare `source`
  and `captured_at` inside the file. Constructed shapes say null. The
  one derived door, `clean-402`, is this store's own hello door with
  its payTo replaced, and says so.
- Raw captures (402index, x402scan) cannot carry a field without
  altering the bytes they are. Their set declares provenance, and each
  x402scan body reads `captured_at` off the `.terms.json` captured
  beside it, so nothing is typed twice.
- The verifier's vectors keep their existing `source` field, which
  points at the vector each was cut from; the set declares them
  simulated.
- `/fixtures.json` emits, per row: `proves` (the file's `why`, the
  verifier's `note`, else `expect`), `source`, `captured_at` with its
  precision, `last_verified_at`, and `verified_by` naming the spec that
  replays the set. A `freshness` block explains the pair once.
- `last_verified_at` is derived from the Worker's version metadata: the
  suite replays every fixture on every push, so the deploy serving the
  index is the last verification. A build without the binding says
  null. It is never a typed date.

`test/fixtures-served.spec.ts` holds each of these: declared fields in
every wrapped file consistent with their source, `verified_by` naming a
spec that exists, the x402scan sibling read, and the freshness half
equal to the deploy stamp or null.

## What this is not

Not a pivot. The weekly corpus, signed and Bitcoin-anchored, stays the
store's index; nothing here is submitted anywhere. The store stays a
cited independent, and its rows are now shaped so anyone can cite one
beside a row from that corpus without translation. Whether rows are
ever contributed under someone else's terms is the keeper's call and
is not made here.
