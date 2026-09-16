# MPP core draft-01: an additional observable reading

Built 2026-09-15 on the keeper's request to finish core draft-01 support.
The source read and immutable digest are recorded in `docs/SPEC_READS.md`.

## What is built

`mpp_core` is an additive block on the free preflight, the signed service
audit and its specimen. It runs over the response already captured by the
instrument. The battery is `mpp-core-v1`, citing the exact draft-01 source
revision and SHA-256 through `src/lib/mpp-core-spec.ts`. The draft does not
carry a core version on the wire; this labels our reading, not the server.

The strict sibling parser preserves repeated challenges and other auth
schemes, accepts RFC 9110 whitespace and quoting, and refuses duplicate or
malformed parameters. Known auth-parameter names are case-insensitive;
custom names must be lowercase. Valid unknown values remain uninterpreted.
The historical parser and `mpp-v1` checks are unchanged.

The reading covers id/realm presence, method and intent identifier syntax,
canonical UTF-8/JCS request encoding, the optional flat string-map opaque
value, credential-header selection, expiry syntax and observed freshness,
HTTPS, no-store on a 402, and receipt absence on error responses. It reads
the expanded Problem Details table separately as a recommendation. Raw
opaque contents, requests and receipts do not appear in the new block.

Every check says pass, fail, unmeasured or not_applicable. Aggregate counts
are derived from those checks; failing challenge indexes retain which
alternative failed. No boolean "MPP ready" or general conformance verdict
is inferred. A capped header or alternative list is unmeasured, never a
passing prefix. The signed audit's evidence hash and signature both cover
the block; changing a core finding invalidates the signature.

Vocabulary 18 adds `mpp-core-observable-invalid`, with the named check,
battery and observed response defining the assertion. Its generated
`scvd-defects` snapshot is 0.18.0. Publication is a separate action.

## What remains unmeasured

- Method/intent registration and method-specific request schemas, amounts,
  currencies and recipients. The core draft delegates these; a repository
  directory is not evidence of IANA registration.
- Challenge binding, credential routing, request-body digest syntax and
  binding, replay, concurrency, payment preferences, settlement and delivery.
  There is no server secret or paid retry in this instrument.
- The negotiated TLS version, leap-second validity and expiry with an
  unknown local timezone offset. Deep JSON beyond the validation limit
  remains unmeasured.
- The hidden cause behind a non-402 error status. A visible status alone
  cannot establish which conditional response obligation applied.

The store's till does not speak MPP. Census/passport qualification keeps
its named historical battery; this adds point-in-time core evidence,
not an automatic change to eligibility or a rewrite of old snapshots.
No new census source, payment rail or MCP tool call is introduced.

## Live baseline before merge

On 2026-09-15, the production audit specimen lacked both `mpp_core` and
`surfaces.mpp`; the discovery PR was still open. Corpus snapshot 6, observed
2026-09-08, recomputed to its published digest and verified against the
public signing key. Those historical bytes remain unchanged.

A direct GET of `/api/practice/mpp-shape` returned its MPP-shaped 402.
Running this branch's reader locally over those captured response bytes
found one failed observable check: the missing `Cache-Control: no-store`.
The practice route now supplies that header, with a regression that failed
before the fix. This is a local read of live bytes, not a deployed reading
or a payment test. The free service correctly refuses its own hostname;
verification of this practice door must come from an external reader.

The census/passport PR (#691) merged at 2026-09-15T15:39:39Z after its CI
passed. Discovery (#712) was still open at that check. Merge state alone
does not establish that a new census round has been published.
The deployed passport for the existing `api.onesource.io` observation
subsequently carried the new `x402_verdict` and `x402_failed` fields; its
signed payload matched the displayed payload and verified against the
published key. Its observation remained dated 2026-09-07. This confirms
the x402 path after deployment, not a new MPP observation.

## Validation record

The original 28 integration cases failed against the preceding audit
behavior, before the source changes. The next pass exposed an opaque-array
acceptance bug, which was corrected. A separate failing control established
the lowercase custom-name check. Another control failed when a comma
replaced the required space after the Payment scheme; the sibling parser
now rejects that form. The request-budget fixture was corrected
to include the audit's existing fallback OpenAPI read. All 115 affected
checks then passed, including old MPP readings, discovery, signatures,
samples, vocabulary, schema parity and the collector import boundary.
The final affected selection passed 76 cases, including all 33 core cases.
Typechecking, both Worker bundles, the generated package checks, 20 Node
package tests, the audit/claims checks, documentation checks and the A2A
runner check passed. The full suite completed all 715 files: 714 passed,
with 14,093 passing cases, one skipped case and the single stale-example
failure below. The corrected example spec passed separately; this is not
reported as a second uninterrupted full green run.

The full run caught stale example report shapes. The five synthetic
before-you-pay fixtures gained core blocks produced by the actual reader,
using their recorded response/no-response conditions and a fixed fixture
time. Their original bodies were not retained; Problem Details therefore
remain unmeasured. The dated provenance is in `examples/fixtures/expected.json`.
The corrected shape spec passed all three cases; the shared example
clients passed all 12 Node and three Python tests, including the local
server walk. No client payment decision changed.

These are fixture and local validation results. A production read cannot
prove this branch deployed before it is merged and the deployment completes.

## Verification after deployment

Read the practice challenge directly again and run this reader over the
captured bytes; the no-store failure above should disappear. Check that
the free preflight schema and audit specimen expose `mpp_core`, and that
the specimen's x402-only response is recorded as core absence.

After the census/passport and discovery PRs deploy, a fresh published
round can establish the new census behavior. Preserve the old snapshots
and their signatures; lack of a new field in a pre-deployment snapshot
is historical coverage, not a failed deployment. The MPP-only, mixed and
x402-only passport cases are covered by the census/passport tests; a
fresh round is still needed for live evidence. A specimen is unsigned
and cannot stand in for a real signed discovery audit. No paid encounter
or new census intake was performed in this core change.

## Main-branch follow-up — 2026-09-16

PR #715 merged into the discovery feature branch after #712 had merged
into main. That did not release the core reader. Public reads on September
16 found `surfaces.mpp` in the audit specimen, but no `mpp_core` in either
the specimen or OpenAPI; the practice challenge still lacked `no-store`.
This follow-up targets main directly and brings the reviewed core code,
fixtures and checks into the current application tree.

Main had independently advanced the vocabulary to v17 for the paid
`advertised-version-unpayable` signal. Its class definitions and complete
changelog are preserved; the new core finding advances the vocabulary to
v18 and the generated package snapshot to 0.18.0. The existing snapshot
and shipped-content guards failed against the stale package before it
was regenerated. This does not publish an npm package.

The original validation history above remains historical. The follow-up
PR records validation of the integrated main-based tree. Deployment and
live core verification remain outstanding until that PR reaches main.
