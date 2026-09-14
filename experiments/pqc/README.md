# Checkpoint signature experiment

Local-only, private package. It is outside both Worker import graphs and
the dependency-free `x402-verify` package. No production key is read,
created, migrated or changed.

`envelope.mjs` signs an explicit version, purpose, canonicalization rule,
ordered signer list and an **all signatures required** policy together
with the exact payload string. The verifier receives the expected purpose,
algorithms and trusted keys from its caller. It does not accept a policy
selected by an untrusted artifact. The format uses its own documented
fixed field order, not a claim of RFC 8785 compliance.

The backend-neutral tests exercise policy and dispatch using synthetic
signers. The pilot separately uses real ML-DSA-65 and Ed25519:

```sh
cd experiments/pqc
npm ci --ignore-scripts
npm test
node pilot.mjs create ../../research/verification-2026-09-08/corpus-first.json /tmp/new-pilot
node pilot.mjs verify /tmp/new-pilot.envelope.json /tmp/new-pilot.trust.json
```

Create generates fresh throwaway keys and saves only public keys,
signatures and measurements. Verification works in a second process after
the signer exits. For the saved run, see
`research/verification-2026-09-08/pqc-pilot.result.json`. The payload binds
the captured corpus file's SHA-256; it is not a reissuance of that corpus
or a claim to have restored historical authenticity.

The dependency is exactly pinned with a lockfile. **Its README states
that it has not been independently audited.** FIPS 204 standardization of
ML-DSA does not make this package a FIPS-validated implementation. The
pilot signs and verifies with the same ML-DSA library; cross-implementation
interoperability remains untested. Benchmarks are Node on this laptop,
under concurrent test load, not Workers CPU or request latency.

Production adoption still needs an implementation/supply-chain review,
independent vectors/interoperability, measured external-signer memory and
CPU, key provisioning and recovery, and a separate checkpoint verifier.
The September 11 first scope keeps both Workers free of PQ code; see
`../../docs/PQ_PRODUCTION_ROLLOUT_2026-09.md` for the dated public-statement
revision, trusted key/Bitcoin bindings and proposed signing contract.
That plan chooses a distinct checkpoint Ed25519 key and explicit key-purpose
acceptance tests. SHA-512 is optional; hedged mode is an issuer claim whose
entropy handling is tested at the signer. Engineering effort excludes the
sequential waits for independently verified declaration/checkpoint anchors.
Do not add the experimental dependency to the Worker to make a headline.

## Independent implementation probe — September 10

`node interop.mjs <new-public-result.json>` uses the existing pinned library
and a locally installed OpenSSL with ML-DSA-65 support (`PQC_OPENSSL` can
select an executable). The recorded run used OpenSSL 3.5.1. Each backend
generates disposable keys and the other verifies its Pure ML-DSA signatures,
with both empty and nonempty contexts. Both reject changed message, altered
signature, wrong context and wrong key. OpenSSL process/setup errors fail
the probe instead of counting as a successful refusal. Existing envelope
bytes are the message, but only the ML-DSA leg crosses implementations.

The OpenSSL private key travels through pipes; the JavaScript private key
stays in memory. Temporary files contain public keys, messages and
signatures and are removed in `finally`. Clearing buffers is best effort,
not a memory-erasure guarantee. Result files are exclusively created and
contain public fixtures only. No production key is used.

Recorded result: `research/compact-corpus-packages-2026-09-10/pq-interop.json`.
This closes the original pilot's complete absence of cross-implementation
evidence for these two cases. Full authoritative vectors, implementation
review, production serialization and target-runtime measurements remain
open. It makes no Worker latency, constant-time or FIPS-validation claim.

## NIST vectors — September 10

`node acvp-sample.mjs <vector-directory> <new-public-result.json>` checks
the locally downloaded, SHA-256-pinned files described in `sources.json`.
To reproduce, copy `research/compact-corpus-packages-2026-09-10/pq-acvp-sources.json`
to that directory as `sources.json`, and download each listed URL to its
listed filename. The runner checks every file's length and hash before use.
No NIST code is executed and no network call is made by the runner.

The pinned NIST ACVP-Server commit and all source hashes are in that manifest.
The recorded run matched all 70 selected ML-DSA-65 cases: 25 key generation,
30 external Pure signature-generation cases (deterministic and supplied
randomness), and 15 verification verdicts (three valid, twelve invalid).
Ninety ML-DSA-65 signature-generation and 45 verification cases for prehash
or internal interfaces were excluded; other parameter sets were also
excluded. Both the checks and exclusions are derived from the dataset in
`research/compact-corpus-packages-2026-09-10/pq-acvp.json`. The downloaded
documents' `isSample` field is false; they are public repository vectors,
not an ACVP certification session we submitted or completed.

The runner compares both key bytes and exact expected signature bytes and
requires verification verdicts to match; exceptions do not become passing
invalid-signature cases. Known test seeds and private keys from the public
vectors are solely test inputs. No production key is read or written.
Passing this selected sample is not complete FIPS conformance, a module
validation, an implementation audit or production approval.

## Qualification increment — September 11

`node runtime-qualification.mjs run <new-result.json>` compares three serial,
alternating fresh-process runs of Ed25519 alone and Ed25519 plus ML-DSA-65.
Each records its first operation and 50 warm operations, import duration,
CPU, peak process RSS, sampled memory and signature lengths. This is a
synthetic backend message with the proposed checkpoint context, not a
production checkpoint or a p95 service benchmark. The external runtime
and production byte contract still need qualification.

The entropy subprocess injects a throwing RNG, verifies that normal signing
refuses, and uses deterministic signing as a positive control showing why
verification cannot infer hedging. `npm test` includes a disposable mutated
copy of the candidate with a silent deterministic fallback: the same probe
must go red on the missing expected exception, not on an import/setup error.
No installed dependency or original fixture is edited by that negative test.

The interoperability runner now also checks `scvd.store:corpus-checkpoint:v1`.
The September 10 evidence remains unchanged. New results, limits, provider
research and next gates are in `research/qualification-2026-09-11/README.md`.
This increment uses the same pinned experimental dependency; it adds no
production dependency or package release.

## Synthetic checkpoint contract

`checkpoint.mjs` implements the draft fixed-order envelope, exact byte and
metadata bindings, both required signatures and a separate three-key trust
document. Its shared purpose guard also exercises an artifact-signature
acceptance seam; no production verifier is patched by this experiment.
`CHECKPOINT_FORMAT.md` specifies parsing, encoding, limits and open boundaries.

`npm test` includes the checkpoint suite and a retained public fixture.
Valid signatures made with the wrong-purpose keys must fail in both
directions. Both assertions go red against a disposable copy with that guard
removed. SHA-512 may be null; a present but incorrect digest always fails.
The signer refuses missing entropy, and the verifier explicitly treats
hedging as an issuer claim. The fixture CLI verifies in a separate process
without network access, refuses overwrite, and stores public material only.

## Existing corpus adapter

From the repository root, run:

```sh
node experiments/pqc/corpus-qualification.mjs /tmp/new-corpus-qualification
```

The output directory must not exist. The runner verifies the frozen capture
manifest, original signatures and prefix links through the existing evidence
reader, then checkpoints the latest supplied canonical snapshot with
disposable keys. The originals remain unchanged. Public output is retained
in `research/qualification-2026-09-11/corpus-adapter/`.

`corpus-checkpoint.mjs` also checks caller-supplied historical key windows
and excludes the checkpoint key from artifact history. Tests cover current
and retired keys, inclusive retirement dates, caller mutation, conflicting
canonical bytes and guard-removal negative controls. A claimed in-window
date is not independent time evidence; the adapter verifies no Bitcoin
proofs and does not validate the full nested round schema. See
`CHECKPOINT_FORMAT.md` for the exact scope and remaining production gates.
