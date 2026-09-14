# Adoption and latency follow-through — September 10, 2026

Status: companion packages published and registry-verified September 10.
The preview and measurement changes are locally qualified; website release
acceptance is tracked in [PR #621](https://github.com/seancrecord/scvd-general-store-repo/pull/621). The keeper approved adoption work
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
joins. No new observation can replace old signed bytes.

The September 11 revisions are in `PQ_PRODUCTION_ROLLOUT_2026-09.md`
and `SCREENING_PRODUCT_DESIGN_2026-09.md`. They supersede this memo's earlier
broad integration estimate: the PQ candidate is an external signer and
separate verifier over one existing weekly snapshot, with an authenticated,
Bitcoin-anchored key declaration and a completed anchor for each checkpoint.
The public "Watching, not building" stance needs a dated amendment before
that track is presented as adopted. Legacy artifact verification stays
Ed25519-only, with distinct checkpoint keys and purpose enforcement in both
artifact acceptance paths. SHA-512 is optional margin; the signing variant
is an issuer claim. Sequential anchor/verification waits are calendar time,
separate from engineering estimates. Qualification and activation remain
separate decisions.

Screening is an on-chain-source observation for an operator's retained
records, with block identity and explicit coverage. The current boolean
payment gate is not yet a block-bound signed observation. The proposal pairs
a free unsigned check with a paid signed result; unavailable or unsupported
answers mean no paid delivery and no settlement. API resale rights and a
claim that on-chain data has no applicable terms are not established.
The first proposed policy uses Base `safe`, mandatory EIP-1898 hash selection
and two matching witnesses, with product-only quotas and admission limits.
No payout RPC fallback is allowed; actual historical-state support needs
qualification. Demand, acceptable source use and price still need a concrete
decision. The reader estimate now includes that isolation and qualification.

September 11 qualification evidence is in
`../research/qualification-2026-09-11/README.md`. It adds disposable-key
backend measurements and a bounded public RPC read; production signing,
product launch and account-specific provider qualification remain open.
The subsequent synthetic checkpoint format and purpose tests are documented
in `../experiments/pqc/CHECKPOINT_FORMAT.md`; provider setup requirements are
in `SCREENING_PROVIDER_SETUP_2026-09.md`. Released packages remain unchanged.

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
Linux checks qualify package publication; the website still requires its
full GitHub CI before merge. Registry verification and production smoke
checks are recorded separately when performed.

Sources read September 10:
- https://developers.cloudflare.com/workers/best-practices/workers-best-practices/
- https://developers.cloudflare.com/workers/observability/metrics-and-analytics/
- https://www.chainalysis.com/product/address-screening/
- Installed Wrangler deploy help, locked dependency types, and the source
  and test files named by the changes. No runtime binding API changed.

## September 11 — corpus and provider fixture integration

The checkpoint adapter now reuses existing corpus canonicalization, original
signature checks and historical-key window rules. Six frozen records verify
unchanged; retired-key and purpose failures have synthetic regression coverage.
The provider protocol harness exercises changing-state and noncanonical
controls without account credentials. Results and remaining gates are in
`../research/qualification-2026-09-11/README.md`. These external experiments
add no Worker request work or released npm changes; no production latency
improvement or hosted-provider qualification is claimed.

The subsequent screening fixture increment adds fixed-pair agreement and
free/paid budget reservations, including timeout concurrency accounting.
`SCREENING_PRODUCT_DESIGN_2026-09.md` records the remaining live-reader and
durable-admission work. Concurrent witness fixtures establish control flow,
not production latency; released npm packages still need no change.

The next September 11 increment implements the isolated screening Worker:
real JSON-RPC envelopes, bounded parent-hash ancestry, streamed byte limits
and SQLite-backed durable reservations, tested locally with synthetic
providers. `../experiments/screening/worker/README.md` names the remaining
account, authentication, orphan-recovery and signed-delivery gates. Only
pure oracle helpers were extracted from the existing payout service; its
regression suite passes. No public route, provider configuration or deployment
was activated. No verify/sign/CLI/Tab release is required by this internal work.

Private orphan-review mechanics are now implemented and tested: admission
hold, exact-revision approval, bounded evidence references, atomic slot/audit
changes and retry-safe cancellation/recovery. They record operator claims;
they do not authenticate provider evidence. See
`../experiments/screening/worker/RECOVERY.md` for the operator UI, identity,
backup/retention policy and alert integration still needed before activation.

Private document retention is now locally implemented. Recovery requires
retained bytes with matching digests, case scope, roles and timestamps;
immutable references and bounded storage preserve cancelled reviews as well.
The documents remain operator-submitted evidence, not authenticated provider
proof. Normal reads add no provider calls or evidence writes; no production
p95 improvement is claimed. Operator authentication/UI, alerts and account
qualification remain open. No verify/sign/CLI/Tab release is needed.

The operator access gateway is now locally qualified through the existing
administrator login. Identity is server-assigned, actions require matching
origin/context, and uploads have byte/time bounds. Existing authentication
policy was extracted into `src/lib/admin-auth.ts` for reuse without a second
login or changed throttling. No operator route is mounted in production;
its deployed binding/mounting, alerts and provider qualification remain
open. The concrete review UI is locally implemented as described below. `../experiments/screening/operator/README.md` records the boundary.
No additional network hop is introduced into existing admin authentication,
and the screening gateway is absent from production bundles.

The local review UI now presents exact reservations and retained documents,
requires deliberate evidence selection and confirmation, and clears consent
on new readings. An uncertain response pauses mutations until inspection; an
explicit retry preserves the original revision and request body. Final receipts
stay visible after recovery. The browser checks document digests and renders
untrusted evidence as plain text. Local controller, gateway/SQLite and Chrome
fixture checks are retained in `../research/qualification-2026-09-11/review-ui/`.
The UI is unmounted and adds no request-path work to production. Deployed UI
qualification, alerts, backup/retention policy and real accounts remain open;
verify/sign/CLI/Tab packages still need no release for this internal work.

## September 11 — operational attention locally implemented

Private timestamped readings now distinguish held admissions, aging or
unknown-time reservations, paid/free capacity and recovery-register limits.
The calculation projects accounting rollover without resetting active slots
or changing stored credits. The UI shows a dated snapshot; a read-only monitor
entrypoint feeds an unscheduled adapter to the existing alert channel. Failed
or stale readings generate a separate unavailable condition. Local tests
exercise shared alert deduplication with email disabled.

No schedule, provider request, deployed binding or notification was activated.
Monitor last-run retention, an independent freshness watchdog and real channel
delivery remain to qualify. Backup/export/restore and retention acceptance are
specified, not implemented, in
`../experiments/screening/worker/OPERATIONS.md`. The new work stays off production
observation and payout paths; verify/sign/CLI/Tab releases remain unnecessary.

## September 11 — private snapshot and offline restore qualification

A separate backup service now captures a consistent frozen copy of screening
budget state, case history and evidence, with bounded pages and a manifest
hash. Raw contents include sensitive release tokens/caller counters, so the
operator browser and monitoring service do not expose it. Replacement affects
only export staging and requires the previous manifest hash.

The offline restore utility verifies exact bytes and linked records against an
independently retained manifest hash, then leaves a quarantined SQLite archive
with no live budget tables or activation method. Local held/recovered cases,
tampering, missing material, retries, rollback and window changes are tested.
Output is owner-only plaintext; encryption, independent storage, authenticated
live collection, maximum-volume qualification and production reconciliation
remain open. See `../experiments/screening/backup/README.md`. No new dependency,
verify/sign/CLI/Tab package release, deployment or real backup transfer occurred.

### September 11 follow-through: encrypted backup qualification

The offline backup tool now seals verified snapshots with an external age
executable, checks downloaded ciphertext against a retained receipt, and opens
archives only after full decryption success and existing record verification.
Disposable hybrid keys and synthetic state exercise tampering, late failures,
wrong keys/hashes and exact quarantined recovery. Production/Worker imports and
verify/sign/CLI/Tab packages are unchanged. This adds an external host tool, not
an npm dependency or a public post-quantum signing claim.

Independent destination, real recovery-key custody, retention, authenticated
collection/transfer and a live restore drill remain open. Private scratch and
restored SQLite files are plaintext; use an encrypted private host volume.
The keeper choices and exact qualification boundary are in
`../experiments/screening/backup/ENCRYPTED_CUSTODY.md`. No real key, transfer,
account, deployment or schedule was created.

### September 13 — backup custody progress

The private Backblaze destination and dedicated recovery key now exist, and the
keeper-retrieved key copy passed local held/recovered synthetic restores after
formatting cleanup. One encrypted synthetic sample has now been uploaded; its
console SHA-1 matches the source ciphertext. The console refuses SSE-B2 download,
so API readback and remote recovery remain pending. A one-day Read Only key form
restricted to the sample bucket/filename prefix is prepared but not submitted.
No operational-state transfer, retention policy or automatic backup is active.
Current evidence: `../research/qualification-2026-09-13/backblaze-synthetic-upload.json`;
procedure: `../experiments/screening/backup/ENCRYPTED_CUSTODY.md`. Earlier dated
entries describe their original qualification boundaries.

### September 13 — manual remote recovery drill passed

The keeper-created one-day Read Only credential was verified against the B2 API
for the intended bucket and filename prefix. The exact uploaded sample was
downloaded and matched the retained ciphertext hash/size. The verified recovery
identity authenticated/decrypted it; all five archived records match the source,
with admissions disabled and no live tables. Receipt:
`../research/qualification-2026-09-13/backblaze-roundtrip.json`. The console preset
also includes scoped download-token issuance (`shareFiles`); no such token was
created. Its full granted capabilities and expiry are recorded in the receipt.

No further keeper action is needed for this manual synthetic drill. Independent
offline-key verification and retention decisions remain; operational collection,
trusted manifest retention, scheduling/freshness checks and production recovery
remain unfinished. Automatic backups are off. Credentials were not displayed,
and existing spending caps were unchanged. This completion supersedes the
pending-download status above without changing those earlier observations.

### September 13 — host collector and source connection implemented

A resumable host collector, B2 Native API adapter, disabled private source
handler/client and one-run/freshness CLI are now locally tested. Jobs retain their
pending snapshot across failures, refuse blind re-upload after an uncertain
response, verify the downloaded ciphertext, and publish a durable receipt before
advancing. Freshness is measured from capture, not upload completion. Storage
limits stop collection without deleting versions. Recovery identities stay off
the collector; the normal receipt makes no new decryption/restore claim.

The live screening source remains disabled. Dedicated source and prefix-scoped
B2 writer/reader credentials, deployed-source qualification, trusted receipt
retention, scheduling and independent notification remain open. The new B2 tests
use mocked HTTP; the earlier manual live drill is separate. No source deployment,
new live upload, schedule or companion npm release occurred. Procedure:
`../experiments/screening/backup/HOST_COLLECTOR.md`; evidence:
`../research/qualification-2026-09-13/host-collector/validation.json`.
