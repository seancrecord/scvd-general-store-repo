# Historical evidence follow-through — September 15, 2026

The keeper asked to pursue historical evidence first and payment reach second;
MPP is still under development. This pass preserves original observations and
checks exact signed bindings. It does not issue replacement evidence.

## Current scope

The September 9 aggregate recorded 28 unresolved `attests` bindings and a
separate population of uncollected catalog `saw` preimages. These are different
claims: a catalog hash is not the hash of a delivered observation.

The known temporary census and retention directories no longer contain their
raw capture files. The published aggregate and proof-check records remain in
Git, but do not identify the private cohort sufficiently to reproduce its joins.
Another retained copy or original deliveries could reopen that exact cohort.
The new read is a separate population; its denominator must not be substituted
for the old one, and a missing record is not evidence of nondelivery.

A new read-only inventory was saved outside Git and temporary storage,
with private directory and file permissions. It uses the existing collector,
configured storage prefixes, per-read checksums, byte limits and key caps.
The issuer public-key registry is captured separately over HTTPS. Raw purchase
records and certificate identifiers stay private; only reviewed aggregates
belong in the repository.

## Completed local readings

The new inventory enumerated 418 certificates and 41 immutable reports. Its
first run verified 417 certificates, with one read unavailable; a separate
retry recovered that certificate and verified all 418. The first capture is
unchanged. Both captures retain the same enumerated roster, and the second
records its parent manifest hash and retry date. All 41 reports verify.

Of 277 signed `saw` commitments, 276 match current-source catalog preimages.
The remaining commitment belongs to The Statement dated August 26: source
revision `f514d910e44a22c28ab1f37382e912a759eff9ec` supplies its $2 list price,
and those exact canonical bytes match too. The final result is 277 matches,
zero unresolved signed `saw` hashes, and 141 certificates with no signed `saw`.
The intermediate 276/277 result is retained unchanged. The 277 matches use
35 distinct detached preimage files; candidates were derived, not guessed.

There are 100 signed `attests` bindings in this new cohort. The immutable
inventory matches 41. Of the other 59, the retention pass verifies 16 reports
and four bundles, matches six unsigned projections and three opaque digest
anchors, and keeps two empty-bundle bindings separate. **28 report bindings
remain unresolved:** seven settlement attestations, eleven spot checks, eight
bundles, one trust profile and one passport refresh. This matches the earlier
count and item mix, but the missing original private manifest prevents an
identity-by-identity comparison with the frozen September 9 cohort.

The reader retrieved 18 transaction-journal responses; 38 targeted journals
returned no completed record. The unresolved certificates carry dates from
August 2 through September 6. Source history introduces prepared-observation
retention on September 8 (`920d7845`) and hosted grants on September 8
(`2311bd6e`). This makes those newer stores an unproven recovery source for
the older gaps; it does not prove the original goods never existed, nor does
a commit date independently establish a deployment date. Original buyer-held
deliveries or an older retained copy remain the concrete next inputs.

Reviewed aggregates, manifest hashes and the public candidate bytes are in
[`research/historical-evidence-2026-09-15`](../research/historical-evidence-2026-09-15/README.md).
The counts are operator-verified readings of private records, not a publicly
reproducible population audit. No fresh Bitcoin proof check was performed;
stored timestamp status is not promoted into independent verification.

## Catalog commitment recovery

`scripts/catalog-evidence.mjs` derives candidate preimages from the production
`selectedSurface` and JCS functions. It records the source-file hashes used to
derive the candidates. It then verifies every certificate in the supplied
census against separately supplied public keys and joins only an exact `saw`
hash and matching item. Missing, untrusted, altered or unreadable certificates
refuse the targeted run; the command cannot shrink the cohort to make it pass.

The output keeps three outcomes separate: `matched_catalog_preimage`,
`unresolved_saw`, and `no_signed_saw`. Each match has a detached JSON file
containing the exact canonical bytes, without an added newline. That file can
be supplied to the existing evidence CLI through `--evidence`; no npm release
is required. A holder still establishes the issuer public key independently.

This recovers the committed route, list price and required-input list. It does
not reconstruct the actual HTTP response, prove which release answered, recover
the buyer's accepted payment terms, establish delivery, or fill an `attests`
gap. Source-file provenance is an extraction record, not a deployment attestation.
Candidates that do not match stay unresolved. A historical source revision
can supply a candidate, but only the exact certificate hash makes it a match.

From the repository root, with a completed private capture and a new output
directory whose parent exists outside Git:

```sh
node scripts/catalog-evidence.mjs PRIVATE_CENSUS TRUSTED_PUBLIC_KEYS_JSON NEW_PRIVATE_SUPPLEMENT
node scripts/catalog-evidence.mjs --verify PRIVATE_CENSUS TRUSTED_PUBLIC_KEYS_JSON PRIVATE_SUPPLEMENT
```

To use the retained source-derived candidates instead of rebuilding today's
catalog, prepend `--candidates research/historical-evidence-2026-09-15/catalog-candidates.json`
to the first command's arguments and choose another new output directory.

The second command makes no network request and no write. It rechecks the census,
candidate bytes, detached preimages, stored joins and summary. The supplement
is bound to the exact source manifest; it cannot be reused against a different
capture without making a new record. The first command reconstructs candidates
from the current source checkout, not from the historical deployment.

## Validation and outstanding work

The existing retained-evidence and journal-reader tests passed before the
shared certificate-enumeration code was extracted. New tests exercise changed
catalog bytes, required-input order, mismatched items, detached-file tampering,
forged stored results, altered signed certificates and missing captured files.
Disabling the digest join makes the regression test fail; restoring it passes.

All 16 focused tests pass, including the candidate-file input and independent
stored-supplement verification. The complete offline evidence gate passes both
batches (36 and 16 tests), and typecheck, documentation and both Worker dry-run
bundles pass. The final private supplement passed its offline recheck; the
retained manifests and collector source hashes still match their recorded values.

The closeout application run passed all 716 files: 14,096 tests passed and one
existing test was skipped. It used `npm test -- --maxWorkers=6 --reporter=default`
and exited zero. No assertions, isolation, test selection or timeouts changed.
Earlier sandboxed runs could not listen on localhost; other incomplete attempts
were stopped after diagnostics or to adjust reporting/concurrency. The installed
Vitest selects its quieter agent reporter by default, so absent per-file progress
and Worker diagnostics alone did not establish a startup or test failure. Those
interrupted runs remain separate from the completed green result.

The reviewed added content contains none of the 418 captured private certificate
identifiers. Machine-readable validation status and the final test-log hash are
retained with the readings. This branch changes offline tooling and records;
the production Worker is unchanged.

After this pass: reconcile recoverable original report bytes, distinguish
unavailable identities from absent records, and record the exact unresolved
sources. The [payment-reach follow-through](PAYMENT_REACH_FOLLOWTHROUGH_2026-09-15.md)
records the active MPP work, buyer-task coordination and the client/package
paths to qualify next. No MPP acceptance claim follows from this evidence work.

## Integration validation

The first integration with main at `a407dd5f` retained both the catalog-recovery
and PQ summary checks. Its application run was interrupted after failures while
the Mac repeatedly slept; the power log independently records those sleep periods.
The run is not a green validation and its test log is retained separately.

Main advanced during those pauses. The release branch starts at `b62b30b2`
and carries forward the same historical feature, both dated source-reading
entries and the completed/parked PQ row. The captured evidence and its original
validation record retain their bytes. The separate
`research/historical-evidence-2026-09-15/merge-validation.json` records the
release-tree validation, with idle sleep prevented only while the test command
runs. No capture was rerun or historical result relabeled by this integration.

The updated main branch also introduced a clock-dependent decline fixture:
separate events sometimes received the same millisecond timestamp and were
deduplicated by the reader. Two original assertions failed in an isolated run.
The fixture now derives distinct timestamps and index keys from a fixed clock;
all 11 assertions then pass unchanged. This is a test-data repair, not a change
to production decline attribution or deduplication.

The complete release-tree run executed 729 files: 722 passed and seven failed
(14,323 tests passed, ten failed, one existing skip). Six tests/hooks timed out
during the sleep-affected run; another assertion failed after a timeout. The
other three failures were the clock-dependent fixture above. A complete rerun
of all seven failed files then passed all 1,032 tests with exit zero. The full
run remains recorded as failed, not relabeled green. Independent full GitHub
CI is the merge gate. Typecheck, all three offline evidence batches, both
Worker builds, audit, claims and documentation checks also pass.

## Release confirmed — September 16

[PR #726](https://github.com/seancrecord/scvd-general-store-repo/pull/726)
passed its required GitHub CI run `35042487901` and merged at
`bc294edbbc0497404d81f6cf95fc30ea6e8d3ff1` at 02:20:12 UTC. The earlier
local full-run failures and successful reruns remain recorded above; the
independent green CI does not relabel those attempts. Catalog recovery
and the remaining original-report gaps keep their stated scope.


## September 23 archive follow-through

The six retained manifest/key-file hashes still match. A bounded search of
seven local archive roots found no exact matches for the 28 unresolved report
bindings. The search is complete at that scope; VQ4 remains open pending original
deliveries or other archives. [Aggregate and limitations](../research/historical-evidence-2026-09-23/README.md).
