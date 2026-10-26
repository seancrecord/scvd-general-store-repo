# Admin Round archive reads — October 26, 2026

Opening `/admin/round` previously resolved every archived corpus report just
to discover unpublished registry weeks. The discovery now reads the KV index,
skips published weeks, and checks candidate object presence with R2 HEAD.
It downloads no archive bodies for this check and returns each week once.
Legacy inline records remain supported. Incomplete indexes and failed metadata
reads surface as failures rather than a complete empty list.

The registry publish action still reads the signed record before deriving a
tally. The Round still reads the latest corpus entry and current/previous ward
rounds for its other sections. This removes a confirmed unnecessary workload;
it does not establish the CPU-versus-memory cause of the reported 1102 error.
Resource limits are unchanged.

Validation before PR: 24 tests in registry-week-index, registry-pulse,
keepers-round and corpus-memo passed, as did typecheck and both Worker build
checks. Running the new spec against the deployed source produced four
regression failures and one passing legacy compatibility case. Full CI is
required before merge, followed by an authenticated live Round check.
