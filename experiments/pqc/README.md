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
independent vectors/interoperability, Workers memory and CPU measurements,
key provisioning and recovery, and a public verifier migration policy.
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
