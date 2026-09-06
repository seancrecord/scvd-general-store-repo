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
