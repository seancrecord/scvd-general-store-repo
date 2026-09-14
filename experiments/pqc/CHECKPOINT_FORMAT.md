# Synthetic checkpoint contract, draft v1

This is an implemented qualification format, not a production standard or
release. `checkpoint.mjs` owns the constants, field order and byte limits.
The fixture command emits them as `format.json`; the retained instance is
`research/qualification-2026-09-11/checkpoint-draft/format.json`.
It uses the existing pinned experimental backend, outside both Workers.

## Bytes and parsing

Envelope and trusted declaration inputs are UTF-8 bytes. The decoder rejects
invalid UTF-8. The parser requires exact equality between the original text
and its validated, fixed-order JSON reconstruction before accepting it.
Consequently a BOM, whitespace, trailing newline, duplicate/unknown fields,
reordered fields, alternate number spellings or alternate string escapes
are invalid. This is a narrow fixed-order contract, not RFC 8785 JCS.
The payload is itself a canonical JSON string, with its own equality check.
All bounds apply to bytes, not JavaScript string length.

The message signed by both algorithms is the ASCII string
`SCVD-PQ-CORPUS-CHECKPOINT`, one zero byte, then the UTF-8 fixed-order JSON
object containing the protected header and payload string. ML-DSA uses the
Pure interface and the exact context in `CONTRACT`. All header fields and
payload bindings are covered. Hex encodings are lowercase and exact length;
signature order matches the protected signer order. Both signatures are
mandatory. No omitted/backend-unsupported signature becomes classical success.

SHA-256 binds both the snapshot bytes and the independently supplied trust
declaration bytes. The optional SHA-512 snapshot field is always present:
`null` means omitted margin, while a digest must recompute correctly. Null
is an accepted baseline, not permission to ignore an incorrect digest.
The signer accepts no deterministic-mode or caller-entropy option. Its RNG
failure throws before returning an artifact. Verification cannot establish
whether a valid signature was hedged; it reports that label as an issuer claim.

## Trust and key purpose

The caller supplies a separate canonical trust document. Its qualification
purpose is `synthetic-checkpoint-trust`, deliberately not a production key
announcement. It contains exactly one artifact Ed25519 key, one distinct
checkpoint Ed25519 key, and one checkpoint ML-DSA-65 key, in that order.
Ed25519 public keys use canonical SPKI DER hex, decoded and checked for the
Ed25519 key type; ML-DSA public keys use raw hex of the backend's exact length.
Key IDs must be unique, and the two Ed25519 public keys must differ in bytes.
An alias cannot give one key both roles.

The checkpoint verifier resolves each signed key ID against this supplied
document and requires checkpoint purpose. `verifyArtifactSignature` uses the
same authorization check and requires artifact purpose. Its scope is an
experimental signature-acceptance seam: it does not replace the production
certificate/JWS parser, establish issue time, or modify released verifier
packages. Production integration must enforce these roles at every actual
acceptance entry point and accommodate the existing historical key registry.
This fixed three-key fixture registry does not implement rotation/revocation.

A valid result means both signatures and the stated byte/metadata bindings
pass under the supplied trust. It does not prove that trust is the store's,
verify an OTS proof, confer an issuance date, or approve production use.
The returned fields state those limits. No caller-supplied boolean can turn
`anchoring: not_checked` into a verified result in this prototype.

## Snapshot scope

The prototype receives externally supplied canonical snapshot bytes. It
cross-checks version, positive safe-integer sequence and week against the
signed payload, and rejects noncanonical JSON text or duplicate fields.
Its `scvd-corpus-canonical-input-v1` marker names that input contract; it is
not an independently validated implementation of `canonicalizeCorpusSnapshot`.
The included minimal synthetic snapshot deliberately does not claim to be a
real ward round. The adapter below checks existing canonicalization, prefix
continuity and original signatures. Full nested round schema validation and
an independent parser remain outside this prototype's acceptance claim.

## Existing corpus and historical keys

`corpus-checkpoint.mjs` supplies the production corpus's canonical bytes to
the experimental signer. It reuses `verifier/evidence-bundle.js` for the
existing fixed-order snapshot representation, digest and original signature,
and `checkKeyServiceWindow` for inclusive service-date rules. It requires a
contiguous supplied prefix from genesis. Input records are captured before
the first asynchronous check; conflicting alternate canonical bytes fail.
Bounds come from `CORPUS_QUALIFICATION_LIMITS` and the existing evidence limit.

The caller supplies key history separately. Its current key must match the
artifact key in the trusted declaration; duplicate keys, invalid dates and
any checkpoint Ed25519 key in current or retired artifact history fail.
Historical artifact keys work without re-signing the originals. Checkpoint
key rotation remains unimplemented. The history is not authenticated by
being passed to this adapter, and an in-window claimed signing date is not
independent time evidence: a backdated forgery under a compromised retired
key can still pass those date checks. The tests state and demonstrate this
limit. Original timestamp proofs remain unverified by this run.

`corpus-qualification.mjs` checks the frozen September 9 capture manifest and
the separately captured September 8 public key history, verifies that entire
supplied prefix, and creates a disposable-key checkpoint over its latest
snapshot. It preserves original records and writes public output only.
It performs no live read or Bitcoin verification. This is integration of
existing readers, not an independently authored parser or full nested
WardRound schema/truth validation.

## Reproduction and regression evidence

```sh
npm ci --ignore-scripts --prefix experiments/pqc
npm test --prefix experiments/pqc
node experiments/pqc/checkpoint-cli.mjs create-fixture /tmp/new-checkpoint-fixture
node experiments/pqc/checkpoint-cli.mjs verify /tmp/new-checkpoint-fixture/checkpoint.json /tmp/new-checkpoint-fixture/trust.json /tmp/new-checkpoint-fixture/snapshot.json
```

The fixture directory must not exist. Only public keys, snapshot/checkpoint
bytes and result metadata are written; private keys stay in process memory
with best-effort PQ-buffer clearing. That is not guaranteed memory erasure.
The verifier is offline and performs no network/anchor lookup. Exit status
zero means the bounded checks passed; invalid/missing trust or input yields
one. Usage errors yield two. Existing output is never overwritten.

Tests include valid signatures under wrong-purpose keys in both directions,
key aliases, absent/changed trust, missing PQ signatures, metadata tampering,
snapshot edit-and-rehash, malformed encodings, oversized envelopes and RNG
failure. The same two purpose assertions fail against a disposable module
copy with the purpose guard removed. This is a witnessed negative control;
neither installed dependencies nor the working source is altered by it.

Sources: the current corpus canonicalizer and verification interfaces,
[Node public-key decoding](https://nodejs.org/api/crypto.html#cryptocreatepublickeykey),
and the prior FIPS 204/context qualification record. No independent audit or
production-readiness claim is made by this draft.
