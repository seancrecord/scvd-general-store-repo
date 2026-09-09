# Corpus readers and evidence inventory — September 9, 2026

The keeper authorized this follow-through with “okay lets do that” and
release with “nice lets keep rollng”. PR #592 merged at 20:00:48 UTC on
September 9 as `f44df7b165c6534fe7c9cfcb0b2a12790e56eade`; both production
Workers deployed. x402-verify 1.3.0 is published with verified registry
signature and provenance, and its tarball matches the prepared bytes.
The earlier 1.2.0 release remains unchanged. The production census and
independent proof checks below are complete within their stated scope.
The certificate-key repair is documented separately in
`docs/CERTIFICATE_SWEEP_REPAIR_2026-09.md`.

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

The 1.3.0 evidence CLI accepts corpus-v1 records and checks their digest
before exporting the exact canonical signed bytes. `--max-bytes` (library
`maxBytes`) explicitly raises a reader's allowance while keeping the old
default and a hard ceiling. An artifact cannot select its own allowance.
The package README documents invocation, failure modes and unsigned context.

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

Run with the operator's normal Wrangler access:

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

## Production access and measurement

At 16:32 UTC on September 9, the production certificate key-list request
failed with Cloudflare authentication error 10000. No certificate count
or linked-report population percentage was obtained. No credentials were
printed or copied into this work. The retry before the 18:32 UTC capture succeeded with normal
Wrangler authentication. The capture ran from 18:32:01 to 18:37:09 UTC:
all 262 listed certificates passed signature verification, as did all 36
reports in the ten declared report families. Of 80 signed `attests` links,
36 matched verified reports and 44 did not match this inventory. The unresolved
links belong to settlement attestation (7), trust profile (3), Bitcoin anchor
(3), passport refresh (7), spot check (12), and attestation bundle (12).
These are unresolved signed `attests` bindings, not necessarily standalone
reports: Bitcoin-anchor purchases bind an opaque buyer-supplied digest, and
attestation bundles bind a collection of observations. Their absence from
these adapters does not establish lost evidence.
The 121 signed `saw` bindings remain outside this capture.

261 certificates carried stored complete proofs with matching payload digests.
A separate independent Python OpenTimestamps pass verified every one against
matching Blockstream and mempool.space headers across 18 Bitcoin heights,
including header hashes and proof of work. This does not validate Bitcoin
consensus locally or establish exact issue time. The census tool's own
`independently_verified: 0` remains unchanged: the separate result is recorded
in `reader-followthrough/certificate-proof-check.json`.

One signed certificate has no stored timestamp. Two captured certificates
share patron number 199; one has an anchor and one does not. The sweep's
`submitAtPatron` follows a single patron-to-certificate mapping and explicitly
cannot reach the other certificate. The counter reads 261 while certificate
key enumeration finds 262. VQ4 therefore remains open for certificate-key
sweep coverage and classification of the six unresolved product categories.
The subsequent repair is tracked in `docs/CERTIFICATE_SWEEP_REPAIR_2026-09.md`. No historical
certificate was rewritten and no raw purchase record is published.

Aggregate counts, unresolved categories and the public Bitcoin headers are
under `research/verification-2026-09-09/reader-followthrough/`. Private source
records remain outside the checkout. The pre-release sweep-counter record
was unavailable, as expected before this release first retains it; a live
post-deployment observation is still needed.

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

Release validation after incorporating main's buyer-recovery changes ran
all 610 files: 9,532 tests passed, four timed out, and one was skipped. A
focused rerun encountered different failures during a roughly 983-second
runtime stall. All four files then passed unchanged in a sequential run:
631 tests in 122.21 seconds, with idle sleep prevented and original timeouts
retained. Typecheck, both builds, and 36 evidence tests passed. The exact
record is `reader-followthrough/release-validation.json`; GitHub's full
checks remain the final merge gate.

The release's two GitHub CI runs subsequently passed all 610 files and
9,536 tests, with one existing skip, plus every downstream check. At
20:03 UTC, a fresh npm installation followed all three compact-index pages
(limit 2; 1,253–1,629 bytes per page) and exported and verified all six live
snapshots under 32 MiB. Their exact canonical bytes match the earlier
captures. The largest actual CLI bundle was 23,227,004 bytes, including the
captured issuer document. The CLI correctly leaves Bitcoin verification
separate. Release and smoke records:
`research/verification-2026-09-09/reader-followthrough/reader-release.json`
and `registry-1.3.0-smoke.json`. The directory note's September 9 keeper-confirmed send is
included in the documentation closeout; a reply remains pending.
