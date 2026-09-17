# Changelog — x402-verify

Dates, impact, migration. Semantic versions: a minor adds, a major
changes the meaning of an existing export; nothing published is ever
edited in place.

## 1.4.0 — 2026-09-16 (unreleased)

**Developer activation.** A runnable packaged Node example, independent
synthetic receipt and separately supplied test key now lead the README.
One script demonstrates valid, tampered, unsupported and unavailable-key
outcomes. Support/runtime coverage, reason-code next steps and migration
guidance distinguish local tarball qualification from registry availability.
No production verification behavior changes in this documentation step.
The `subtle` TypeScript option now describes only the two Ed25519 operations
called by the verifier, accepting Node's built-in implementation without
requiring unrelated browser key-generation overloads or an unsafe cast.

**Independent evidence.** Added a reproducible fixture matrix for Ed25519,
P-256, secp256k1 JWS and EIP-712, with separate cryptographic implementations,
tamper/authority/domain controls, bounded schema expectations and explicit
unsupported results. Test-only generator dependencies are separately locked
and excluded from the published package. Node and local workerd qualification
does not establish browser, Deno, Bun or deployed-runtime parity.

**Added.** Artifact, offer and receipt results carry `status` and stable
`reasonCodes`; checks carry `status` and an optional `reasonCode`.
`valid`, `invalid`, `unsupported`, and `inconclusive` distinguish demonstrated
failures from unsupported capabilities and missing evidence. Skipped checks
are `unobserved`, never successful signatures. A known required failure takes
precedence over incomplete checks. Expiry remains advisory.

**Migration.** Existing `ok`/`valid`, checks, issuer and scope fields remain;
the new status is `valid` exactly when the retained boolean is true. Existing
supported fixture decisions are unchanged; this is not a claim that every
malformed-input edge case behaves identically. Unsupported algorithms no
longer run Ed25519. Missing crypto and provider exceptions yield structured
reports. The low-level `verifyEd25519` helper retains its legacy missing-runtime
exception and boolean results. A malformed caller
key no longer falls back to network resolution, and duplicate selected key
IDs are inconclusive. TypeScript callers constructing result objects must
include the new fields. Reason codes replace parsing human-readable prose.

This release does not add algorithms, unwrap external envelopes, change
signed records, or broaden the existing local revision-1 schema checks.
The README names their limits, including the required offer expiry, and
separates signature validity from resource authorization, history,
settlement, delivery and permission to spend. Hosted conformance verdicts
and the evidence bundle's separate result format are unchanged.

## 1.3.0 — 2026-09-09

Corpus-v1 snapshot export with digest validation and fixed canonical field
order. Explicit `--max-bytes` / library `maxBytes` option (default unchanged,
hard ceiling 64 MiB), applied to input reads and bundle creation/verification.
Existing receipt exports and the v1 bundle format remain compatible.

## 1.2.0 — 2026-09-08

Portable signed-payload evidence bundles
and the scvd-evidence export/offline verification command. Existing JWS
APIs are unchanged. Timestamp proofs remain independently verifiable OTS
files, never a local Bitcoin verification claim.

## 1.1.0 — 2026-09-03

**Added.** `verifyReceipt({ receipt, issuerKeyUrl })` and
`verifyOffer({ offer, issuerKeyUrl })`: one call, bounded evidence
back — `valid`, `scope` (what valid means, naming the key it was
checked against), `doesNotEstablish` (always stated: merchant
identity, settlement, delivery), `checks`, `issuer`,
`verificationUrl`. The key comes from `issuerKeyUrl` or `publicKey`,
never from the artifact. `DOES_NOT_ESTABLISH` and `VERIFICATION_URL`
exported. Fixtures ship in `fixtures/`: valid and invalid receipts
and offers cut from the published conformance vectors, and an issuer
key document.

**Migration.** None. `verifyArtifact` and every 1.0 export are
unchanged; the front door composes on them.

## 1.0.2 — 2026-08-20

Anchored key history and the service window; README examples.
