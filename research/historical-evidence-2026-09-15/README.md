# Historical evidence readings — September 15, 2026

These are reviewed aggregates of a new private 418-certificate cohort, not the
missing September 9 private census. Raw buyer records and identifiers are not
published. Read [the feature record](../../docs/HISTORICAL_EVIDENCE_2026-09-15.md)
for the scope, reproduction commands and unresolved sources.

- `inventory-initial.json`: 417 certificates verified, one unavailable read.
- `inventory-with-retry.json`: all 418 verified after a separately recorded retry.
- `catalog-current.json`: 276 of 277 signed catalog commitments matched.
- `catalog-with-history.json`: all 277 matched after the August 26 source candidate.
- `catalog-candidates.json`: public canonical bytes and their hashes, accepted by
  the catalog checker’s `--candidates` input. A candidate only establishes a
  preimage when it matches a separately verified certificate's hash and item.
- `retention.json`: 59 bindings beyond the immutable report inventory; 28 remain
  unresolved. Signed reports, bundles, projections and opaque anchors are distinct.
- `provenance.json`: source revisions, collector hashes, private-manifest hashes
  and the limits of the public aggregates.
- `validation.json`: completed local checks, the full green application suite,
  earlier interrupted attempts and the final test-log hash; no deployment is claimed.
- `merge-validation.json`: separate checks after integrating main, retaining
  the original captures, aggregates and validation record unchanged.

An exact catalog hash match does not establish accepted payment terms, delivery,
report recovery or historical HTTP bytes. These are operator-verified aggregate
claims over private inputs; they are not an independently reproducible population
audit. Neither old record membership nor historical deployment time is inferred
from an equal count, item mix or commit date.
