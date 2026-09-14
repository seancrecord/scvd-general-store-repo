# Verification improvements — September 8, 2026

Latest September 9 follow-through: all 262 certificate proofs in the frozen
census are now independently checked. Retained-evidence reads recovered three
signed reports and two bundles, with unsigned projections, opaque digests and
unresolved bindings counted separately. Current results and remaining limits:
`docs/EVIDENCE_RETENTION_FOLLOWTHROUGH_2026-09.md`. Earlier readings below
remain dated history.

A later public directory read at 00:50 UTC September 10 reports `measured`
(162 settlements and $999.082 over 30 days). One buyer represents 99.79%
of reported volume; these are directory counts, not an independent demand
audit. The earlier unmeasured readings below remain history. The visible
status gap is closed; the maintainer's methodology reply is still pending.
Data: [x402-list.com](https://x402-list.com/services/sean-claude-van-damme-s-general-store)
(CC BY 4.0); captured in
`research/verification-2026-09-09/retention-followthrough/directory-measured.json`.

Authorized in this sitting: “okay lets outline a plan then lets do it”.
Initial implementation ran serially on `codex/verification-evidence`.
That initial scope excluded release; the subsequent authorizations and
current status are recorded below.
The feature queue stays in ROADMAP.md; this document is the design and
validation record, not a second queue.

The keeper subsequently confirmed that the competitor in the original
comparison is Rubric. The prior Rubric documentation read therefore
applies directly; the implementation order is unchanged.

## September 10 — package reader follow-through

PR #610 has passed full CI, merged and deployed; the live API retains all
paths below its size-warning budget. CLI and the corpus client now have
explicit one-page metadata readers, with original whole-corpus output
preserved. CLI, Sign's documentation patch and the corpus client's first
release are now published with verified registry integrity and provenance.
The integrated PR #613 passed full CI and both production builds. The
closeout adds served command discovery and records independent PQ/NIST
probes; production signing remains Ed25519. Release evidence and limits:
`docs/COMPACT_CORPUS_PACKAGES_2026-09.md`.

## Reader and inventory follow-through

Authorized September 9 with “okay lets do that”: compact corpus discovery,
explicit bounded large-snapshot verification, certificate/report inventory
and documentation closeout. Production access was restored; the completed
census verifies 262 certificate signatures and 261 timestamp proofs, with
one uncovered certificate and 44 report links outside the verified inventory.
Current work, checks and trust limits:
`docs/EVIDENCE_READER_COVERAGE_2026-09.md`. PR #592 merged at 20:00:48 UTC and both Workers deployed. npm 1.3.0
published with verified provenance and a matching prepared tarball; a fresh
registry installation verified all six live snapshots at 20:03 UTC. npm
1.2.0 has not changed. The measured missing-anchor repair merged in PR #596 at 21:11:38 UTC; both
production Workers deployed by 21:13:07 UTC. The first delivery pass was not
yet observed at deployment. Its release record and subsequent live follow-up
are linked from `docs/CERTIFICATE_SWEEP_REPAIR_2026-09.md`.

## Release follow-through

PR #585 merged as `041df513989980e614ffab8cd89e173507616137` on September 9
UTC. Both Workers deployed and the public developer, verify and sampled /
unsampled payment-challenge checks passed. Those release actions are done.

The keeper subsequently authorized the remaining sequence: independent
Bitcoin verification, verifier publication, corpus coverage and directory
attribution, with documentation updated throughout. PR #588 merged as
`3fb532f5f3be3119109ba958c1b8cca3281850b6` at 13:55 UTC on September 9;
both Workers deployed, and the live documentation and sampled / unsampled
payment challenges passed. ROADMAP VQ2 records the completed release;
VQ3 subsequently closed the reader-bound work through PR #592; VQ4 tracks
the remaining population-coverage work.
The September 9
read independently checked the receipt and all six listed corpus proofs
against matching headers from two outside explorers. All six corpus proofs
were available at their calendars while the store still served pending
submissions; the missing hourly corpus upgrade pass is now deployed.
This is outside-header verification, not local Bitcoin consensus validation.
The directory mismatch persists in the refreshed capture. The note was
unsent at capture time; the keeper confirmed it sent later on September 9.
A maintainer reply remains pending.
Details and remaining limits are in the observation record below.

The final follow-through tree passed **603 test files, 8,438 tests and one
existing skip** (427.29 seconds on the final documentation pass), typecheck, both Worker bundles, 30 Node
evidence tests, five independent Python proof/tamper checks, 56 focused
checks on the final public wording and the
checkout, corrections and claims checks. Regression checks were observed
failing without the relevant fixes. The documentation check retains its
existing dated-document backlog. See
`research/verification-2026-09-09/validation-summary.json`.
The merged main tree, including the separate PR #587 buyer-recovery
changes, also passed typechecking and **604 files, 8,724 tests and one
existing skip** (441.02 seconds). Scorecard initially hit GitHub GraphQL
internal errors; its delayed retry passed without a code change.
Merge, deployment and the first production delivery pass are complete.
At 14:32 UTC all six listed records served completed proofs, each checked
against the earlier matching outside Bitcoin headers. Signed bytes, digests
and signatures were unchanged. The first read after the scheduled time
was early and still pending; the re-read confirmed completion. Public
responses, delivered proofs and comparison results are retained under
`research/verification-2026-09-09/post-release/`.

The keeper authorized release with “alright lets roll”. The branch was
fast-forwarded to current main `21cff153a23fb5813ed8f2301c71d2dd210b7029`
and the verification changes restored cleanly. A fresh checkout of the
staged release excludes the unrelated uncommitted buyer-audit experiments
and ran the full suite to completion: **601 files passed; 8,245 tests passed,
one existing skip** (847.78 seconds). Typecheck, 29 Node evidence tests,
14 checkout configuration tests, the claims check and both Worker dry-run
builds also passed. The earlier interrupted workspace run below is retained
as history and is superseded for this release by that complete staged run.

The live receipt was exported with the CLI and verified against the key
captured separately earlier in this sitting. Its missing `saw` evidence and
unverified Bitcoin timestamp were reported. The prepared release includes
source distribution of the CLI. Npm publication followed September 9;
the keeper confirmed the directory note sent September 9. A maintainer
reply remains pending. PQ signing stays experimental.

## Outcome of the implementation sitting

Steps 1–2 shipped in PR #585. Step 3 produced a reproducible settlement join
and an unsent directory note. Step 4 produced the protected experimental
envelope, real dual-signature checkpoint, measurements and tampering checks.
Step 5 records one receipt and the unreadable corpus boundaries, not a
fleet-wide percentage. Step 6 is a product design with unresolved demand
and commercial terms. Step 7 is a synthetic key-loss/backdating rehearsal.
Full findings: `docs/VERIFICATION_OBSERVATIONS_2026-09-08.md`.

Validation: 29 Node evidence/envelope/rehearsal tests passed; the final
six-file Worker set passed 72 tests; three trust/anchor files passed 43
with one existing skip. Typecheck, both Worker dry-run bundles, the claims
check and package dry-run passed. The documentation check reported its
existing dated-document backlog. New bundle, CLI, specimen, envelope and
discovery behavior was observed failing before implementation (or against
the untouched starting commit) and passing with it.

The full `npm test` attempt encountered multiple buyer-audit failures and
was stopped (exit 130) before completion. A representative invalid-callback
failure reproduced on a clean archive of starting commit
`9bc7f41ca5bdb0f01bb07680da63f500fde3ebdb`, with the audit test copied in.
This is not a clean full-suite release result; other full-run failures were
not individually classified. No tests were disabled or softened.
`research/verification-2026-09-08/validation-summary.txt` retains summaries.

The original commit/merge/deploy actions are complete. Verifier 1.2.0
was published September 9 with verified registry provenance; see
DISTRIBUTION.md. The corpus upgrade repair shipped in PR #588 and its
first production delivery pass was verified at 14:32 UTC.
The keeper confirmed the directory note sent by hand on September 9 after
agent Mail access was blocked by missing Computer Use permissions. Await
the maintainer's reply; the attribution question is not yet resolved. The PQ candidate
has no independent audit and remains outside production. There is no new
paid screening SKU and no production key change.

## 1. Portable evidence

Add an export and offline verification command to the existing verifier
package. Keep exact signed payload bytes; never reconstruct them from the
display object. A caller supplies the trusted public key independently.
Bundle context (captured key history, original response, source and time)
is explicitly untrusted metadata. Attachments must match a hash inside
the signed payload, or remain absent. Export the OTS proof as bytes for
an independent OTS verifier; do not promote a server's `bounded` label
into a locally verified Bitcoin timestamp.

The first format supports the store's JSON signed-payload responses,
including receipts and reports. Linked evidence may be supplied as local
files; arbitrary links in untrusted artifacts are never fetched. Export
is bounded and refuses existing output directories. The offline command
does no network I/O. Missing evidence, absent timestamps and unknown
issuer identity are distinct from an invalid signature.

Acceptance: real signatures in fixtures; altered bytes/signature/key,
attachment substitution/deletion and rehashed tampering all fail their
checks. An unknown algorithm refuses. An exported bundle verifies after
the source server is shut down. No current key or secret is used.

## 2. Specimens on payment challenges

Reuse the menu's existing specimen mapping without importing sample
builders into the small doors Worker. Add a structured unsigned-specimen
pointer and `sample_url` to the 402 body, derived from the same catalog
entry used by the item page. Never claim a static example is a live demo.
Where there is no sample, say so in the coverage report rather than
inventing one. Keep payment requirements and signature bytes untouched.

Acceptance: sampled and unsampled items, paid/HTTP refusal behavior and
the two Workers' parity; existing schema and response-size guards.

## 3. Traction reconciliation

Read the directory's service and facilitator mappings and a real public
Base receipt. Join transaction origin, USDC transfer and payTo. Record
what matches, what differs, and what could not be read. If a correction
is justified, prepare its exact evidence for the keeper; do not submit
it or manufacture a sale. No ranking forecast.

## 4. Algorithm agility and a local PQ pilot

Introduce a versioned experimental envelope with protected algorithm,
key ID, purpose and verification policy in the signed bytes. Its verifier
requires externally supplied algorithm/key bindings; unknown algorithms,
missing signatures and downgraded policies refuse. Keep legacy formats
and production signing intact. Run an Ed25519 + ML-DSA-65 checkpoint
experiment with throwaway keys only, measuring bytes and timing and
testing tampering. Any experimental dependency is isolated from the
Worker and the dependency-free verifier. Production adoption requires
the measured result and a concrete key-provisioning review.

Production follow-through is now specified in
`PQ_PRODUCTION_ROLLOUT_2026-09.md`, revised September 11: one existing
weekly snapshot per checkpoint, external signer and separate verifier,
a dated public-stance amendment, authenticated and Bitcoin-anchored key
declaration, completed checkpoint anchors, measured bounds and custody
rehearsal. The checkpoint uses a distinct Ed25519 key with bidirectional
purpose enforcement; SHA-512 is optional margin. Calendar waits for both
anchor stages are separate from engineering effort. This is a plan;
production signing remains Ed25519.

The next bounded reading is retained in
`../research/qualification-2026-09-11/README.md`: backend vectors, context
interoperability, entropy failure and local resource measurements. It does
not qualify the production checkpoint format or key custody. The next
increment implements a synthetic format and shared purpose guard with
negative controls; `../experiments/pqc/CHECKPOINT_FORMAT.md` records the
remaining production integration boundaries.

## 5. Anchor coverage

Measure the public artifacts that can be read, with a denominator that
names the sample rather than claiming a census. Separate receipt and
report hashes, OTS submission, claimed completion, locally verified proof,
and missing linked evidence. Review the existing cursor/backlog counters
before adding another counter or anchor backend.

## 6. Screening product design

Revised September 11 in `SCREENING_PRODUCT_DESIGN_2026-09.md`: a free
unsigned check beside a paid signed observation of the Chainalysis on-chain
oracle at an exact block. Bind source chain, contract, block number/hash,
raw answer and coverage. The existing `latest` boolean adapter needs a
block-bound evidence path. Unsupported/unavailable results are free failures
with no paid delivery or settlement; no API fallback. The buyer hypothesis
is an operator retaining independent evidence. Source rights, demand, price
and final product copy remain unresolved; no new item is authorized here.
The proposed first block policy is Base `safe` with mandatory EIP-1898,
two matching witnesses, separately budgeted RPC capacity and admission
limits before free reads. Share pure validation/ABI helpers with the gate,
not its provider/retry policy. Historical-state support is a measured
provider prerequisite, not an assumption based on a 128-block window.

## 7. Key-loss and compromise exercise

Use synthetic keys and a fixed clock to rehearse loss, rotation,
untrusted-key substitution and a stolen retired key backdating a record.
Demonstrate separately what a valid signature, a declared service window
and an externally verified timestamp establish. No production rotation,
secret access or claim that a rehearsal verifies operational custody.

## Validation and source discipline

Read register: docs/SPEC_READS.md, September 8. Test new behavior red
before implementation and after restoration. Run typecheck, full tests,
changed package/CLI tests and both Worker bundle checks. Preserve unrelated
untracked buyer-audit work. Public descriptions follow implemented facts;
implementation copy here is reviewable draft copy under house rule 7.

## September 10 — latency and downstream package review

The OpenAPI headroom follow-through preserves the full expanded contract
and inline retry headers, and strengthens the byte-budget test to cover
all payment networks. The package review distinguishes matching published
code, documentation patches, unpublished clients and the third-party
`x402-preflight` name collision. See `OPENAPI_HEADROOM_2026-09.md` for
measurements, limits and pending release checks.


## September 10 — adoption package release follow-through

The previously pending Defects, MCP starter and preflight packages are
published and registry-verified. Preflight installs as `scvd-preflight`;
`x402-preflight/` remains the source directory. Older version and press
rows above belong to their dated readings. Current versions, verified
archives, provenance runs, accurate preview scope and website acceptance
are recorded in `ADOPTION_AND_LATENCY_2026-09.md`.

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
