# MPP directory metadata — September 17, 2026

Context Anchor's enabled native checkout returned an EVM/charge challenge, but
`x-payment-info.protocols` still listed only x402. Directory readers therefore
missed MPP even though the SCVD-specific capability extension described it.

The repair adds `{ mpp: { method, intent, currency } }` alongside the existing
x402 entry, derived from `purchaseCapabilities`. The currency uses the same EVM
address normalization as the challenge SDK. No payment handler, price, input,
legacy x402 field or existing offer changes. Disabled/incomplete checkout and
non-shelf operations and other transports omit the native descriptor. The final
repair follows the enabled shelf from [whole-store rollout #790](https://github.com/seancrecord/scvd-general-store-repo/pull/790),
which merged during this work; it is no longer limited to the original pilot.

This is the AgentCash directory profile documented by
[MPPScan](https://mppscan.com/discovery/spec), read against the installed
`@agentcash/discovery@1.7.5` schema. It does not assert conformance to the
separate MPP draft extension that uses the same field name.

## Validation

The regression first failed on the missing MPP protocol object, then tests the
actual unsigned HTTP challenges for Context Anchor and Trust Profile against
their descriptors. It also compares every
pre-existing x402 field between enabled and disabled configurations, checks
the entire enabled HTTP shelf and excluded operations, and removes each
checkout prerequisite in turn across every shelf item.
The disposable challenge-key fixture was lengthened to satisfy the SDK's key
requirement; no production key was read or changed.

The pinned directory library reads exact OpenAPI bytes captured from the
compiled local HTTPS Worker. It recognizes `["x402", "mpp"]`, `1 USD`, and
the required `summary` query parameter, with no endpoint warnings. This is a
local static-discovery check, not a paid invocation or production readback.
[Reader receipt](../research/distribution-2026-09-17/observations/mpp-openapi-reader.json).

Typecheck, both Worker/MPP SDK bundles and 24 focused checkout/discovery tests
pass; a final focused rerun also passes all six discovery tests. Before integration with the later whole-store rollout, the full local
suite covered 761 files: 14,702 tests passed and one was skipped after bounded
reruns. Four cases initially timed out, and one file could not start its Worker
runner. The affected cases and all seven tests in that missing file passed on
rerun; no timeout was increased. The claims register and scalability audit also
pass. [Validation receipt](../research/distribution-2026-09-17/observations/mpp-openapi-validation.json).

After integrating #790, the revised regression again fails without the descriptor;
68 focused tests across discovery, whole-store checkout, challenge parity, x402
compatibility and public records pass. Typecheck and both builds pass. The earlier
full local result is retained as its own pre-integration reading.

All CI shards remain required before merge. Deployment readback is recorded in
[release PR #791](https://github.com/seancrecord/scvd-general-store-repo/pull/791);
the local result does not establish production behavior or indexing.

## External boundaries

- Official catalog [PR #991](https://github.com/tempoxyz/mpp/pull/991) is pending
  maintainer review and lists only Context Anchor.
- [Merit #1209](https://github.com/Merit-Systems/x402scan/issues/1209) separately
  reports the runtime parser mapping EVM/Base to `tempo:8453` and dropping
  `methodDetails.decimals`. Adding the metadata does not fix that parser.
- MPPScan registration remains unsubmitted until its EVM/Base path is qualified.
- The HTTP shelf expansion is covered by #790 and the final metadata tests.
  MCP/WebMCP, other networks/assets and broader live paid qualification remain separate.

## Remaining wording audit

This repair also removes the obsolete till-unavailable sentence from the
OpenAPI core-reading description. Older wording remained in `src/routes/corpus.ts`, `src/store/datasets.ts`,
`src/services/passport-protocol.ts`, `src/store/defect-vocabulary.ts` and the
MPP core, battery, census and surface-reading services.

**Reconciled 2026-09-18.** Each of those current surfaces now carries the
one sentence exported as `UNPAID_READ_NOTE` from `src/lib/mpp-challenge.ts`:
no reading rests on a payment, and the till speaking MPP says nothing
about the door read. The defect vocabulary moved to version 20 for the
`mpp-core-observable-invalid` hint, with the change in its changelog;
assertions, falsifiers and reading rules did not change. Previously signed
observations and the dated 2026-09 records that said the till did not
speak MPP are left as written.
