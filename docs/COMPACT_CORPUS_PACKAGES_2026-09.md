# Compact corpus packages — September 10, 2026

The keeper asked to continue the verification work while reducing avoidable
latency and reviewing Verify, Sign, CLI and Tab together. This batch adds
explicit compact discovery readers and prepares package corrections. It
makes no payment, signature, settlement or Worker runtime change.

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
- Corpus client: still unpublished. Keep its initial manifest version;
  correct the README/changelog's earlier publication implication, add the
  helper, types, pagination example and error guidance.
- Verify and Tab: no executable or package change required for this work.
- Other unpublished companions and preflight's distinct package name remain
  separate release work. No occupied npm name is used.

The served CLI catalog continues to describe installed capabilities until
publication succeeds. Add compact-command discovery there in the release
closeout, after verifying the installed registry package. Existing compact
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
was weakened. A clean full GitHub CI run is required before release. No npm publication has occurred yet. A fresh 14:57 UTC registry read still
shows the preceding CLI and Sign versions and no corpus-client release.
Reviewed archive contents and identities are retained under
`research/compact-corpus-packages-2026-09-10/`.

Release sequence: required checks on the branch, merge, run the existing
provenance workflow in dry-run mode for the manifest-selected CLI and Sign
versions, then publish and compare fresh registry installs to the reviewed
tarballs. Verify provenance and executable bytes, exercise the installed
CLI against the compact public page, update served discovery and record
receipts here and in DISTRIBUTION.md. Corpus-client first publication still
requires workflow support; it is not implied by adding its helper.

The API release preceding this batch is closed: PR #610 merged at 14:43:14
UTC, both production Worker build checks passed, and a 14:49:56 UTC read
returned 686,600 decoded bytes with all 162 paths. Its full validation and
size comparison remain in `docs/OPENAPI_HEADROOM_2026-09.md`.
