# Adoption and latency follow-through — September 10, 2026

Status: released and verified September 10 through
[PR #621](https://github.com/seancrecord/scvd-general-store-repo/pull/621), merged at 2026-09-10T21:09:31Z as
`b41e131d94c2a9fa8a14b9cc05502b1ed6a70c01`. All three companion packages are
published and registry-verified; both production Worker builds and the
live preview checks passed. The keeper approved adoption and latency work.
Production PQ and standalone screening remain deferred; historical evidence
recovery belongs to the separately supplied agent prompt.

## Examples and discovery

The source-derived inventory in
`research/adoption-latency-2026-09-10/preview-inventory.json` names every
menu product and preview kind: seven complete unsigned instrument
specimens, one visual preview, one shared-component preview, and 24
input/output outlines. All 33 menu products have a free preview link.
This is not a claim of 33 full artifact demos or live trial purchases.

Outlines reuse the existing Bazaar input schema, input example, outer
response example and product deliverable description. They explicitly say
`full_artifact_provided: false`; IDs and signatures are placeholders.
Human commissions show a queued order, never fabricated completed work.
The builder takes no environment and performs no network or signing
operation. Full instrument specimens retain their actual construction
paths. The sample rack lists each kind; item pages distinguish outlines;
menu, atlas, buyer contracts and payment challenges carry the preview kind.

Luckies is a visual preview. Opening Day now links the Launch Check it
actually includes, marked as a component rather than an example of the
whole package. No paid handler, signature, price, settlement rule or
external check changed. No sample builder is imported into the checkout
Worker; its preview metadata is derived from the existing menu.

## Companion publication

The provenance workflow now selects scvd-defects, scvd-mcp-starter and
scvd-preflight, resolves their manifest directories and runs their own
tests. The preflight client keeps its `x402-preflight/` source directory
but installs and runs as `scvd-preflight`; its README and command help
agree. The keeper accepted continuing the adoption work after this name
was proposed. npm's existing `x402-preflight` belongs to another project.
The distinct namespace was accepted at publication; no account change was needed.

Versions come from the manifests. Defects tracks the served vocabulary;
its README now derives the example version from the exported constant.
All three archives are checked by installing the packed bytes, comparing
every shipped file and running their fixture suites on the declared
minimum Node 18.17.0. Archive and registry records are retained in the research
folder. Fresh registry installs match every reviewed archive and shipped
file, pass their own fixture tests, and verify their registry signatures
and provenance attestations. The attested source is
`4fe7417429e2580f2a59904e9ed6812693b946b5`; every attestation names this
repository, the publication workflow and its actual invocation.

- [scvd-defects 0.13.0](https://www.npmjs.com/package/scvd-defects/v/0.13.0), [provenance run](https://github.com/seancrecord/scvd-general-store-repo/actions/runs/34525382788/attempts/1).
- [scvd-mcp-starter 0.1.0](https://www.npmjs.com/package/scvd-mcp-starter/v/0.1.0), [provenance run](https://github.com/seancrecord/scvd-general-store-repo/actions/runs/34525385090/attempts/1).
- [scvd-preflight 0.1.0](https://www.npmjs.com/package/scvd-preflight/v/0.1.0), [provenance run](https://github.com/seancrecord/scvd-general-store-repo/actions/runs/34525387399/attempts/1).

Earlier CLI, Sign, corpus client, Verify and Tab releases remain closed and need no API change for
these previews.

## Latency instrument and first reading

The cold reader previously treated every request after the first as warm.
It now uses only responses marked warm with the first response's HTTP
status, and excludes failed first responses from cold comparisons. Every
attempt, transport failure, HTTP 5xx response and excluded comparison is
counted. If the first request fails, JSON retains the later attempts.

The optional control reader also uses the true median for an even sample,
excludes failed, known-cold or different-status repeats, and retains every
raw attempt with coverage counts. A valid control must begin with a measured
2xx response that is not marked cold. Its historical `vantage_floor_ms`
field remains for compatibility, but the report states the unproven
assumption that the control has no application startup cost; the number
does not establish a network cause. `control-integration.json` records a
six-request live CLI check: an immutable public GitHub file as control and
the unpaid Hello challenge, three requests each. All six answered. This
checks the instrument, not a population latency claim.

`latency.json` records 11 requests each to three explicit public URLs at
18:10 UTC. All 33 answered: checkout 402, compact corpus and developers
200. The comparable warm medians were 53, 86 and 44 ms respectively.
The compact corpus first request was marked cold and took 1,091 ms to
headers, with 827 ms in its reported Worker request time. This is one
machine, one short sample, no control read and no before/after experiment.
These observations establish neither production p95 nor a causal isolate
startup cost nor a speed improvement. The historical `cold_penalty_ms`
field is the arithmetic first-marked-cold-minus-warm difference and can
include network/cache effects.

The compact index reads bounded KV records serially, including legacy
embedded records. Its byte cap is load-bearing; adding concurrent full
legacy reads without a memory measurement would trade latency for memory
risk. No cache, concurrency or trust check was changed from this reading.

## Anchor lifecycle limits

`anchor-lifecycle.json` records two explicitly selected public responses.
The old first corpus entry reports a much later proof upgrade after the
previously repaired delivery gap; it is not a normal Bitcoin confirmation
sample. The selected certificate reports submission and upgrade about two
hours apart. Both are service-reported lifecycle fields. No fresh signature
or Bitcoin proof verification was performed for this timing read, and no
population percentile or first-public-availability time is inferred.

## Directory note and decisions

The keeper confirmed sending **Base attribution for scvd.store** to
**info@x402-list.com** on September 9. It asked how the directory attributes
a real Base transfer and why the listing was unmeasured. A later recorded
public read showed measurement. No methodology reply is recorded in this
task, and the keeper's inbox has not been checked; that does not establish
that no reply arrived. No new message was sent.

Historical evidence recovery is a bounded retrieval of original deliveries
and retained journals, followed by signature and exact certificate-hash
joins. No new observation can replace old signed bytes. A PQ qualification
pass is estimated, not quoted, at 2–4 focused engineer-days; production
integration is roughly 1–3 engineer-weeks depending on findings, with
external review and custody potentially adding calendar time. Revenue ROI
is unmeasured. These are planning judgments, not implementation guarantees.

Standalone screening would report a recipient address against a named
source at a fixed block, with unsupported/unavailable results explicit.
A not-listed result would not be a safety or clearance verdict. Before a
paid product: a buyer/use-case or scored demand case, acceptable source
terms, repeatable evidence, and viable price/support cost. No demand or
commercial terms have been established by the competitor comparison alone.

## Checks

New preview, publication-selection and latency regressions were observed
failing on the previous implementation before their fixes. The installed
MCP command check also caught a silent exit through npm's bin symlink.
Its entry guard now compares resolved filesystem paths, including a path
containing spaces and `#`, while imports remain inert. The reviewed packed
command answers initialization and lists the five expected live read-only
tools. The preflight installed command and both advertised TypeScript
package imports passed their installed-use checks. All three packed
companion installations matched every shipped file and passed their own
suites on minimum Node 18.17.0.

The first local full-suite attempt was stopped before a verdict after
misreading expected fault-injection `internal error` logs. Those strings
alone were not a regression. The subsequent completed bounded run found
three real failures: attaching previews by object spread froze
price-dependent menu getters. The same three failures reproduced in
isolation, and the old-source GitHub run also failed them. Keeping the
original property descriptors fixes the regression. All 51 affected tests
in five files then passed. The corrected full local run passed all 638
files and 10,882 tests, with one skip. No assertion or timeout was weakened.

The optional control arithmetic had three witnessed failing regressions;
all 14 Node measurement tests now pass. Typecheck and both Worker bundles
passed after the menu correction. Documentation and claims checks passed.
The independent package archives additionally passed their own Linux
publication dry runs. The corrected full local suite and package-specific
Linux checks qualified package publication. The integrated PR subsequently
passed full GitHub CI: 641 files, 10,899 tests and
1 skip. Those counts include the base branch's additional tests;
the local branch count above remains separately stated. Registry and
production acceptance records are retained alongside the readings.

Sources read September 10:
- https://developers.cloudflare.com/workers/best-practices/workers-best-practices/
- https://developers.cloudflare.com/workers/observability/metrics-and-analytics/
- https://www.chainalysis.com/product/address-screening/
- Installed Wrangler deploy help, locked dependency types, and the source
  and test files named by the changes. No runtime binding API changed.

## Production acceptance and repeat reading

`release-acceptance.json` records the successful full PR CI and the two
actual merged-revision production builds. `live-previews.json` records
32 unique preview URLs covering all 33 products,
plus the Hello payment challenge's preview kind and the item page's
input/output-example label, checked at 2026-09-10T21:18:20.028Z.
`registry-live.json` additionally records the actual registry-installed
MCP command initializing and listing the five expected read-only tools,
the preflight usage command, and Defects matching live vocabulary v13.
No purchases were made by these checks.

`latency-after.json`, read at 2026-09-10T21:18:20.112Z, repeats the same
three URLs and 11 requests per URL. All 33 requests answered with the
expected status and all repeated responses were marked warm. Warm medians
were 38, 71, 34 ms for checkout, compact corpus and developers,
respectively; the earlier reading was 53, 86, 44 ms. First requests
were all marked cold and took 175, 1073, 309 ms. The earlier developers
first request was warm, so those first-response values are not a matched
cold comparison. These short samples from one machine have no concurrent
control and establish neither population p95 nor a causal speedup.
No cache, verification, freshness or bounded-memory policy was loosened.

Post-deployment records and this final documentation update are retained
on the release branch and linked from PR #621. They record observations
after deployment; they are not represented as inputs to the earlier CI run.
