# ARD discovery — 2026-09-06

SCVD was already searchable in Neuronto and WellKnown before this work.
Both returned older SCVD catalog entries with federation disabled. That
establishes indexing at those two services; it does not establish how they
first found the store or that they hold the complete current manifest.

## Schema correction

The ARD proposal remains **v0.91**, while the older AI Catalog envelope's
`specVersion` is **1.0**. The two version namespaces were conflated.
The [schema read](SPEC_READS.md#2026-09-06--ard-catalog-envelope-and-live-registry-discovery)
and [pinned upstream fixtures](../test/fixtures/ard/README.md) record both.
The corrected envelope has specVersion, host and entries. Host displayName
comes from STORE_SERVICE_NAME and identifier from the same origin as the
entry URNs. Root updatedAt/trustManifest are forbidden by the stricter
catalog schema; dates stay on entries and normalize day precision to
midnight UTC to satisfy date-time. Existing query arrays satisfy 2–5.
No resources were removed to achieve validation.

The separately requested signing work shares this checkout. Signed trust
is carried by host and entries, with a catalog digest in signed provenance;
verification and independent anchor/succession requirements are at its
governanceUri. No unsupported custom trust fields are emitted. Schema
validity alone establishes neither cryptographic validity nor admission.

## Searches before refresh

Exact requests, responses, timestamps and identifiers are in
[the search record](ard-discovery/2026-09-06/search-summary.json), with raw
responses beside it. Searches used `federation: none`. These are bounded
first-page observations, not exhaustive inventories.

- **ARD Registry:** POST https://ardregistry.org/api/search returned 100
  results each for `scvd.store` and `x402`, zero SCVD matches. Browser
  searches independently showed no SCVD among 30 results each. Their
  [published API guide](https://ardregistry.org/blog/how-to-connect-your-ai-agents-with-ard)
  and official CLI agree on `/api/search`.
- **Neuronto:** POST https://neuronto.com/search returned three SCVD
  matches among 100 for the domain; one among 100 for x402. The old A2A
  identifier `urn:air:scvd.store:agent:general-store` shows a stale catalog.
- **WellKnown:** POST https://wellknownhq.com/registry/search returned five
  SCVD matches among 50 for the domain; zero among 50 for x402. The request
  asked for 100, but the service returned 50. SCVD rows were marked
  `conformanceGrade: F`, `verification: crawled`, `provenance: published`,
  and no federatedFrom value.
- **Hugging Face Discover:** POST
  https://huggingface-hf-discover.hf.space/search returned zero results for
  both queries with pageSize 20. The first request at 100 was rejected with
  HTTP 422; that error was not counted as absence. Its
  [own README](https://github.com/huggingface/hf-discover) describes indexing
  Hugging Face Skills and Spaces, not a public arbitrary-domain intake.
- **GitHub Agent Finder:** POST
  https://agentfinder.github.com/api/v1/search returned four results for the
  domain and one for x402, no SCVD match, pageSize 20. Endpoint sourced from
  [the official connector](https://github.com/ards-project/ard-connectors/blob/main/skills/github-copilot/SKILL.md).
- **Desvela:** POST https://registry.desvela.dev/search returned six
  results for the domain and one for x402, no SCVD match. No submission
  mechanism was established. Its reported domain-seed crawling is only
  secondhand from [Neuronto's comparison](https://neuronto.com/ard-registries).

Apicurio and mcp-gateway-registry are implementations, not proof of a
public index accepting SCVD. [Apicurio's primary documentation](https://www.apicur.io/registry/docs/apicurio-registry/3.3.x/getting-started/assembly-ai-catalog-ard.html)
describes a projection of stored artifacts and no external catalog importer;
[mcp-gateway-registry](https://github.com/agentic-community/mcp-gateway-registry/blob/main/docs/ard.md)
requires JWT access for registry search and administrator-configured
federation. No public instance or submission target was established for
either, so neither is recorded as having zero SCVD entries.

## Submission paths and remaining validation

[Neuronto](https://neuronto.com/submit) documents unauthenticated
`POST /submit` with `{"domain":"scvd.store"}`. Its OpenAPI confirms 200
means indexed; 202 means pending and requires checking the receipt.
[WellKnown](https://wellknownhq.com/submit) documents unauthenticated
`POST /registry/submit` with the same body. Refresh after publication and
verify the resulting search entries, not merely the submission response.

[ARD Registry submission](https://ardregistry.org/submit) redirects to
sign-in. That is a keeper action. On this read its homepage had no **Run
discovery** button, its shipped homepage client exposed search/explore,
and `/discover` returned 404. Its official CLI 0.3.2 exposes search and
client-side navigate, not the reported server-side schema check. The
requested unauthenticated validator cannot be claimed passed without its
working URL; the keeper has been asked for the direct link.

A weekly thread check is active: Sunday 10:00 America/New_York. It re-reads
schema and registry changes, records bounded search evidence, refreshes
public intake paths, and files account-only work on KEEPER_LIST. It does
not deploy, create accounts, or send correspondence.

## Validation status

Regression witnessed failing against the old producer on the version and
forbidden root fields; date-only timestamps also failed the new guard.
Integrated schema/signature/attestation tests and typecheck pass. Both
Worker bundles pass. Full `npm test`: 555 files passed, 15 failed; 5,394 tests passed, 179
failed, one skipped. Every failing file is a pre-existing untracked
buyer-audit spec; all tracked tests and the new ARD/signing tests passed.
The full run is not green. No buyer-audit source was changed here.
Live publication and refresh results follow below.


## Live publication and refresh — 22:07–22:11 UTC

[PR #547](https://github.com/seancrecord/scvd-general-store-repo/pull/547)
merged at 22:05:59 UTC as `4f086c26e2ad072f7996b72a78963309b184a859`.
Both clean GitHub CI runs passed, including the tracked full suite; the
local untracked buyer-audit failures above did not reproduce in that clean
checkout. Both public manifest URLs now return the same catalog: version
1.0, SCVD General Store host, and 21 entries. Both upstream schemas pass.
The live detached signature, catalog digest and existing certificate-key
match also verify. The anchor chain recomputes and contains the key; the
smoke check did not independently verify Bitcoin inclusion or continuity
from a trusted checkpoint. Exact readings are beside the earlier evidence.

Two unauthenticated refresh requests completed with HTTP 200:

- **Neuronto:** fetched `/.well-known/ard.json`, counted 21 manifest
  entries, and reports `status: indexed`, 22 resources indexed, 17 newly
  added. Its resource count is not the manifest's entry count. Receipt
  [8551796491cb](https://neuronto.com/submit/status/8551796491cb) and
  [publisher page](https://neuronto.com/ard-publishers/scvd.store).
- **WellKnown:** returned all 21 current identifiers, `indexed: 21`,
  `verification: crawled`, and its own `conformance_grade: C`.

Follow-up searches used federation none and the same bounded first-page
requests. [Exact results and identifiers](ard-discovery/2026-09-06/search-after-summary.json):
Neuronto returned three current SCVD identifiers among 100 domain results,
and one among 100 x402 results. WellKnown returned nine current SCVD
identifiers plus one stale A2A identifier among 50 domain results, and one
current x402-verifier entry among 50 x402 results. Current WellKnown rows
now carry grade C; the old `urn:air:scvd.store:agent:general-store` row still
carries F. No stale-row deletion mechanism was established. The new
execution-contract skill and x402 verifier are now visible in that index.
These results establish actual search discovery, not complete retrieval of
all indexed entries or registry verification of the publisher signature.

ARD Registry still returned no SCVD match among 100 results for either
query. Its account-only submission and missing Run discovery URL remain
keeper follow-ups. Its requested discovery validation has **not** been
completed. Weekly checks will revisit indexing, stale rows and intake
changes without treating a submission receipt as a search result.

## Search-query coverage follow-up

The keeper's Neuronto scorecard exposed a separate gap after the signing
release: only five of the 21 entries carried representativeQueries.
A [fresh audit](ard-discovery/2026-09-06/query-coverage-audit-before.json)
reproduced D, 38/100, with zero errors and 16 warnings. Every counted
warning was missing queries; media-type allowlist notices were informational.

Queries now describe each dataset, feed, the function-calling definitions
and the execution-contract skill. The source declarations own them, so
the ARD catalog does not maintain a second path-to-query roster. The
execution-contract description also now names its actual behavioral
instructions. A regression checks every entry on both manifest URLs and
in-page markup; the old test skipped entries missing the very field it
claimed to guard. Its [before-fix failure](ard-discovery/2026-09-06/query-coverage-red.txt)
is recorded. Publication and a new score still require the follow-up release.

The missing HTML-link finding has a separate, reproduced cause. Neuronto's
public audit code requests the homepage with Accept `application/json,*/*`
and then scans for HTML links. The store returns the requested JSON.
Both links are present with Accept `text/html` or `*/*`:
[three response checks](ard-discovery/2026-09-06/query-coverage-paths-before.json).
The fix is in the detector's representation choice; the store's JSON
homepage remains available to callers that ask for it.

## ARD Registry discovery confirmed by keeper

The keeper supplied the submission screen's successful live discovery
output on 2026-09-06. This supersedes the missing-validator status above.
It resolved `https://scvd.store/.well-known/ai-catalog.json`, passed v1.0
schema and format validation, fetched `/.well-known/did.json`, and reported
the cryptographic identity `did:web:scvd.store` verified. It then reported
`(Dry-run) Validated compatibility of 21 entries` and `Validation Checks
Passed`. This is keeper-provided evidence, not a separately repeated
browser run by this task.

The screen requests a description and Confirm & Submit for review.
The requested registry discovery check is now confirmed passed; formal
submission, acceptance and search indexing are not established by this
dry-run output. KEEPER_LIST retains those remaining steps.
