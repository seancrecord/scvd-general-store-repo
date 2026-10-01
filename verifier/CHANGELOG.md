# Changelog — x402-verify

Dates, impact, migration. Semantic versions: a minor adds, a major
changes the meaning of an existing export; nothing published is ever
edited in place.

## 1.10.0 — source prepared 2026-10-01

**Added.** `sources SAVED_JSON [--subject EXACT_URL]` extracts candidate
snapshot links from a saved corpus index or unsigned host history. Host history
requires an exact endpoint, including its query. Index rows name snapshots,
not merchants; the result never establishes subject presence or absence.
It counts malformed, duplicate, unselected and omitted links, preserves
pagination gaps, and binds the reading to the original file hash. Only whole
links fit within the bounded JSON output. No URLs are fetched, no files are
written and no signature, date or issuer claim is authenticated by this command.

Existing export and verification commands, exit meanings and generated reports
are unchanged. Source preparation is not npm publication or buyer acceptance.

## 1.9.0 — source prepared 2026-09-28

**Added.** `verify-source --format markdown --report-out NEW_FILE` saves a
bounded report without overwriting any file. Computed original-file and signed-
message hashes, one-source scope, signed-subject rows and unknown dates remain
explicit. Optional saved HTTP challenge headers supply exact unsigned payment
offers and historical address-digest comparisons; no rail is selected and no
payment is authorized. The store and reader share the same address-digest code.

The default JSON output remains available, with additive digest, snapshot-count
and observation-date fields. Existing signature/binding exit meanings remain.
Source preparation does not establish publication or native buyer reliability.

## 1.8.0 — source prepared 2026-09-28

**Added.** Artifact, offer and receipt APIs accept the x402 JWS extension
wrapper (`format: "jws"`, compact `signature`) with the existing Ed25519
verification and local revision-1 checks. Offer `acceptIndex` is unsigned and
never establishes agreement with payment terms. Separate payloads, malformed
indices, receipt indices and unknown wrapper fields are refused before key
lookup. Wrapper keys never become verification inputs.

Compact-string behavior, algorithms and CLI source formats are unchanged.
Capability inventory and independent matrix describe the additional transport.
No runtime dependency added. Local qualification is recorded separately from
publication and adoption; a version in package.json is not a release receipt.

## 1.7.0 — source prepared 2026-09-19

**Added.** `CAPABILITIES`, the package's machine-readable inventory of what
it dispatches on (formats, kinds, algorithms, key types and sources, DID
methods, schema versions, check names, the unsupported reason codes and the
non-claims), and `runtimeCapabilities(options)`, which proves the current
runtime's Ed25519 on RFC 8032's first test vector rather than declaring it.
`scvd-evidence capabilities` prints both as one JSON document. The inventory
is held to the code and the README by `capabilities.test.mjs`; it names no
payment rail, chain or settlement capability, because a verifier has none.
No verification behavior, result shape, format, limit or exit meaning
changes. A version in package.json is not proof of publication.

## 1.6.0 — source prepared 2026-09-18

`verify-source --subject <exact-endpoint-url>` selects complete exact-URL
corpus-v1 observation rows only after signature verification. It reports signed
claim pointers, observation/packaging dates and output omissions separately;
unsigned history cannot enter this reading. Signature/binding exit meanings
stay unchanged. Check installed `--help` for `--subject`; the committed version
number alone does not establish registry publication.

## 1.5.0 — source prepared 2026-09-17

**Added.** `scvd-evidence verify-source` verifies an already-saved SCVD
certificate response or corpus snapshot offline, with optional local bound
attachments. It reuses the existing bundle verifier in memory and writes no
export files. Its compact findings include the exact source-file SHA-256;
large signed claims stay in the original instead of being repeated on stdout.
Keep the original, source URL, independently established key and attachments
for a recipient. A small result file alone is not an evidence handoff.

Existing `export`, `verify`, library results, formats, limits and exit meanings
remain unchanged. The new command is available from this source; a version
in package.json is not proof of publication. Check installed `--help` before use.

## 1.4.0 — 2026-09-17

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
