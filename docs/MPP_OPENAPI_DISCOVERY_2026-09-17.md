# MPP directory metadata — September 17, 2026

Context Anchor's enabled native checkout returned an EVM/charge challenge, but
`x-payment-info.protocols` still listed only x402. Directory readers therefore
missed MPP even though the SCVD-specific capability extension described it.

The repair adds `{ mpp: { method, intent, currency } }` alongside the existing
x402 entry, derived from `purchaseCapabilities`. The currency uses the same EVM
address normalization as the challenge SDK. No payment handler, price, input,
legacy x402 field or existing offer changes. Disabled/incomplete checkout and
all other products/transports omit the native descriptor.

This is the AgentCash directory profile documented by
[MPPScan](https://mppscan.com/discovery/spec), read against the installed
`@agentcash/discovery@1.7.5` schema. It does not assert conformance to the
separate MPP draft extension that uses the same field name.

## Validation

The regression first failed on the missing MPP protocol object, then tests the
actual unsigned HTTP challenge against the descriptor. It also compares every
pre-existing x402 field between enabled and disabled configurations, checks
all other operations, and removes each checkout prerequisite in turn.
The disposable challenge-key fixture was lengthened to satisfy the SDK's key
requirement; no production key was read or changed.

The pinned directory library reads exact OpenAPI bytes captured from the
compiled local HTTPS Worker. It recognizes `["x402", "mpp"]`, `1 USD`, and
the required `summary` query parameter, with no endpoint warnings. This is a
local static-discovery check, not a paid invocation or production readback.
[Reader receipt](../research/distribution-2026-09-17/observations/mpp-openapi-reader.json).

Typecheck, both Worker/MPP SDK bundles and 24 focused checkout/discovery tests
pass; a final focused rerun also passes all six discovery tests. The full local
suite covers 761 files: 14,702 tests passed and one was skipped after bounded
reruns. Four cases initially timed out, and one file could not start its Worker
runner. The affected cases and all seven tests in that missing file passed on
rerun; no timeout was increased. The claims register and scalability audit also
pass. [Validation receipt](../research/distribution-2026-09-17/observations/mpp-openapi-validation.json).

All CI shards remain required before merge. Deployment readback is recorded in
the release PR; the local result does not establish production behavior or indexing.

## External boundaries

- Official catalog [PR #991](https://github.com/tempoxyz/mpp/pull/991) is pending
  maintainer review and lists only Context Anchor.
- [Merit #1209](https://github.com/Merit-Systems/x402scan/issues/1209) separately
  reports the runtime parser mapping EVM/Base to `tempo:8453` and dropping
  `methodDetails.decimals`. Adding the metadata does not fix that parser.
- MPPScan registration remains unsubmitted until its EVM/Base path is qualified.
- Other MPP products/transports remain upcoming.

## Remaining wording audit

This repair also removes the obsolete till-unavailable sentence from the
OpenAPI core-reading description. Older wording remains in `src/routes/corpus.ts`, `src/store/datasets.ts`,
`src/services/passport-protocol.ts`, `src/store/defect-vocabulary.ts` and the
MPP core, battery, census and surface-reading services. Reconcile those current surfaces separately while retaining previously
signed observations and respecting versioned reading rules; do not rewrite
historical artifacts as if MPP checkout had always been available.
