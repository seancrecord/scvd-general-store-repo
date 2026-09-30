# Protocol discovery review — September 30, 2026

Local source review and repairs. This is not a new search-engine observation,
buyer qualification, browser/wallet qualification or deployed readback.
The [September 28 AEO study](../aeo-2026-09-28/README.md) remains the dated
record of engine answers, including its nine unmeasured slots.

## What changed

| Surface | Finding and repair | What it gives a reader |
| --- | --- | --- |
| `/developers` HTML, Markdown, JSON and SoftwareApplication | MCP/native checkout and authentication derive existing capability helpers. Added MCP/WebMCP to the existing protocol section; its MCP browsing link opens the guide rather than a POST-only endpoint. | One place to choose a protocol and see the actual enabled payment instructions. |
| Homepage and its Service JSON-LD | Shared visible description covers observed x402/MPP protocols, unverified advertised terms, structural findings and coverage gaps. The readiness verdict remains x402-specific. | MPP inspection is discoverable without implying settlement, delivery or signature verification. |
| Host corpus Dataset | Schema name now follows the same protocol-specific title as the visible page. | An MPP observation is no longer labelled x402 in structured data. |
| `/agents.md` and README | Describe enabled native MCP checkout alongside existing x402; the manual uses the shared inspection description. | A reader with a native client can find the supported path and distinguish retry formats. |
| `/auth.md`, protected-resource metadata and trust metadata | Native guidance is conditional; legacy x402 metadata remains, with a separate native block. Network names come from configured checkout rails, replacing a static list. | No advertisement of a disabled lane or unconfigured Polygon rail. |
| Developer conventions and auth rate limits | Removed claims that Markdown never depends on reader type or that nothing outside preflight has a limit. Metered preflight answers and validation refusals are distinguished. | Correct content negotiation and retry expectations. |

## Existing surfaces retained

- The shared protocol records still distinguish transport, checkout, endpoint
  inspection, signature verification and directory presence. A2A's served card
  remains its version/capability declaration. UCP's served profile still gates
  checkout by configuration; it does not advertise third-party UCP auditing.
- OpenAPI, MCP and WebMCP already derive tools and payment capabilities from
  shared producers. Existing feature/surface, inspection and rollout tests were
  reused; no second capability catalog or new landing-page tree was added.
- Canonical URLs, sitemap membership, robots rules, negotiated Markdown and
  skill/guide entry points retain their existing structure. The machine-surface,
  sitemap, schema, crawler and first-pass positioning checks were rerun.
- Package publication and external listing status belong to PR4, not to a
  schema change. Serving a description does not establish indexing or ranking.

## Evidence and validation

The primary-source reading is recorded in [SPEC_READS](../../docs/SPEC_READS.md),
September 30. New regressions in `test/protocol-discovery-review.spec.ts` and
`test/passport-mpp.spec.ts` were witnessed failing before their source repairs:
missing native instructions, missing protocol scope, a mismatched Dataset
name, the stale rate/negotiation claims, hidden homepage description and a
static authentication network list.

The affected suite covered 213 tests across 19 files. Eighteen files passed;
the developer-portal file caught a POST-only navigation link and a retired
wording assertion. The link was repaired, the assertion now checks the actual
no-account/no-key statement, and a follow-up across four files passed all 52
tests (including the corrections route). Typecheck and all three deployment
bundle dry runs passed. No deployment was performed.

Before release: the required complete CI shards. After release: public
readback of the repaired pages and native enabled/disabled deployment claims.
The existing October AEO checkpoint remains the place to observe recrawl and
answer changes; this patch does not claim them.
