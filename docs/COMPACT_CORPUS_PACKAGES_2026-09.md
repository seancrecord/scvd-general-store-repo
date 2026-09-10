# Compact corpus packages — September 10, 2026

The keeper asked to continue the verification work while reducing avoidable
latency and reviewing Verify, Sign, CLI and Tab together. This batch adds
explicit compact discovery readers and prepares package corrections. It
preserves payment, signature and settlement behavior. The final Worker
change adds the published compact command to served CLI discovery.

## Readers

`scvd corpus-index [--limit <n>] [--cursor <cursor>]` makes one GET to
`/corpus/index.json` and prints its entire JSON response. The corpus client's
`corpusIndex({ limit?, cursor?, base?, fetch?, timeoutMs? })` does the same,
with a matching TypeScript declaration. Omitted limits use the server's
default; the server owns its upper bound. Cursor values are query-encoded.

Neither reader follows `next`, downloads snapshots or verifies evidence.
Unreadable rows, denominators, `has_more`, `next`, corrections and verification
limits remain intact. `has_more: true` with no next link stays incomplete.
No metadata result is converted into a signature or anchoring verdict.
`corpus()` and `scvd corpus` still read `/corpus.json`; `corpus --since` still
reads the diff. Global JSON/week flags now parse correctly before commands.

The benefit is one bounded metadata transfer instead of a whole-corpus
transfer when the caller chooses discovery. No p95, milliseconds, memory
reduction or backend read-latency improvement is claimed. The existing
server index still reads its bounded KV page; no caching or concurrency
change is hidden in this client release. No dependency was added.

## Package and documentation scope

- CLI: additive command and timestamp-wording correction; the manifest
  prepares the minor release. Package help, README and changelog agree.
- Sign: documentation/metadata patch only. Executable and declarations
  remain byte-identical to the preceding version; no production PQ switch.
- Corpus client: the initial release is now published. Its helper, types,
  pagination example and error guidance ship under the initial manifest
  version; the README gives registry installation instructions.
- Verify and Tab: no executable or package change required for this work.
- Other unpublished companions and preflight's distinct package name remain
  separate release work. No occupied npm name is used.

After the registry CLI installation was verified, the served CLI catalog
gained the compact command. Its regression first failed on the old catalog
and then passed with the published command included. Existing compact
API discovery was already deployed in PR #592. No new API path, product,
price, trust claim or landing page is introduced here.

## Verification and release

The final tests were run against the old implementation first: ten failed,
26 passed. After implementation, all 36 CLI/client checks passed on both Node 22 and
the declared minimum Node 18.17.0, including
encoded cursors, one request despite next links, unreadable rows, incomplete
pagination, error propagation, timeout signals and original corpus/diff
compatibility. All companion Node suites passed. The three focused Worker package suites
passed 29 checks after correcting the changelog's required date format.
Typecheck, both Worker bundle checks, documentation checks and all registered
claims passed. Local archives installed with scripts disabled passed a
fixture-server CLI/client exercise; the packaged declarations passed strict
TypeScript checks including rejected option types. Sign executable and type
files compared byte-identically to the integrity-checked 1.0.2 registry
archive. These local archive checks are not registry publication or provenance
verification.

The full local Worker suite was attempted with four workers and stopped
only after repeated runtime `internal error` failures (exit 143). This
reproduced the limitation seen on the integrated evidence branch; neither
local run is recorded as a full-suite pass. No test, timeout or assertion
was weakened. Clean full GitHub CI runs subsequently passed before publication, as
recorded below. The earlier 14:57 UTC registry read showed the preceding CLI and Sign versions and no corpus-client release.
Reviewed archive contents and identities are retained under
`research/compact-corpus-packages-2026-09-10/`.

Release sequence: required checks on the branch, merge, run the existing
provenance workflow in dry-run mode for the manifest-selected CLI and Sign
versions, then publish and compare fresh registry installs to the reviewed
tarballs. Verify provenance and executable bytes, exercise the installed
CLI against the compact public page, update served discovery and record
receipts here and in DISTRIBUTION.md. Corpus-client first publication required the workflow support and independent
registry checks completed below; adding its helper alone did not publish it.

The API release preceding this batch is closed: PR #610 merged at 14:43:14
UTC, both production Worker build checks passed, and a 14:49:56 UTC read
returned 686,600 decoded bytes with all 162 paths. Its full validation and
size comparison remain in `docs/OPENAPI_HEADROOM_2026-09.md`.

## First corpus-client release preparation

The authorized follow-through adds the corpus client's manifest name to the
existing manual provenance workflow, resolves its directory and runs its
own tests before packing or publication. The regression was witnessed
failing against the old workflow, then passing after the mapping was added.
The initial manifest version is retained; no previous version is overwritten.
README installation examples now use the package name so the immutable
first release will not advertise itself as unpublished. Registry publication
was still pending at this preparation step; workflow
setup alone did not establish permission to create the new name. The
subsequent successful first publication is recorded below.

The production signing plan is `PQ_PRODUCTION_ROLLOUT_2026-09.md`. It keeps
checkpoint work off the checkout path and names the tests, runtime
measurements, package changes and custody decision needed before activation.

First-release preparation checks: 30 focused package-contract checks passed;
all companion Node suites passed and all six corpus-client tests passed on
Node 18.17.0. The repacked archive passed the fixture exercise on Node 18
and 22 and strict packaged declaration checks. Typecheck, both Worker
bundles, documentation and claims checks passed. Archive contents/integrity
are recorded in `research/compact-corpus-packages-2026-09-10/corpus-first-release-pack.json`.
The previously reproduced local full-suite runtime failure remains a
limitation; no additional blind full run or passing full-local result is
claimed. Required clean full CI still gates merge and actual publication.

The corpus-client [workflow dry run](https://github.com/seancrecord/scvd-general-store-repo/actions/runs/34496772508)
passed on `3553dc5e96a4ede6273cb993bc31b56ecbf5bc6b`; its package tests
ran and the Publish step was skipped. The follow-through branch integrates
#605 and #612 to reconcile their overlapping status documents before
release. The integrated check passed 30 package contracts, 12 retained
reader checks, eight Python proof checks (using the existing pinned proof
environment), typecheck, docs and claims. The package archives are unchanged
by that integration.

## Publication and integrated release — September 10

CLI and Sign published from `680c5c051a89df85a18d459c836cb2a9d8f59e97`
after its [full CI](https://github.com/seancrecord/scvd-general-store-repo/actions/runs/34493741057)
passed 633 files and 10,610 tests, with one existing skip. Publication
receipts: [CLI](https://github.com/seancrecord/scvd-general-store-repo/actions/runs/34499849387)
and [Sign](https://github.com/seancrecord/scvd-general-store-repo/actions/runs/34499852883).
The compact API was already deployed; publication used the tested commit
while the combined branch resolved overlapping release documentation.

[PR #613](https://github.com/seancrecord/scvd-general-store-repo/pull/613)
then integrated #605 and #612 and merged at 16:46:31 UTC as
`c69a6764a95c4c9fe52ee956edc7da7a6d02746d`. Its
[full CI](https://github.com/seancrecord/scvd-general-store-repo/actions/runs/34497030322)
passed 633 files and 10,611 tests, with one existing skip. Both production
Worker builds passed on that merge. The corpus client's
[first publication](https://github.com/seancrecord/scvd-general-store-repo/actions/runs/34504193625)
used the exact tested source `64152f16924569221c889d64ec1ffde9e5e70db9`,
now contained in main. The package and publication workflow matched its
earlier successful dry run byte for byte.

All three fresh registry installations match their reviewed archive
integrity and every shipped file. `npm audit signatures` verified their
registry signatures and provenance attestations; each attestation's subject
digest, repository, workflow, commit and invocation also matched the
expected release. The installed CLI read one live metadata page; the
installed corpus client preserved a fixture's unreadable row, next link
and limits with one request. No snapshot or Bitcoin proof verification is
implied by either reader exercise. Sign's immediate post-publish 404
resolved on a later read without republishing.

Versioned public records, verified provenance bundles and audit results
are under `research/compact-corpus-packages-2026-09-10/`. The final served
catalog change passed its witnessed red/green regression, all 60 focused
developer/package/document checks, typecheck and both Worker bundles. Deployment
is governed by the closeout pull request's checks.

The production PQ plan gained two independent implementation cases
(OpenSSL and the pinned candidate, both directions, sixteen negative
cases) and 70 selected NIST expected-result cases. The sample's exclusions
and source hashes remain visible. Its negative control also rejected
altered expected public-key bytes without writing a success report.
No production key, algorithm policy or signing dependency changed.
