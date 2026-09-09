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
