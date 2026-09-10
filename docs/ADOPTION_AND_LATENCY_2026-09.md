# Adoption and latency follow-through — September 10, 2026

Status: preparation on `codex/adoption-latency-followthrough`, based on
`e6eb17ad`. Not published or deployed. The keeper approved adoption work
and latency measurements while asking for the effort/value of the other
verification options. Production PQ and standalone screening were not
activated or sold by this work.

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
A registry 404 for the distinct name does not guarantee npm acceptance.

Versions come from the manifests. Defects tracks the served vocabulary;
its README now derives the example version from the exported constant.
All three archives are checked by installing the packed bytes, comparing
every shipped file and running their fixture suites on the declared
minimum Node 18.17.0. Initial archive records are retained in the research
folder. Publication and registry provenance checks are the remaining
release gates; preparation is not publication. Earlier CLI, Sign, corpus
client, Verify and Tab releases remain closed and need no API change for
these previews.

## Latency instrument and first reading

The cold reader previously treated every request after the first as warm.
It now uses only responses marked warm with the first response's HTTP
status, and excludes failed first responses from cold comparisons. Every
attempt, transport failure, HTTP 5xx response and excluded comparison is
counted. If the first request fails, JSON retains the later attempts.

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

The two new publication cases, two latency cases, and three preview
cases were observed failing on the old implementation before their fixes.
The first checks after the fixes passed 34 focused Worker tests and 11
cold-reader tests; all four companion Node suites passed. A first companion
attempt hit sandbox loopback EPERM; the authorized loopback run passed.
An earlier focused pass (including checkout-Worker parity) passed 54 tests in five files. The subsequent all-product preview cases and preflight publication selection were witnessed failing before their fixes. Typecheck, both Worker bundles, documentation and claims checks passed. A separate wrong-component-link regression was also witnessed red before restoration. Local defects and MCP-starter archives were packed with scripts disabled and retained with their manifests; this is preparation, not a registry installation check. No full-suite,
publication or deployment success is claimed by these focused checks.

Sources read September 10:
- https://developers.cloudflare.com/workers/best-practices/workers-best-practices/
- https://developers.cloudflare.com/workers/observability/metrics-and-analytics/
- https://www.chainalysis.com/product/address-screening/
- Installed Wrangler deploy help, locked dependency types, and the source
  and test files named by the changes. No runtime binding API changed.

Final preparation checks: 86 affected-surface tests in nine files passed,
including all-product previews, input schemas, checkout Worker parity and
buyer entry points. The three packed companion installations matched all
shipped files and passed their own suites on Node 18.17.0. Typecheck,
both Worker bundles, docs and claims checks passed. The required full local
attempt reproduced repeated Worker `internal error` exceptions and was
stopped; it is not a full-suite pass. Full GitHub CI remains the merge and
publication gate. No test timeout or assertion was weakened.

The installed command check caught a further first-release defect: the
MCP starter compared its module URL to the literal command path, so npm's
bin symlink caused it to exit silently. A regression reproduced that
failure through a command link under a path containing spaces and `#`.
The entry guard now compares resolved filesystem paths and still leaves
library imports inert. The repacked command answers initialization, its
source and packed suites pass on Node 22 and minimum Node 18.17.0, and the
current archive record supersedes the earlier preparation archive. The
preflight installed command and both advertised TypeScript package imports
also passed their installed-use checks. The merge was held for this fix;
full CI must run on the corrected source before release.
