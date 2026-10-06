# S8 v3 readiness — October 2

The keeper approved moving two existing findings into readiness after challenging
the earlier advisory-only recommendation. An agent should not receive a clean
ready result when the declared discovery contract contradicts itself or its
offer promises terms with no matching payment challenge entry.

- `discovery-info-validates`: fails on an observed contradiction between Bazaar
  info and its own schema, within the reader's supported keywords.
- `offer-amount-matches-accepts`: fails when decoded offer terms do not match any
  one accepts entry on network, asset, payTo and amount. Multiple valid price
  tiers may match different entries.

The free v3 route, MCP/WebMCP agent tool, new paid audits, census rows and unsigned sample share one
scoring function. The version metadata is dependency-free so public descriptions
and current links derive the same version without a store/services import cycle.
The v1 and v2 routes and scores remain available; stored signed reports and
canonicalization are untouched. v3's free response includes the v2 comparison;
paid audits retain their existing v1 comparison field. The v1-versus-v2 reporting
series remains explicitly historical and excludes v3-only failures.

Optional extensions remain optional. Missing/unread comparisons are not invented
passes. Resource-description absence and the paid Tier B surfaces section remain
advisory. The schema reader does not validate formats, patterns, numeric ranges,
composition or references and stops after depth 12. The offer reader decodes JWS
payloads but does not verify signatures. Discovery ingestion and payment
completion were not observed. A mismatched offer blocks clean v3 readiness but
does not prove that every client or payment path fails.

Primary-source read: [SPEC_READS](SPEC_READS.md), October 2 S8 entry.

## Validation

Before implementation, the new regression file failed four tests: both defective
responses were still ready, positive v3 checks were absent, and no v3 document
was served. Tests cover both old batteries, all three current producers, valid
multiple tiers, and absence of optional extensions. Additional red controls reproduced the MCP tool returning v1 ready and the
historical delta missing a v2-only catch when a v3 failure was also present.
Both pass after their fixes. Type checking, Worker dry-run bundles, the claims
register and documentation checks pass. Bounded instrument and compatibility
runs cover the updated current-version expectations and reviewed guide
fingerprints; old v2 fixtures remain pinned to v2. Comparing a new v3 reading
to an old v2 row correctly reports instrument_moved, preserving its original
citation instead of calling the stricter verdict a change at the endpoint. The
unchanged base reproduced both earlier guide fingerprints (14/14).

The unbounded local full-suite attempt was stopped after repeated Worker runtime
internal errors. All four CI test shards and the aggregate check remain required
before merge. No production payment or paid canary was made.

## October 5 release readback

#975 merged October 2 with full CI green; both merged-commit Worker builds
succeeded. [Production verification](../research/release-verification-2026-10-05/README.md)
confirms the discovery verdict change through HTTP, MCP and WebMCP and new
v3 census rows. No live offer contradiction or paid audit was exercised. The
readback also found stale version links, a v1 explanation on newer free reports,
and missing check-level remediation mappings; their local follow-up is recorded
there separately from the deployed release.
