# Exact-subject evidence reading — September 18, 2026

## Why this change

The [separate September 18 full-capture buyer cohort](../full-inventory-buyer-2026-09-18/REPORT.md)
recorded zero complete journeys out of four and exposed three gaps:
one buyer discarded original signed bytes, one recipient exhausted its call
budget while implementing cryptographic verification, and one recipient
mistook unsigned history for claims covered by a single signed snapshot.
Those outcomes remain unchanged; this is a product repair, not a rescore.

## Implemented

The existing `verify-source` command accepts `--subject` with an exact endpoint
URL. After the existing bundle verifier succeeds, it selects only matching
`round.hosts` rows from authenticated corpus-v1 claims. Complete rows preserve
observation dates, warnings and gaps; JSON pointers locate them inside the
signed claims. Exact match and omitted-row counts expose the bounded output.
Snapshot packaging time is displayed separately from observation time.

No unsigned response context is consulted for selection. Invalid signatures
return no selected claims; unsupported artifact families and absent exact URLs
have separate states. Existing signature/binding exit meanings do not change.
The CLI and README explain that original bytes, source and an independently
established key must survive the handoff. No larger buyer budget, new verifier,
network call, payment or replacement acquisition is introduced.

## Retained-file check

[Actual output](retained-reading.json) comes from a read-only invocation against
the original Claude r2 snapshot retained by the separate full-capture cohort.
Its `source_sha256` identifies the original file. It reports exactly one signed
observation of the target, dated September 7, and a separately claimed snapshot
packaging date of September 18. The unsigned W35/W36 history is not included.
The original file and historical cohort scores were not changed.

```sh
node verifier/evidence-cli.mjs verify-source evidence/original.json \
  --public-key TRUSTED_PUBLIC_KEY_HEX --max-bytes 33554432 \
  --subject 'https://lionx402.com/api/x402/wallet-screen-json'
```

## Validation and limits

The regression was first run against unchanged source and failed because the
option did not exist. It covers exact query matching, forged unsigned context,
wrong key, edited-and-rehashed snapshot, original-file preservation, explicit
output omissions, oversized rows, multibyte/nested content and unsupported artifacts.
A second failing control restored pretty-printing: nested signed rows exceeded
the output allowance. Compact subject output fixes that amplification. Public-key
cryptography in the fixture is generated independently with Node crypto.
A clean local tarball install ran the subject command against the retained
original in one invocation, returning a 1,980-byte reading. This tests the
packaged command, not native agent behavior or npm publication. [Local validation receipt](validation.json) records the completed checks and
the outstanding full-suite CI gate.

The first unsharded full Worker run was interrupted after the host slept;
its log is retained and it is not counted as a passing run. A local four-shard
retry was started, then superseded by required hosted CI after reconciling the
keeper-approved September 16 amendment in `AGENTS.md`: focused local checks
before commit, all full-suite CI shards before merge. Neither incomplete local
attempt is reported as passing. The CI gate must complete before merge.

This is source-checkout functionality. It has not been published to npm or
qualified with fresh native buyers/recipients. The passing retained-file check
does not demonstrate that agents will find the option, preserve originals or
finish within their call caps. A new frozen experiment must establish that;
old cells cannot be repaired or rerun into a passing cohort. The outstanding
retention failure remains an acceptance gap.

The next product gate is a released package containing the option, followed by
fresh installation readback. Only then freeze a new native buyer/recipient plan
against that release, preserving the existing time, call, byte and freshness
limits. Acceptance must check original retention, correct exact-subject scope
and completed recipient interpretation together. Successful direct CLI use
cannot substitute for that behavioral check.

## Requested external follow-ups

The keeper explicitly requested these two comments; both were posted once:

- [MPP directory #991](https://github.com/tempoxyz/mpp/pull/991#issuecomment-5734203544): HTTP/MCP expansion and a house-funded outside-wallet interoperability test. The initial comment correctly marked WebMCP pending; after #813 merged, the same comment was updated in place at 19:58 UTC following a [live module readback](webmcp-readback.json) matching the merged source. No browser payment was exercised by this task.
- [x402scan #1209](https://github.com/Merit-Systems/x402scan/issues/1209#issuecomment-5734203762): fresh unpaid reproduction of `tempo:8453` and exact-query `resource.url` readback.

[Readback summary](directory-followups.json). No listing expansion, new
submission, or paid purchase was performed by this task. External review and
the parser fix remain outside this change.
