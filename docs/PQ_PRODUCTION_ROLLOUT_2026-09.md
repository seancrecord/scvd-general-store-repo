# Production post-quantum signing plan — September 10, 2026

Status: design for the next implementation, not activated. The keeper
requested the production plan alongside package publication. Production
continues to sign Ed25519. No production key has been accessed, generated,
migrated or changed by this work.


## September 11 qualification reading

The keeper accepted a bounded qualification increment after this plan.
See `../research/qualification-2026-09-11/README.md` for the disposable-key
results, entropy-failure mutation control, public RPC sample, candidate
provider costs and the gates still open. No production activation or
commercial-provider qualification is inferred from those results.

The following increment implements a synthetic checkpoint contract and
bidirectional key-purpose tests in `experiments/pqc/checkpoint.mjs`.
Its byte rules and limits are in `experiments/pqc/CHECKPOINT_FORMAT.md`;
retained public fixtures include separate-process verification. This is not
the frozen production contract. The next local increment connects the
existing evidence canonicalizer/signature reader and historical-key window
rules through `experiments/pqc/corpus-checkpoint.mjs`. Six frozen corpus
records pass unchanged; synthetic tests also cover retired keys and purpose
separation. Full nested round validation, independently implemented parsing,
backend/custody approval and anchor gates remain open. A date inside a key's
service window is a claimed date, not independently established signing time.
No released artifact verifier or package was changed.

## September 11 revision — first scope and public commitment

This revision incorporates the keeper-supplied review. It is a proposed
qualification scope, not permission to provision keys or activate signing.
The benefit is preserving independently checkable evidence over time;
competitor positioning is not an acceptance criterion or measured ROI.

The first candidate is one **new, opt-in checkpoint artifact per existing
weekly corpus snapshot**, produced by a signer outside Cloudflare Workers.
It binds the exact canonical snapshot bytes and their existing digest;
it does not create another inventory or reissue the original snapshot.
Coverage is that snapshot alone. Detached evidence, earlier snapshots and
unretrieved hash preimages do not acquire direct PQ coverage merely because
the snapshot contains links or a previous SHA-256 digest. Preserve the
original canonical bytes, Ed25519 signature and Bitcoin proof.

Both signatures are required only by the new checkpoint verifier. Every
existing artifact keeps its Ed25519-only verification path and its current
security assumptions. The dependency-free `x402-verify` does not thereby
gain checkpoint verification. Ship a separately installed verifier with its
own reviewed dependencies and explicit unsupported-format handling.

A scheduled external job or an offline signer holds the ML-DSA private key;
neither Worker imports PQ signing or verification code. The request path
only serves completed public artifacts and status. Keep the existing
Ed25519 production seed in its present custody: use a distinct,
checkpoint-only Ed25519 key announced under the current key. Give it a
different key ID and independently enforced purpose. Never solve dual signing
by copying the current production seed into CI. The signing authority must authenticate its input,
not offer a general arbitrary-message signing endpoint.

Before describing qualification or checkpoint production as an adopted
public posture, publish a dated amendment to `POST_QUANTUM` in
`src/store/key-continuity.ts` and its rendered/discovery copies. The current
trigger says "Watching, not building" and waits for a normative x402
extension plus runtime support. Existing local experiments and an external
checkpoint track need an explicit scope distinction; this memo does not
silently supersede that commitment. Retain the old wording in the dated
record. Also reconcile the handover-only migration explanation and any
absolute claims that all issued signatures use Ed25519 at activation.

Proposed public amendment for review, not served text:

> September 11, 2026: Production artifacts continue to use Ed25519. We have
> run local ML-DSA experiments and are considering qualification of a
> separate, externally signed weekly corpus checkpoint with its own
> verifier. This does not change x402 payment signatures or the verification
> contract of existing artifacts. Adopting a new x402 payment-signature
> scheme still requires a normative protocol and a supported implementation.
> A production checkpoint would require reviewed signing and recovery
> procedures, an independently trusted and Bitcoin-anchored key announcement,
> and a completed, independently verified anchor for each checkpoint.

Before publishing that revision, sweep `src/routes/attestation.ts`,
`src/routes/llms.ts`, other consumers of the continuity statements and their
regression tests. Public capability wording must distinguish experiment,
qualification, issued checkpoint and verified anchoring.

## Key trust and Bitcoin commitments

Announce the ML-DSA public key as exact bytes with its encoding, algorithm,
key ID, checkpoint-only purpose, policy/version and activation conditions.
Include the distinct checkpoint Ed25519 public key and its allowed purpose
in the same trusted declaration.
Bind that declaration to the established store identity through an outgoing
key signature while that key is still trusted, and retain/distribute the
trusted declaration independently of the live host. The verifier must be
configured with that trusted declaration or its fingerprint independently
of the checkpoint it is checking.

Enforce separation in both artifact acceptance paths: the checkpoint
verifier refuses the production Ed25519 key, and production-artifact
verification refuses the checkpoint key, even when the signature is
mathematically valid. Compare trusted key material as well as IDs so an
alias cannot bypass the rule. The checkpoint key must never enter the
production-artifact trust registry. Test both substitutions with valid
signatures and otherwise valid documents. A generic `verifyEd25519`
primitive cannot infer a key's authority; preserve its mathematical API,
but require explicit, independently supplied purpose policy in the artifact
acceptance layer. Audit the existing `x402-verify` and store verification
callers before claiming that separation is enforced; this draft adds no
such enforcement to released packages.

Submit the declaration commitment through the existing Bitcoin/OTS
mechanism and independently verify its completed proof before the key's
first production checkpoint. An outgoing Ed25519 signature without this
historical commitment is insufficient against a future forged handover.
An anchored declaration alone is also insufficient: anybody can timestamp
a key claiming to be the store. The previously authenticated identity
binding remains necessary. No timestamp repairs a binding already forged
before the commitment. [OpenTimestamps](https://opentimestamps.org/)
establishes prior existence, not authorship by itself.

After dual signing, commit the exact finalized checkpoint envelope,
including both signatures and its key-declaration reference, through OTS.
The snapshot's existing proof cannot timestamp a later key declaration or
later checkpoint signature. Reuse the submit/upgrade machinery, with new
commitments and independent verification; preserve the original proof.
Expose submitted, pending, failed and verified states distinctly. Only a
completed verified proof supports the Bitcoin-anchored checkpoint claim.

The checkpoint addresses future Ed25519 forgery; SHA-256 is not the reason
for this track. Keep SHA-256 as the baseline snapshot and declaration
commitment. SHA-512 is optional extra margin, not a qualification or
activation gate. Grover's approximate 128-bit bound for SHA-256 concerns
generic preimage search, not a blanket collision-security claim. Document
the residual hash, Bitcoin and timestamp assumptions; neither ML-DSA-65 nor
an extra snapshot digest makes the whole evidence chain category-3 strength.

## Proposed production format and signing choices — not frozen

The production format is distinct from the experimental envelope. Publish
its byte grammar, limits and cross-implementation fixtures before issuance.
The synthetic draft now exercises this structure, with a draft
canonicalization identifier and synthetic-only trust declaration. Its
passing fixtures do not make the production format frozen or qualified.
The proposed fixed field order is:

- Envelope: `protected`, `payload`, `signatures`.
- Protected header: `version`, `purpose`, `canonicalization`, `policy`,
  `signers`, `mldsa_mode`, `signing_variant`, `context`.
- Each signer: `algorithm`, `key_id`; order Ed25519, then ML-DSA-65.
- Payload fields: `corpus_version`, `sequence`, `week`,
  `snapshot_canonicalization`, `canonical_sha256`, `canonical_sha512`,
  `key_announcement_sha256`.
- Each signature: `algorithm`, `key_id`, `signature`, in signer order.

The payload is a fixed-order JSON string, following the existing envelope
shape. Specify UTF-8 bytes, escaping, integer bounds, hexadecimal encoding,
absence of whitespace/BOM/trailing newline and exact lengths in the final
contract. Validate duplicate/unknown fields before parsing loses them.
Canonical snapshot bytes come from `canonicalizeCorpusSnapshot` and the
published corpus contract, not a newly reordered reconstruction.
Keep `canonical_sha512` in the fixed order with explicit `null` when absent;
if present, recompute and verify it. Its absence is valid under the proposed
baseline policy, not an unsigned option or permission to ignore a mismatch.

The proposed signing message is the ASCII prefix
`SCVD-PQ-CORPUS-CHECKPOINT` followed by one zero byte and the UTF-8 encoding
of the fixed-order `protected`/`payload` object. Both signatures cover those
bytes. Require Pure ML-DSA-65 with ASCII context
`scvd.store:corpus-checkpoint:v1`; do not silently substitute HashML-DSA.
These are proposed new format values, not claims about an existing standard.

Choose **hedged signing for production**, with entropy failure refusing
issuance. Deterministic signing remains a test-vector mode; never switch to
it silently. FIPS 204 section 3.4 defines hedged signing as its default and
uses the same verification algorithm for both variants. Hedging does not
produce a verifier-detectable property: `signing_variant` is an authenticated
issuer claim, not proof of the randomness used. Test entropy handling at
the signer, and label this limit in verifier output and documentation.
Hedging does not replace implementation or side-channel review. Persist the first completed
envelope under its input-bound identity so retries reuse it instead of
publishing different randomized signatures as competing checkpoints.

## What the experiment establishes

`experiments/pqc/` has a protected envelope, downgrade/tamper tests, a real
ML-DSA-65 backend and a verifier run in a second process. It uses fresh
throwaway keys and a dependency pinned in its own lockfile. Its output is
retained in `research/verification-2026-09-08/pqc-pilot.result.json`.
The runtime implementation is outside the Worker and public verifier import
graphs. Same-library verification in another process is not independent
implementation interoperability, a key-custody exercise, a security audit or
a Worker latency measurement.

The [FIPS 204 publication page](https://csrc.nist.gov/pubs/fips/204/final)
defines ML-DSA and currently points to potential errata dated July 31, 2026.
Conformance review must include those errata. Implementing the algorithm
does not make our software a FIPS-validated cryptographic module.
The [candidate library's security notes](https://github.com/paulmillr/noble-post-quantum#security),
read September 10, report no independent audit and no constant-time execution
claim. They mention independent vector reproducibility for a different
release; that does not validate our pinned build or our envelope. Production
selection remains open pending review of the exact implementation and its
side-channel threat model.

The September 10 plan contemplated a Worker backend. That is outside
this first scope: qualify the chosen external runtime and signer/verifier
scripts instead. A future in-Worker implementation would be a new review,
not an inference from this external qualification.

A subsequent September 10 probe now verifies the ML-DSA leg in both
directions between the pinned library and OpenSSL 3.5.1, with empty and
nonempty contexts. All sixteen changed-message/signature/context/key
refusals passed. Public fixtures and versions are retained in
`research/compact-corpus-packages-2026-09-10/pq-interop.json`; the reproducible
probe is `experiments/pqc/interop.mjs`. This is two generated cases, not
the full authoritative vectors, independent envelope implementation,
audit or production backend approval. The original pilot limits above
remain accurate for that earlier run.

The pinned candidate also matched 70 selected public NIST ACVP-Server
vectors: key generation, external Pure signature generation and verification.
The runner, commit, source hashes, case IDs and exclusions are retained in
`experiments/pqc/acvp-sample.mjs` and
`research/compact-corpus-packages-2026-09-10/pq-acvp.json`. This adds
authoritative expected-result evidence for the selected API; 135 ML-DSA-65
prehash/internal cases and all other parameter sets remain excluded. It is
not an ACVP certification session or full implementation qualification.

## Build and release gates, in order

0. **Reconcile the public stance.** Publish the reviewed dated amendment
   above before presenting this track as adopted; preserve the historical
   statement and distinguish checkpoint qualification from x402 migration.
1. **Freeze a production wire contract.** Publish exact byte-level
   serialization, UTF-8 byte limits, domain/context separation, digest mode,
   purpose and version. Protect the full signer list, algorithm names,
   key IDs and required-signature policy. Distinguish ordinary ML-DSA from
   any prehash variant; test the actual selected mode. The experimental
   serializer and its string-length bound are not the production spec.
   Reject duplicate/unknown fields, malformed encodings, oversized data,
   reordered or substituted signers and unsupported algorithms. The verifier
   receives its required policy and trusted public keys independently;
   a document cannot grant trust to its own keys or weaken that policy.
   Require bidirectional key-purpose rejection, including valid signatures
   under the wrong-purpose Ed25519 key and alias key IDs.
2. **Qualify the backend.** Review exact package/source identity, pinned
   transitive dependencies, build provenance, randomness, memory lifetime
   and signing side channels. Record why the selected execution environment
   meets the threat model. Run authoritative known-answer vectors and
   cross-implementation sign/verify in both directions, with malformed-key,
   wrong-context, wrong-message and signature-tampering failures. A passing
   fixture must fail when the relevant protection is removed. Keep the
   experiment's implementation optional until this gate is complete.
3. **Measure the actual runtime.** Use disposable keys in the selected
   external signer runtime. Record cold/warm signing
   and verification, CPU, wall time, peak memory, process startup, output
   bytes, concurrency and error counts. Test the separately distributed
   verifier on its declared runtimes. Confirm both Worker import graphs
   remain PQ-free. Compare an unchanged baseline under the same load.
   Set acceptance budgets from these results before activation. Do not
   translate Node pilot timings or fewer downloaded bytes into a p95 claim.
4. **Rehearse operations with synthetic keys.** Define an owner and a
   secure generation/provisioning route, least-privilege signing access,
   encrypted offline recovery, recovery access, rotation, compromise
   reporting, stopping issuance and destruction. Use different key material and
   IDs for each algorithm. Run loss/recovery and compromised-key exercises
   without production secrets. Authenticate the public key registry and
   publish allowed purposes and activation/retirement windows; retain old
   public keys. A self-reported date from a stolen retired key is not a
   trusted timestamp. Independently verified anchoring bounds the evidence
   it actually commits, with its own assumptions stated.
5. **Ship verification before signing.** Add a separately installed
   opt-in checkpoint verifier and standalone fixtures, then verify its release
   artifact/provenance. Existing formats keep their old verification path.
   Required PQ support missing, wrong key, bad signature or unknown policy
   must produce an unsupported/invalid result, never a classical success.
   Show signature validity, checkpoint coverage and timestamp verification
   separately. Exercise old clients against the unchanged legacy corpus.
6. **Canary, then activation.** First sign synthetic/staging checkpoints
   and verify outside the signer. Record restart, retry, timeout and partial
   write behavior. Bind idempotency to the checkpoint's canonical input;
   randomized signatures must not create conflicting published identities.
   Provision production keys only after the owner accepts the concrete
   custody runbook and implementation review. Publish and authenticate the
   key declaration and policy, then verify their completed Bitcoin commitment
   before the first production checkpoint. Independently verify that
   checkpoint and completed anchor before changing trust copy.

## Package and served-surface impact

- **x402-verify:** preserve its existing dependency-free Ed25519 path.
  The new artifact has a separate opt-in verifier and reviewed dependencies;
  encountering a checkpoint through an unsupported reader must not become
  a classical success. Declare the independently supplied trust policy.
  Inspect the artifact acceptance layer and its consumers for key-purpose
  enforcement; preserve the raw signature primitive and legacy wire bytes.
- **x402-sign:** current JWS offers/receipts encode `alg: EdDSA` and sign
  Ed25519 in `signer/x402-sign.js`. Keep those wire contracts. A checkpoint
  signer needs a separate API/format and reviewed dependency boundary;
  substituting ML-DSA inside the existing header would mislabel the bytes.
- **scvd-cli and scvd-corpus-client:** discovery can preserve additional
  metadata unchanged; a new checkpoint fetch/export command must be
  explicit and bounded. Their existing read helpers do not become verifiers.
- **scvd-tab:** preserve current payment and offer verification behavior.
  No checkpoint support is needed for purchasing. Update only if the tab
  actually exposes checkpoint verification, after that feature's review.
- **HTTP, MCP/WebMCP, trust pages and docs:** derive advertised algorithm
  capabilities from shipped support, distinguish legacy/PQ policy and show
  unavailable, failed and incomplete cases. Update OpenAPI and the shared
  catalogs together. No new paid product is implied by the checkpoint.

## Failure and rollback

When required PQ signing or verification fails, publish no successful PQ
checkpoint. Keep an explicit retryable failure and its coverage gap. A
retry cannot alter an already published checkpoint; any correction gets a
new identity and a link to the old one. Rollback stops new checkpoint
issuance while retaining public keys, issued bytes, proofs and revocation
history. Follow the existing dated compromise-notice commitment; a new
revocation-list mechanism would require a separate explicit public revision.
It must not relax verification policy or silently relabel a hybrid
checkpoint as classical. Legacy checkout remains available under its
existing documented Ed25519 contract.

## Remaining decisions and evidence

The next agent-buildable work is backend qualification, interoperability and
runtime measurements with throwaway keys. The keeper's later decision is
operational custody: where the reviewed signer runs and who can provision,
recover and revoke its keys. Bring a tested runbook and measured options to
that decision; do not request private keys in chat. No activation date,
buyer demand, production p95 or independent audit is established here.

## Revised lift and decision boundary

For this external weekly-checkpoint scope, allow roughly 2–4 focused
engineer-days for the remaining qualification report and, if its backend
and custody choices pass, roughly 2–4 additional days for narrow release
wiring and tests. These are planning estimates, not measured throughput,
calendar promises or a security-review quote. The prior 1–3 week integration
range covered the broader runtime/inventory scope and is superseded for
this first version. External review, custody decisions, an unsuitable
backend and Bitcoin confirmation can add time. Moving outside Workers
removes request-path integration, not the supply-chain or key-trust work.

Calendar lead time is separate and sequential: publish/authenticate the
key declaration, wait for its Bitcoin proof to upgrade and pass independent
verification, then issue the first checkpoint. That checkpoint has a second
wait for its own upgraded and independently verified proof before it may
claim anchoring. Later weekly checkpoints each have that second wait.
The [standard OTS client](https://github.com/opentimestamps/opentimestamps-client)
describes confirmation taking a few hours, not a protocol minimum of one
day. Calendar batching, Bitcoin confirmation, local upgrade scheduling and
external verification can extend it. Reserve a next-day review slot for
each stage as an operational planning buffer, not a guaranteed completion
time; never advance on elapsed time alone. Current anchor-log creation has
a daily cadence while pending upgrades run more frequently; qualification
must measure the actual declaration/checkpoint scheduling path. A stored
`complete` status is not independent verification. The engineering estimate
is therefore not a 2–4-day activation window.

Qualification must finish with a tested signer/verifier/format, preserved
legacy behavior, an independently verified synthetic key-declaration and
checkpoint anchor, measured resource bounds and a concrete custody runbook.
Bring those results to the production decision. No revenue ROI is measured.

Sources checked September 11: [FIPS 204 and its errata page](https://csrc.nist.gov/pubs/fips/204/final),
[FIPS 204 sections 3.4–3.6](https://nvlpubs.nist.gov/nistpubs/fips/nist.fips.204.pdf),
[OpenTimestamps](https://opentimestamps.org/), and the current-main sources
`src/store/key-continuity.ts`, `src/services/corpus.ts`,
`src/services/anchor-submit.ts`, `experiments/pqc/envelope.mjs` and the
recorded pilot/interoperability/vector fixtures. The later qualification
increment adds disposable-key experiments and evidence, as linked above;
no production implementation, key, public policy or deployment changed.
