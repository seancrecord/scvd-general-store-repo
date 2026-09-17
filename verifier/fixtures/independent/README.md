# Independent offer and receipt vectors

`matrix.json` is the inventory and expected-results record. Vector counts,
hashes, upstream revisions, generator versions and dependency integrities
come from that file; they are not separately maintained in this prose.
All keys and identities are synthetic, public test material. Never use the
generator's reproducible private scalars for real signatures.

| Family | Independent signing / verification | Package capability | Expected unsupported result |
| --- | --- | --- | --- |
| JWS EdDSA / Ed25519 | noble / Node OpenSSL | Compact JWS; local revision-1 profile | Format-labelled object envelope: `unsupported_format` |
| JWS ES256 / P-256 | noble / Node OpenSSL | Unimplemented | Well-formed compact JWS: `unsupported_algorithm` |
| JWS ES256K / secp256k1 | noble / Node OpenSSL | Unimplemented | Well-formed compact JWS: `unsupported_algorithm` |
| EIP-712 / secp256k1 | viem / ethers 5 with elliptic | Unimplemented | Extension envelope: `unsupported_format` |

All rows have a specification reference and independent vectors. Package
results were exercised on Node 22.13.1 and local workerd 1.20260815.1.
Node/OpenSSL 3.0.15+quic checks the JWS fixtures; ethers 5.8.0 with
elliptic 6.6.1 checks the EIP-712 hashes and recovered addresses. Browser,
Bun, Deno, Node's minimum advertised version, and deployed Workers were
not qualified by this matrix. Local workerd is not a production observation.
The dated qualification record is
`research/verifier-ps2-2026-09-16/verification.json` in the source repository.

Each family has offer and receipt positives plus payload, signature, key,
authority and unavailable-authority controls. JWS adds header tampering,
malformed transport, labelled envelopes and signed field-type controls.
EIP-712 adds domain name/version/chain changes, primary-type separation,
cross-format confusion and zero/empty optional-field defaults. The domain
is the extension's fixed domain, independent of the payment network.

## What each result means

`expectedPackage` describes the existing verifier's bounded result.
`oracle.signature`, `oracle.schema`, `oracle.authorization` and
`oracle.claim` describe separate fixture checks. The schema oracle checks
the exercised field types, presence and revision only; it is not a complete
extension validator. `oracle.claim` combines these bounded checks against
an explicitly supplied synthetic origin-to-key policy. It does not establish
real service authorization, freshness, negotiation matching, historical
authority, settlement, delivery or permission to spend.

The authorization map is a separate test input, not something learned from
the signed payload, header `kid`, a key document, or a recovered address.
A correctly signed artifact checked against the wrong authorized identity
has an invalid fixture claim. Missing authorization evidence is inconclusive.
The package can still say `valid` within its signature/profile scope and
explicitly excludes authorization from what that result establishes.

The matrix preserves two local-profile differences: absent offer expiry is
allowed upstream but rejected by the package; some wrongly typed fields
pass its existing presence checks. Expiry is advisory. Known schema failures
can take precedence over unsupported algorithms. None of those outcomes is
promoted into a full conformance claim.

SCVD's retained conformance fixtures are hashed supplemental issuer cases
within Ed25519. They use a test key, are not live production artifacts, and
do not establish independent conformance.

## Reproduce from the source checkout

```sh
npm run verifier:vectors:check
node --test verifier/independent-vectors.test.mjs
npm test -- test/verifier-independent-vectors.spec.ts
```

The first command installs the separately locked, test-only tools with
install scripts disabled, then regenerates every vector in memory and
compares exact retained bytes. JWS generation uses noble, while its oracle
uses OpenSSL. EIP-712 generation uses viem/noble, while its independent
hash/recovery oracle uses ethers 5/elliptic. Neither generator imports
`x402-sign` or `x402-verify`. The package test then runs the verifier against
those independently checked bytes. EIP-712's independent oracle requires
the tool install; the dependency-free Node tests alone do not execute it.

To intentionally refresh retained vectors after reviewing a source change:

```sh
npm run generate --prefix verifier/vector-tools
npm run verifier:vectors:check
```

Generation checks the signed bytes before writing. The test suite injects
mutations into its own evidence checks, including rehashed corruption,
to demonstrate that bookkeeping alone cannot produce a valid result.
CI and the verifier's manual publish workflow run regeneration as a gate.
The npm tarball includes these fixtures, not the generator or its dependencies.

## Provenance and license

Generated fixture data and generator code are original MIT-licensed work
under the package's `LICENSE`. Each vector references exact sources and its
generator version; shared provenance records upstream commit/file hashes,
RFC revisions, tool integrity hashes, generator/helper hashes and lock hash.
RFC references identify standards; no RFC example text or vectors are copied.
The EIP-712 reference is CC0; the x402 source and test libraries retain their
own licenses. They are referenced or installed as development tools, not
bundled into the zero-dependency verifier. Hashes detect drift against a
reviewed baseline; someone able to rewrite the entire baseline can also
rewrite its hashes.
