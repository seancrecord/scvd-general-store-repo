# Traffic and buying evidence — October 12, 2026

The daily desk table called every request outside the known house and
infrastructure buckets an “organic 402.” An unrecognized crawler can land
there. The new label is **unclassified 402 requests**; the counter is unchanged.

The trend now shows monthly requests in three existing buckets: unclassified,
recognized crawler/infrastructure, and house/test. Daily rows explicitly use
UTC. Crawler and house splits are only available monthly in these readings;
there is no invented historical daily breakdown. Capped month scans identify
the counts as floors.

The Sources footer previously summed `channels402Infra`, whose writes were
retired to reduce infrastructure traffic costs. It now sums item-level
`challengesInfra`, which is still recorded. A missing channel row no longer
makes recorded crawler traffic appear absent.

Sources and item tables label their quotient “settles / 402s,” with a clear
statement that independent events do not form joined buyer journeys.
Verification reads likewise do not establish that a buyer verified delivery.
The main totals continue to use the existing combined x402/MPP commerce
reading; traffic, daily sales and ratios remain x402-only. Reclassification
still applies where it already did, and raw daily records are untouched.

The trend links to the existing census, refusal stages and retained-event
recount. Those tools have separate retention/completeness limits. This change
does not identify the October spike's operator, reconcile raw-event/counter
discrepancies, join requests by user agent, block crawlers, or add scans/writes.

## Validation and release

- Four focused regression tests failed on the unchanged source, then passed
  with the change: bucket totals independent of retired channel writes, daily
  UTC wording and preserved counts, event-ratio labels, and capped/no-day reads.
- The focused regression, office item navigation, office consolidation and
  office state checks passed together: 20 tests across four files.
- `npm run typecheck` passed after the final source change.
- Full CI remains required before merge. Release state and production checks
  are tracked in [PR #1011](https://github.com/seancrecord/scvd-general-store-repo/pull/1011).
