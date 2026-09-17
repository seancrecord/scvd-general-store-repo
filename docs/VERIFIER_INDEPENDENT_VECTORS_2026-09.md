# PS2 — independent verifier evidence

Built and locally qualified September 16, 2026, on
`codex/verifier-independent-vectors` in
`/private/tmp/scvd-verifier-independent-vectors`. This worktree contains the
uncommitted PS1 prerequisite copied from `codex/verifier-result-semantics`;
that earlier worktree is preserved. Neither phase is integrated or published.

PS2 adds independently generated offer/receipt evidence and tests, not
production verifier behavior. The implementation and types remain byte-for-byte
equal to the qualified PS1 prerequisite. The prepared package stays unpublished
1.4.0 with zero runtime dependencies. No store deployment or registry action
was performed.

## Evidence added

- `verifier/fixtures/independent/matrix.json`: generated inventory, per-vector
  hashes, exact upstream sources, expected package results and separate
  signature, bounded-schema and supplied-authority findings.
- `verifier/vector-tools/`: a separately locked generator with noble and viem;
  independent verification uses Node/OpenSSL and ethers 5/elliptic. It imports
  neither the store signer nor the verifier being tested.
- `verifier/independent-vectors.test.mjs`: native crypto checks, actual package
  results, independent key-document routing and mutations of the harness itself.
- `test/verifier-independent-vectors.spec.ts`: the same retained fixture cases
  exercised through both public APIs in local workerd.
- CI and the manual verifier publish workflow require reproducible generation.
  The ordinary evidence tests remain dependency-free; the separate generation
  gate installs pinned test dependencies with installation scripts disabled.

The [fixture guide](../verifier/fixtures/independent/README.md) contains the
support/runtime matrix and reproduction commands. Counts and hashes are
derived in the [qualification record](../research/verifier-ps2-2026-09-16/verification.json),
not duplicated here.

## Findings and limits

Independent Ed25519 positives verify in Node and local workerd. Tampering
with signed bytes or the verification key fails. Valid independently generated
P-256, secp256k1 JWS and EIP-712 cases produce scoped unsupported package
results; their independent oracles still verify the cryptography.

The authority policy is a separate synthetic fixture input. Wrong authority
invalidates the fixture's bounded claim even with a valid signature. Missing
authority is inconclusive. Neither a DID key lookup nor a recovered Ethereum
address proves authorization to speak for a service. Package `valid` retains
its narrower signature/local-profile meaning and its explicit exclusions.

Two preserved schema differences are now executable evidence: upstream
optional offer expiry versus the package's required field, and wrongly typed
fields that pass its current presence checks. The independent schema oracle
checks only the fields exercised here. It does not establish complete
conformance, negotiation matching, freshness, settlement or permission to act.
Changing schema semantics needs a separately scoped implementation decision.

The retained SCVD fixtures are identified as synthetic test-key issuer cases
within Ed25519, not an independent format or a live production observation.
No live authorization, historical authority or production-runtime claim was
qualified. Browser, Bun, Deno and minimum-Node coverage remain unmeasured.

## Qualification

The missing-matrix run failed before fixtures were supplied. The workflow
gate assertion failed before CI/publish wiring and passed afterward. More
substantive controls deliberately remove a family or negative case, corrupt
signatures, change authority evidence, lie about schema validity and alter
EIP-712 domains. Recomputed fixture hashes cannot hide those changes from
the independent checks.

The final matrix passes standalone Node tests and local Worker tests alongside
the existing package and stranger-verification tests. The complete Node
evidence suite, CI partition/gate regressions, TypeScript check and real bundle
dry runs pass. A fresh offline temporary project installs the actual tarball,
reads the shipped matrix and exercises every vector plus unavailable-key
classification. The package contains fixtures but no generator dependencies.

This phase did not rerun the entire store Worker suite: no production source
changed after the PS1 prerequisite. PS1's broad suite and final targeted
qualification remain separately recorded; a full store-suite run is still
required before a later commit/integration. Local tarball qualification is
not registry qualification or the independent fresh-reader activation gate.

Current primary-source reading is recorded under “September 16 — PS2
independent verification matrix” in `docs/SPEC_READS.md`. Revisions and source
hashes are retained with the fixture generator. Test tool installation and
spec reading used the network; fixture generation, cryptographic checks and
package execution used synthetic data without contacting a service issuer.

## Next boundary

PS2's local build gate is complete. PS3 is developer activation: a runnable
first example, clear result/scope guidance, clean installed-package consumers,
runtime qualification and the agreed fresh-reader trials. Algorithm additions
remain PS5. Nothing in this record authorizes publication or starts PS3.
