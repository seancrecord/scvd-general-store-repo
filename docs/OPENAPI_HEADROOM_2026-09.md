# OpenAPI headroom and package follow-through — September 10, 2026

The keeper asked to continue, consider latency without giving up checks,
and review Verify, Sign, CLI, Tab and the companion npm packages.
This batch reduces the API description; it changes no signed artifact,
verification rule, checkout operation or installed-client API.

## Contract reduction

A direct production read at 13:15:09 UTC returned 710,387 UTF-8 bytes and
162 paths. Local tests on base `bc334037`, with all five checkout networks
enabled and fixed test recipients, returned 719,243 bytes. The existing
budget test counted characters and exercised fewer networks. The new
regression counts UTF-8 bytes with all five enabled; it failed at 719,243
against the unchanged 700,000-byte budget before the fix.

Shared A2A schemas, trade response schemas and rate-limit header
definitions now live in OpenAPI components. Expanding references gives
the same entire contract and existing component definitions: every path,
operation, request, response, payment term and instruction is preserved.
The A2A projection derives from the original schema objects; MCP keeps
its self-contained schemas. Request parameters, including Idempotency-Key,
remain inline for the naive readers supported by the September 5 fix.

The local result is 695,456 bytes: 23,787 fewer, all 162 paths retained.
That leaves 4,544 bytes below the warning budget, not unlimited growth.
The hard reader cap remains unchanged. The stronger regression is the
guard against future additions exhausting this remaining warning headroom.

## Latency scope

Gzip on the same local contract fell from 82,467 to 82,190 bytes, only
277 bytes. The material benefit is decoded reader capacity and less
serialization/parsing work; no millisecond or p95 improvement is claimed.
The production response used Brotli, so these gzip measurements are not
a measurement of its wire savings.

Environment-independent schema projections are prepared once per isolate.
There is no request-time deduplication walk, new dependency, new outbound
request, or longer-lived offer cache. Issue inventory and network-specific
terms still render from current inputs. Conditional GET/ETag handling
retains its freshness semantics. Signature checks and settlement ordering
are untouched. Source reads: `docs/SPEC_READS.md`, September 10.

## Package decisions

The direct registry reading and integrity-checked tarball comparison are
in `research/openapi-headroom-2026-09-10/packages.json`.

- **x402-verify 1.3.0:** every published file matches. Its compact corpus
  evidence reader already shipped. No release required for this change.
- **x402-sign 1.0.2:** executable and type files match. The repository has
  a corrected census claim in README and removes an outdated keyword.
  Ship those in a documentation patch through the provenance workflow;
  this is separate from production PQ signing. Registry metadata in this
  read did not include a provenance attestation for 1.0.2.
- **scvd-cli 0.2.0:** executable matches; README now accurately says the
  census includes its timestamp status, rather than asserting completed
  Bitcoin anchoring. Include that correction in the next release. Add an explicit
  `corpus-index` command for compact discovery; keep `corpus` and its
  whole-document output unchanged. That additive command calls for a
  minor release, not a documentation-only patch. The old desk entry
  asking to publish 0.2.0 is closed.
- **scvd-tab 0.11.1:** every published file matches. No required release
  for this contract-only change.
- **scvd-corpus-client, scvd-defects, scvd-mcp-starter:** registry latest
  reads returned 404. These remain unpublished, not stale releases.
  Before publishing, compare the package's actual client contract and
  current version, add it to the supported provenance workflow, and
  verify the resulting registry installation. The corpus client still
  reads the whole `/corpus.json`; add a separate one-page `corpusIndex()`
  helper with caller-controlled pagination, preserving `corpus()`. Carry
  unreadable rows and the server's verification limits through unchanged;
  do not turn a metadata index into a verification claim. This batch
  also corrects the corpus-client README's obsolete source-only verifier
  link to the published evidence CLI instructions.
- **x402-preflight:** npm currently identifies a different project,
  `Gareth1953/x402-preflight`. Our same-named directory is not that
  published package. Its initial release needs a distinct available name
  and corresponding command, docs, examples and discovery links reviewed
  together. A version match must never close this entry.

No npm version is bumped by the OpenAPI reduction. No installed package
parses this OpenAPI document; their executable files have no corresponding
change to release. Future production algorithm changes must update the
signer, verifier, CLI error reporting and any Tab evidence consumers as
one compatibility exercise before activation. Small response schemas do
not answer the separate key-management decision.

## Validation and release

The all-network byte-budget regression was observed failing before the
fix and passing after it. An unchanged-source capture under identical
inputs expands identically to the final contract, including every existing
component. A temporary loopback capture tool saved those public schemas
locally; it is not part of the product or release.

Verify, CLI and Tab package checks: 146 passed, none skipped. The final
API, signer and verifier set passed 65 tests across eight files. Typecheck,
both Worker builds, documentation checks and all 39 registered claims
passed. The documentation check still reports its existing dated backlog.

The local startup check passed: the checkout Worker is 808,288 minified
bytes against its 1,000,000-byte budget. Five local workerd starts had
medians of 53 ms for the checkout Worker, 105 ms for the main Worker and
27 ms for the empty control. These are local startup observations, not
network latency, and there is no matched before/after timing experiment.

The local full Worker suite was attempted with four workers and stopped
after repeated Worker internal errors (exit 143). It is not a passing
full-suite result. It also identified two deterministic clock defects in
existing tests: the August 25 passport fixture expired September 10 at
10:00 UTC, and a September 8 sprint fixture expired at noon. Both still
expected fresh page output from a router reading the real clock.

Each failure repeated in isolation before its repair. Their actual routers
now run under the same controlled Date as fixture issuance; the passport
checks both READY and EXPIRED, and the bounty still expires when the clock
moves forward. All 33 checks in the two repaired files pass. Product expiry
rules are unchanged. The same clock-only repair is carried into the queued
evidence-reader PR #605, whose current full CI began after both expiries.

PR #610 passed full CI and merged September 10 at 14:43:14 UTC as
`1f97e1a14ad9580f98719ac666d4e96f7ee2e5c9`. Both production Worker build
checks on that merge passed. A direct read at 14:49:56 UTC returned
686,600 decoded bytes and all 162 paths, below the warning budget.
This is a live size observation, not a latency benchmark. PR #605 also
passed its preceding full CI; its roadmap conflict is resolved on
`fe431105`, with fresh integrated CI required before merge.

The following package implementation is recorded separately in
`docs/COMPACT_CORPUS_PACKAGES_2026-09.md`; its prepared versions are not
registry releases yet.


## September 10 — adoption package release follow-through

The previously pending Defects, MCP starter and preflight packages are
published and registry-verified. Preflight installs as `scvd-preflight`;
`x402-preflight/` remains the source directory. Older version and press
rows above belong to their dated readings. Current versions, verified
archives, provenance runs, accurate preview scope and website acceptance
are recorded in `ADOPTION_AND_LATENCY_2026-09.md`.
