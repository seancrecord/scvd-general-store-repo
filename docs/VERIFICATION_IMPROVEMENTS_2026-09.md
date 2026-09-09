# Verification improvements — September 8, 2026

Authorized in this sitting: “okay lets outline a plan then lets do it”.
Initial implementation ran serially on `codex/verification-evidence`.
That initial scope excluded release; the subsequent authorizations and
current status are recorded below.
The feature queue stays in ROADMAP.md; this document is the design and
validation record, not a second queue.

The keeper subsequently confirmed that the competitor in the original
comparison is Rubric. The prior Rubric documentation read therefore
applies directly; the implementation order is unchanged.

## Release follow-through

PR #585 merged as `041df513989980e614ffab8cd89e173507616137` on September 9
UTC. Both Workers deployed and the public developer, verify and sampled /
unsampled payment-challenge checks passed. Those release actions are done.

The keeper subsequently authorized the remaining sequence: independent
Bitcoin verification, verifier publication, corpus coverage and directory
attribution, with documentation updated throughout. Work continues on
`codex/verification-followthrough`; ROADMAP VQ2 tracks it. The September 9
read independently checked the receipt and all six listed corpus proofs
against matching headers from two outside explorers. All six corpus proofs
were available at their calendars while the store still served pending
submissions; a missing hourly corpus upgrade pass is being repaired.
This is outside-header verification, not local Bitcoin consensus validation.
The directory mismatch persists in the refreshed capture. No note was sent.
Details and remaining limits are in the observation record below.

The final follow-through tree passed **603 test files, 8,438 tests and one
existing skip** (801.86 seconds), typecheck, both Worker bundles, 30 Node
evidence tests, five independent Python proof/tamper checks and the
checkout, corrections and claims checks. Regression checks were observed
failing without the relevant fixes. The documentation check retains its
existing dated-document backlog. See
`research/verification-2026-09-09/validation-summary.json`.
Merge, deployment and production proof reads are still to follow.

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
the directory note remains unsent. PQ signing stays experimental.

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
DISTRIBUTION.md. The corpus upgrade repair is the new release in progress.
The directory note still
needs an actual send decision. The PQ candidate
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

## 5. Anchor coverage

Measure the public artifacts that can be read, with a denominator that
names the sample rather than claiming a census. Separate receipt and
report hashes, OTS submission, claimed completion, locally verified proof,
and missing linked evidence. Review the existing cursor/backlog counters
before adding another counter or anchor backend.

## 6. Screening product design

Design an address observation using the existing oracle: block number
and hash, source contract, address, time, raw answer and explicit
unsupported/unavailable results. This step does not create a paid SKU:
the demand tag, price and final product copy remain unresolved. No legal
clearance or safety verdict is derived from a negative oracle response.

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
