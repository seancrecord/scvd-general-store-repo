# Production post-quantum signing plan — September 10, 2026

Status: design for the next implementation, not activated. The keeper
requested the production plan alongside package publication. Production
continues to sign Ed25519. No production key has been accessed, generated,
migrated or changed by this work.

## Recommended first scope

Add a separately addressable, versioned checkpoint over an explicit inventory
of existing corpus bytes. Require Ed25519 AND ML-DSA-65 on the checkpoint.
Keep every original artifact, canonical form, signature and OTS proof intact.
A checkpoint covers only its listed bytes; report absent and unreadable
artifacts, pagination and inventory limits beside that list. A later
checkpoint cannot restore authenticity lost before it was made.

Perform checkpoint signing in a bounded background job, outside checkout,
unpaid 402 construction and ordinary metadata discovery. Publish a completed
checkpoint only after independent verification; expose pending/failed status
without describing it as protected evidence. A sidecar lets existing clients
keep reading the legacy corpus while new clients explicitly opt into the
stronger policy. Per-artifact PQ signing is a subsequent scope decision,
after operational and performance evidence exists.

The checkpoint inventory needs a reviewed digest construction as well as
signatures. The throwaway pilot binds SHA-256 of a captured corpus file;
that is not a decision that every layer meets ML-DSA-65's security target.
Review digest/prehash strength, domain separation and byte encoding before
freezing the production format. Preserve existing SHA-256 anchors as legacy
evidence even if the new inventory adds another digest.

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

[Workers Web Crypto documentation](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/),
read September 10, lists Ed25519 but does not list ML-DSA in its supported
algorithm table. Do not assume native support or infer runtime absence
from that omission: probe the target compatibility date with disposable
keys before choosing a backend. A reviewed isolated signer is an alternative
if the Worker cannot meet the security and resource requirements.

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
2. **Qualify the backend.** Review exact package/source identity, pinned
   transitive dependencies, build provenance, randomness, memory lifetime
   and signing side channels. Record why the selected execution environment
   meets the threat model. Run authoritative known-answer vectors and
   cross-implementation sign/verify in both directions, with malformed-key,
   wrong-context, wrong-message and signature-tampering failures. A passing
   fixture must fail when the relevant protection is removed. Keep the
   experiment's implementation optional until this gate is complete.
3. **Measure the actual runtime.** Use disposable keys on the intended
   Worker compatibility date or isolated signer. Record cold/warm signing
   and verification, CPU, wall time, memory, bundle/startup cost, output bytes,
   concurrency and error counts. Test minimum supported Node and browser
   consumers separately. Compare an unchanged baseline under the same load.
   Set acceptance budgets from these results before activation. Do not
   translate Node pilot timings or fewer downloaded bytes into a p95 claim.
4. **Rehearse operations with synthetic keys.** Define an owner and a
   secure generation/provisioning route, least-privilege signing access,
   encrypted offline recovery, recovery access, rotation, revocation,
   compromise reporting and destruction. Use different key material and
   IDs for each algorithm. Run loss/recovery and compromised-key exercises
   without production secrets. Authenticate the public key registry and
   publish allowed purposes and activation/retirement windows; retain old
   public keys. A self-reported date from a stolen retired key is not a
   trusted timestamp. Independently verified anchoring bounds the evidence
   it actually commits, with its own assumptions stated.
5. **Ship verification before signing.** Add an explicit opt-in checkpoint
   verifier and standalone fixtures, then publish and verify its registry
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
   custody runbook and implementation review. Publish the registry and
   policy before the first opt-in production checkpoint. Independently
   verify that checkpoint and completed anchor before changing trust copy.

## Package and served-surface impact

- **x402-verify:** explicit new checkpoint API/command and fixtures after
  the contract is frozen. Preserve the dependency-free legacy verifier;
  decide and document a separate optional backend/entry point instead of
  silently adding signing-path dependencies. Declare supported algorithms
  and require caller-selected policy. Never infer PQ validity from metadata.
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
history. It must not relax verification policy or silently relabel a hybrid
checkpoint as classical. Legacy checkout remains available under its
existing documented Ed25519 contract.

## Remaining decisions and evidence

The next agent-buildable work is backend qualification, interoperability and
runtime measurements with throwaway keys. The keeper's later decision is
operational custody: where the reviewed signer runs and who can provision,
recover and revoke its keys. Bring a tested runbook and measured options to
that decision; do not request private keys in chat. No activation date,
buyer demand, production p95 or independent audit is established here.
