# Corpus readers and evidence inventory — September 9, 2026

The keeper authorized this follow-through with “okay lets do that”. Code
has passed local validation; no new Worker deployment or npm publication
is claimed here. The earlier x402-verify 1.2.0 release is unchanged.

## Corpus access

`GET /corpus/index.json` is an additive, compact index. It projects the KV
metadata one record at a time, never fetches R2 snapshot bodies, pages at
up to `CORPUS_INDEX_PAGE_SIZE`, and bounds each stored value at
`CORPUS_INDEX_RECORD_BYTES` (`src/services/corpus-index.ts`). Both bounds
are printed in the response. Legacy embedded records are read and projected;
missing, corrupt, oversized and unavailable rows remain in the denominator.
The response is discovery metadata, not a chain-verification claim.

Follow `next` until null and retain `has_more`. A truncated page without a
continuation is incomplete. KV listing is not a consistent historical
snapshot and does not prove that nothing was withheld. The original
`/corpus.json` keeps its full `latest` field and gains a compact-index link;
corpus response headers advertise the same index. Existing signed records
are never rewritten for this change.

The source evidence CLI accepts corpus-v1 records and checks their digest
before exporting the exact canonical signed bytes. `--max-bytes` (library
`maxBytes`) explicitly raises a reader's allowance while keeping the old
default and a hard ceiling. An artifact cannot select its own allowance.
The source README documents invocation, failure modes and unsigned context.

`research/verification-2026-09-09/reader-followthrough/corpus-size-check.json`
records all six saved public snapshots verified with unchanged canonical
bytes under a 32 MiB allowance. The largest minimal-context bundle is
23,221,351 bytes. This reuses the September 9 captures; it is not a fresh
production deployment test and does not independently check Bitcoin.

## Certificate and report census

`scripts/capture-evidence-inventory.mjs` uses Wrangler's authenticated,
read-only KV list/get commands. It enumerates certificate keys directly,
so patron-number collisions do not hide a second certificate. Storage
prefixes and certificate canonicalization come from production code through
`scripts/lib/evidence-inventory-schema.ts`; no second certificate field
list is maintained. Raw data can contain private purchase details: the
collector refuses an output directory inside this checkout and creates
private files outside it. Never commit those raw captures.

The manifest retains listing checksums, per-record checksums, read times,
failed reads, collection caps and named report families. Wrangler follows
its list cursors; the collector limits reads per family and records whether
it stopped early. It caps command output and time, but does not change
Wrangler's own internal memory use. A failed list is unavailable, never an
empty population. A listed key without a readable body remains counted.

The offline checker verifies Ed25519 signatures using an independently
selected public-key array, recomputes each supported report's evidence hash,
and joins it to the authenticated certificate `attests` value. Legacy
certificate forms use only the claims actually covered by that signature.
Unmatched, unsupported, unreadable and invalid evidence stays visible.
Historical `saw` preimages are not collected. Hosted projections, recovery-only
observations, caller-held attestations, sheaves and A2A journals are outside
this first inventory; missing a match here is not proof a report never existed.

Run after restoring the operator's normal Wrangler access:

```sh
node scripts/capture-evidence-inventory.mjs /private/tmp/scvd-private-inventory-NEW
node scripts/evidence-coverage.mjs /private/tmp/scvd-private-inventory-NEW /private/tmp/trusted-public-keys.json
```

The public-key file is a JSON array of independently established current
and, where applicable, retired public keys. It contains no private keys.
The aggregate `coverage-summary.json` is generated next to the private
capture. Review the aggregate before publishing it. Stored timestamp states,
matching artifact digests and available proof bytes are counted separately;
**independently verified Bitcoin proofs remain zero in this census tool**.
Use the existing independent proof/header workflow for that separate check.

The hourly certificate sweep now persists its last successful counters with
an observation time and logs the returned summary. Inventory capture reads
that record and the existing patron counter/cursors; sweep activity alone
is not evidence coverage. Failed passes do not overwrite the last successful
observation, whose date remains visible.

## Current production limitation

At 16:32 UTC on September 9, the production certificate key-list request
failed with Cloudflare authentication error 10000. No certificate count
or linked-report population percentage was obtained. No credentials were
printed or copied into this work. Restore normal operator authentication
and repeat the capture; finish independent proof/header checks before
claiming population-wide verified timestamps. VQ4 remains open for that
measurement and the explicitly excluded storage categories.

## Validation

New compact-index and large-corpus CLI tests failed against the earlier
implementation, then passed. The sweep persistence test failed while the
hourly summary was discarded, then passed. Report tests tamper with facts,
re-sign a wrong evidence hash, remove trust, and retain unreadable/missing
certificate rows in their denominator. The final full suite passed: **606 files, 8,905 tests, one existing skip**
(428.44 seconds). Typecheck and both Worker bundles passed. The evidence
command passed 36 tests, including the offline census deletion case; the
focused surface checks passed after adding the corrections pointer and
OpenAPI/discovery registration. Claims resolved 39/39 with none unbound;
the documentation check retained its existing dated-document backlog.
Package dry-run confirmed the CLI and declarations are included.

The first full pass ran while discovery wiring was still being completed:
8,902 tests passed, one skipped, and three surface checks failed (corrections
link, discovery listing, and reader-ceiling roster). Those were fixed and
the entire suite rerun on the completed tree; no test was disabled or given
a larger timeout. The final pass above supersedes that development run.

These changes are on `codex/corpus-reader-coverage`. Release and npm versioning
remain pending. The directory note's September 9 keeper-confirmed send is
included in the documentation closeout; a reply remains pending.
