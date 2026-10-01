# Document discovery — October 1, 2026

Bounded follow-through on the keeper's request for small discoverability
and readability fixes. Sources and protocol limits are in
[`docs/SPEC_READS.md`](../../docs/SPEC_READS.md#2026-10-01--document-discovery-and-reader-compatibility).

## Public observations before changes

| Scenario | Observed result |
| --- | --- |
| Homepage, HTML | Existing `api-catalog`, `service-desc`, `service-doc`, `describedby` links; scanner passes. |
| Homepage, JSON or Markdown | Only the canonical Link; catalog discovery disappears with the format change. |
| `/what`, HTML or Markdown | Both representations answer 200; neither advertises discovery in Link headers. |
| Catalog, HEAD | 200 with the linkset media type, but no Link header; RFC 9727 §2 calls for one. |
| `/developers`, HEAD | Existing catalog and canonical links present. |
| Published machine-readable documents, browser JavaScript | Source already grants public CORS and exposes Link and ETag; no widening needed for header visibility. |
| Named crawlers, Markdown, explicit format requests | Existing format negotiation and crawler tests; this task does not change those choices. |

Evidence: [scanner response](agentready-scan.json),
[public response headers](public-headers-before.json).
The HEAD capture duplicates headers because curl received both `-I` and
`-D -`; these are two prints of one response, not duplicate server fields.

## Scanner findings that do not justify a feature

- **A2A:** the scanner rejects the default 0.3 card for missing a 1.0 field.
  The [explicit 1.0 request](a2a-v1-card.json) returns `supportedInterfaces`
  for both supported versions. A2A §3.6 requires absent version to mean 0.3.
  No change to default protocol behavior is warranted by this check.
- **OAuth:** no authorization-server discovery is expected for the store's
  accountless interaction. The scanner does find anonymous auth guidance
  and protected-resource metadata. Adding a login system is outside this task.
- **Commerce:** the scanner classified the homepage as non-commerce, then
  skipped x402/MPP checks. That is not a live payment probe or evidence the
  existing payment rails are missing. No paid transaction was attempted.

Robots, sitemap, DNS-AID, content signals, Markdown negotiation, Web Bot Auth,
API catalog, MCP card, skills, WebMCP and ARD pass this scanner's checks.
Those passes do not establish behavior in every external reader.

## Implementation and verification

Added shared discovery headers to successful public document responses,
including JSON/Markdown homepage variants and HEAD on the catalog. Existing
canonical and other links remain, with no duplicate catalog relation on the
homepage. Conditional responses retain discovery links; the existing browser
CORS exposure still applies.

Every registered room advertises its actual machine representation. The
Gazette, Zodiac, Porch and monthly corpus use JSON; the latter has no
Markdown in its empty state. Other rooms advertise their existing `.md`
copies, retaining query parameters. The tests walk the room register and
fetch each advertised copy, so new rooms cannot silently add broken links.
Private, cookie-setting, paid, error, asset and non-read responses remain
outside the shared header addition. Registered public rooms that require
fresh reads (such as `/bot-auth`) can carry discovery even with `no-store`.

Before implementation, the new tests reproduced the missing room headers,
homepage variant links, catalog HEAD link and conditional-copy link. The
initial representation sweep also exposed the four JSON cases above rather
than assuming that every room had Markdown. After implementation, seven
focused test files passed (71 tests), covering existing header behavior,
Markdown suffixes, CORS, named crawlers, canonical URLs and the new boundary.
Typecheck and the deployment dry-run also passed. Full CI is still required
before merge. No deployment or external listing edits in this task.

## Completed followups

HTML-only readers now receive the catalog, API description, developer guide,
and the same room alternate advertised by the response header. A streaming
head transform fills gaps across shared and custom renderers, removes duplicate
discovery tags, and corrects OpenAPI/store-guide tags previously labeled as
alternate copies. Canonical links, feeds, scripts, structured data and body
content survive. Query values are escaped; stale byte lengths and validators
are removed when HTML changes. Discovery middleware is excluded from the
paid-door route chain, preserving parity with the separate doors Worker.

Browser scripts can now preflight conditional GET/HEAD requests outside the
original discovery paths, using only `If-None-Match` and `If-Modified-Since`.
OPTIONS never invokes the document handler. The actual response still must
qualify as a published machine document; HTML, cookies and explicit private
cache directives prevent exposure. The new allowance excludes admin/paid
paths, authorization/payment headers and write methods.

The followup tests failed before implementation (10 failures); the additional
private-response test was independently shown failing before its guard was
added. Final verification passed **105 tests across nine files**, typechecking,
and the deployment dry-run. Coverage includes every registered room, CORS,
conditional responses, crawler negotiation, CSP and payment-door parity.

### Real browser check

The [local browser harness](browser-check.ts) imports the real CORS and
conditional-response middleware and serves fixture documents on one loopback
origin with the reader on another. In the in-app browser, all five checks
displayed `pass: true`: a readable public 200, a readable conditional 304 with
ETag and Link, blocked HTML, blocked private JSON, and a blocked authorization
header. The [server request log](browser-requests.json) records the actual
preflights and requests; the blocked authorization preflight had no subsequent
GET. Browser verdicts were observed in its accessibility output; the server
log alone does not prove whether browser JavaScript could read a response.

To reproduce from the repository root:

```sh
node_modules/.bin/esbuild research/document-discovery-2026-10-01/browser-check.ts --bundle --platform=node --format=esm --outfile=/tmp/scvd-discovery-browser-check.mjs
node /tmp/scvd-discovery-browser-check.mjs
```

Open the printed Reader URL in a browser and press **Run local check**. Ports
are allocated dynamically. This verifies browser enforcement against local
fixtures, not a production deployment. The full room sweep runs separately
in the Workers test runtime. These checks preceded the release commit and production deployment;
the full CI suite remains required before merge.

## Remaining limits worth keeping separate

- Discovery passes do not measure search ranking, external directory
  admission, reader comprehension or successful payment.
