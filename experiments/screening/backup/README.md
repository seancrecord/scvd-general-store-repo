# Private screening snapshots and offline restore verification

Status: snapshots, offline restore and an external age encryption path are
implemented and tested locally. See [encrypted custody](ENCRYPTED_CUSTODY.md) for
the seal, ciphertext readback and offline open commands. A private Backblaze
destination and dedicated recovery key now exist; the keeper-retrieved key copy
passed local synthetic restores. The September 13 sample completed authenticated
B2 API download, ciphertext checks and exact five-row recovery with admissions
disabled. The website refuses SSE-B2 downloads; the API drill used a scoped
one-day Read Only credential. No backup binding, schedule or production restore
has been set up.
This is a backup of the screening SQLite state, not a complete deployment or
secret-recovery system.

## Sensitive contents and authority

A complete snapshot contains raw budget state, opaque caller counters, lease
release tokens, review targets and revisions, final approvals and all retained
evidence bytes. These are private operational records. A release token is
sensitive authority even though it is not a signing key. Never publish pages,
attach them to a public artifact, put them in logs or commit real snapshots.
Evidence content remains untrusted data and may contain material submitted by
an operator; the exporter cannot certify it contains no secrets.

Only the new private `ScreeningBackup` service entrypoint exposes capture,
manifest and page operations. It uses the same fixed provider-pair object as
the reader. Buyer, monitoring and recovery entrypoints do not expose backup
methods; the operator browser gateway has no backup route. The public HTTP
handler remains 404. No production service binding was added.

Bind this authority only to a separately authorized backup host with access
appropriate to the raw contents. It needs neither provider credentials nor
permission to recover reservations. Do not pass its binding to the public UI,
a monitoring-only process or a buyer service.

## Capture and collect

1. Call `capture(snapshotId, expectedPreviousSha256)` with a new opaque ID. On
   first capture the expected prior hash is null. To replace staging, supply
   the exact prior manifest hash. A stale hash refuses without changing the
   prior copy. Repeating the same ID returns its original snapshot, even if
   live state has since changed; use a new ID for a new observation.
2. Retain the returned `manifestSha256` through an independently trusted path.
   A hash packaged only beside replaceable data does not establish authenticity.
3. Write the returned `manifest` as `manifest.json` and read
   `page(manifestSha256, after)` starting at zero. Append each returned record
   as one JSON line to `records.ndjson`, in order, ending each line with a
   newline. Advance with `next` until `done`. Pages can be retried identically.
   A replaced snapshot refuses old-hash reads; restart with a complete new
   snapshot rather than combining pages.
4. Run offline verification with the independently retained hash. Retain the
   verified archive and receipt in the selected encrypted independent system
   before intentionally replacing an export staging copy.

`source.ts` captures the budget, cases, evidence and case-sequence high-water
mark inside one synchronous SQL transaction. The temporary export tables hold
one frozen staging copy. They are replaced atomically only by another explicit
capture; canonical budget/history/evidence rows are never deleted or changed.
Failure rolls back staging, and success waits for storage persistence. A lost
success reply may still mean capture committed: retry the same ID or inspect
`manifest()`, rather than inventing another replacement.

Pages stay consistent when admissions complete, evidence is added or reviews
change afterward. Row and page bounds come from `BACKUP_LIMITS`; case and
evidence count caps derive from the existing retention limits. The snapshot
is scanned synchronously without collecting all document bytes into a single
in-memory response. Raw bodies are stored directly rather than double-encoded
inside another JSON string in SQLite. The platform's SQL row/resource limits
still apply and can be stricter than format bounds.

Capture is a private maintenance operation on the coordination object. It adds
no work to ordinary observation calls, but a large synchronous capture can
briefly delay other requests on that same object. Maximum-volume CPU, memory,
SQL limits and operating cadence still need qualification before deployment.
No production p95 claim is made.

## Format and trust

`format.ts` is the format and limit source. Each record binds its index, kind,
keys, original sequence and raw UTF-8 body using SHA-256. A second SHA-256
covers the ordered record digests, each followed by a newline. The manifest
hash binds that digest, the format/version, snapshot identity/time, budget
policy, counts, byte total and original case sequence. Fixed array encodings
in `recordDigest` and `manifestDigest` define the byte order; these hashes are
not signatures, post-quantum checkpoints or public anchors.

Verification checks sequence continuity, duplicate/missing/extra rows, bounds,
byte digests, budget accounting, held-case linkage, reservation generations,
case history and retained evidence identity/scope. Completed recovery must
still have the exact approved documents, timestamps and digests. Evidence
freshness is checked at the original decision time, not at today's restore.
A review opened in a later window may legitimately retain older budget
accounting; verification does not reset credits to make it current.

A valid hash does not prove provider authorship, remote termination or that
stored counters match external billing. The externally retained manifest hash
is what protects completeness against an attacker replacing both rows and
in-file checksums. An attacker who can replace that trusted hash can substitute
a different internally consistent archive. Legacy recovered cases without
retained approval bytes are refused rather than silently called complete.

## Offline restore

Build and run from the repository root:

```sh
node experiments/screening/backup/build.mjs
node experiments/screening/backup/.build-check/restore-cli.mjs /private/archive EXPECTED_MANIFEST_SHA256 /private/new-restore.sqlite
```

The command reads bounded newline records, requires a fresh output path, and
prints only a compact verification receipt. Output is an offline SQLite archive
with `restore_meta` and `restore_rows`. It has no live budget/recovery tables,
provider access, request handler or activation method. Reconstituted raw records
remain available for inspection, including original holds and credits, but no
reservation can be released and no caller can be admitted by this utility.

The new database is created exclusively with owner-only permissions; existing
files and symlink targets are not overwritten. It is **plaintext**, not an
encrypted backup. Partial/failed restores remain marked unverified and
quarantined, and cannot be resumed by this command; use another fresh output
path after resolving the archive problem. Failed page inserts roll back the
whole page. A successful receipt records `admissionsEnabled: false`.

This uses Node's built-in SQLite API, exercised on the local Node version in
the validation receipt. That runtime marks the API experimental. No dependency
was added. Neither the CLI nor its offline restore module is bundled into a
Worker. Node tests use a synthetic SQLite adapter for snapshot construction;
the separate Workers suite tests the real local Durable Object storage path.

## Remaining production acceptance

- Finish access policy, independent offline-key verification and retention.
  The selected private B2 destination holds one encrypted synthetic sample;
  its manual remote readback/recovery passed. It is not an operating backup service.
- Qualify authenticated collection, durable delivery and trusted manifest-hash
  retention through the intended backup host; no host collector or live
  operational-state transfer was performed here.
- Preserve deployment configuration and secret recovery separately. This
  archive includes persisted budget policy, not provider credential URLs,
  administrator/signing secrets or the full Worker deployment configuration.
- Exercise maximum supported data volume and a timed restore drill. Reconcile
  old budget state against external spending and active work before designing
  any production reactivation migration. There is no reactivation shortcut.
- Set the schedule and independent freshness checks only after these tests.
  No automatic deletion, canonical retention migration or backup schedule was
  introduced by this implementation.

## Local checks

```sh
node_modules/.bin/vitest run --config experiments/screening/worker/vitest.config.ts
node experiments/screening/backup/build.mjs
node --test experiments/screening/backup/offline.test.mjs
node_modules/.bin/tsc --noEmit -p experiments/screening/backup/tsconfig.json
SCVD_SCREENING_GUARD_MUTATION=backup_record_integrity node_modules/.bin/vitest run --config experiments/screening/worker/vitest.mutation.config.ts -t 'snapshot paging refuses modified'
SCVD_BACKUP_MUTATION=manifest node --test --test-name-pattern='restore refuses rehash_without_trusted_hash' experiments/screening/backup/offline.test.mjs
```

The last two are test-only negative controls and must fail their original
assertions. Results are in
`../../../research/qualification-2026-09-11/private-backup/validation.json`.

## September 13 — host collector implemented, not activated

The resumable collector, bounded B2 transport, disabled private source gateway
and host CLI are now locally tested. The collector verifies each remote readback,
holds ambiguous uploads for inspection, preserves source capture time, and stops
at its pilot storage allowance without deleting archives. Configuration starts
disabled. No new credential, source deployment or schedule was created.
[Host collector operations](HOST_COLLECTOR.md) covers the exact access contract,
CLI, retry/recovery semantics, proposed cadence and remaining activation gates.
