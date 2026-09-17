# PS1 — verifier result semantics

September 16, 2026. Implementation on `codex/verifier-result-semantics`,
based on `6d29feb54a1d9a30dcf4f94b8aaa44fd9bf06079`. Local worktree:
`/private/tmp/scvd-verifier-result-semantics`. Prepared package version
1.4.0, **unpublished**. Integration, commit and release remain separate.

## Contract and scope

`verifyArtifact`, `verifyReceipt`, and `verifyOffer` now return stable
`status` and `reasonCodes` alongside their existing boolean and findings.
Required failures take precedence: invalid, unsupported, inconclusive,
valid. Checks retain `ok` and `detail`, with a status and optional reason
code. A signature that could not be checked is unobserved, never a
successful or failed cryptographic observation. Expiry remains advisory.

The accepted format stays compact JWS with EdDSA/Ed25519. This pass adds no
signature algorithm or envelope support and changes no signed artifact
format. The existing local revision-1 schema checks remain deliberately
limited: field presence, version, and timestamp types. They still require
offer `validUntil`, although the upstream specification now makes that
optional. Full current-spec conformance is not claimed. Numeric future
revisions are unsupported; independently demonstrated failures still win.

Resource authorization, historical key service, freshness, settlement,
delivery and permission to spend remain distinct claims. The package
README and declarations describe the new contract and its migration.

## Outcome and dependency inventory

| Boundary | Result |
| --- | --- |
| Parse, absent input, primitive/array JSON | Invalid / malformed input; no accidental property-access exception. |
| Labelled object envelope | Unsupported format, including JWS wrapper objects. No new accepted input shape. |
| Algorithm / schema revision | Missing algorithm is malformed; unimplemented algorithms and future revisions are unsupported. Ed25519 is never run as another algorithm. |
| Local schema | Invalid when a known required field/type/version check fails, even if another check is unsupported. |
| Caller key | Valid 32-byte Ed25519 key proceeds; malformed key is inconclusive and never silently replaced by a network key. |
| DID resolution | Unsupported methods remain unsupported; malformed did:web URL/escape becomes an invalid identifier report. |
| Fetch / HTTP / missing selected key | Inconclusive. A current document's absence cannot disprove a historical key. Caller-selected URL is fetched once, without fallback to the artifact's origin. |
| Key document | Bad JSON, wrong shape, malformed supported key, or duplicate selected IDs are inconclusive. An unsupported key representation is unsupported. |
| Crypto | Wrong signature length is invalid. A real false result is invalid. Missing crypto or NotSupportedError is unsupported; other exceptions/nonboolean returns are inconclusive. Provider exception text is not copied into reports. |
| Expiry | Expired remains advisory. Unknown expiry is unobserved, not labelled expired. Clocks are supplied in time-sensitive tests. |
| Summary | Individual findings and reasons survive aggregation. Unsupported/inconclusive human summaries are distinct from rejection. |

The low-level `verifyEd25519` helper keeps its legacy contract: a boolean,
with an exception when neither WebCrypto nor a custom verifier exists.
It cannot express the artifact APIs' distinctions. Optional history and service-window helpers keep their
separate contracts; PS1 does not make them required artifact checks.

## Consumers checked

| Consumer | Compatibility boundary |
| --- | --- |
| `src/services/conformance.ts` | Keeps its own hosted versioned verdict, guarded key resolution, and legacy boolean mapping. Its findings pass through the new per-check fields, but it does not expose the package's new aggregate contract. |
| `src/services/offer-authenticity.ts` | Keeps its algorithm gating and reads the named signature check separately from schema. Existing decisions qualified by its regression suite. |
| `src/services/preflight.ts` | Uses `parseJws`; malformed JSON bodies now report parse failure. |
| `verifier/evidence-bundle.js` and `evidence-cli.mjs` | Keep the boolean crypto helper and their separate bundle verdict/exit codes. These APIs do not gain the four-state result contract in PS1. |
| `src/routes/verify.ts`, CLI, browser/till consumers | Key-history helpers, retained-evidence reading or served library use; no new network dependency or history requirement. |
| `x402-sign` and conformance vectors | Existing signing interoperation and fixture boolean outcomes retained. |
| External TypeScript consumer | Packed package installed outside the repository; exhaustive status switch and reason-code types checked against shipped declarations. |

Additive fields do not require existing callers to change their boolean
decisions. Consumers constructing typed result objects must supply the new
required fields. Malformed/ambiguous-key edge cases may become more
conservative. No previously false result is intentionally promoted to
valid. Optional history availability does not invalidate signature scope.

## Baseline and qualification

The [retained baseline](../research/verifier-ps1-2026-09-16/baseline.json)
uses a standalone install of the original 1.3.0 tarball. Its integrity
matched npm's published 1.3.0 integrity on September 16. Four controlled
cases showed the existing true/false behavior and absence of machine-readable
outcome classification. This measures API behavior, **not human or agent
activation, organic adoption, or offline retention**. PS3 still owns the
fresh-reader activation comparison.

`verifier/result-semantics.test.mjs` exercises every new reason and state,
mixed-outcome precedence, real signature/wrong-key controls, provider errors,
and network absence. The final suite fails on the original source and passes
on the implementation. No test requires a live issuer. The retained
[consumer](../research/verifier-ps1-2026-09-16/consumer.mts) compiles and runs
against a packed install outside repository aliases and Worker ambient types.

Locally qualified; final results and source/package hashes are retained in
[verification.json](../research/verifier-ps1-2026-09-16/verification.json).

| Check | Recorded result |
| --- | --- |
| Full repository run | 748 files passed; 14,522 tests passed; 1 skipped. No tests disabled by this change. |
| Final direct-caller suite | 8 files, 119 tests passed. |
| New regression cases | 39 passed; all 39 fail on the original source. |
| Evidence/export/retained-reading suites | 96 tests passed. |
| TypeScript, bundle dry runs, standalone packed consumer | Passed. |

The full run began before the final guard preserving the raw helper's
missing-WebCrypto exception. The final direct-caller and evidence suites,
packed consumer, typecheck and dry-run builds were rerun after that guard.
The broad run and final targeted qualification are recorded separately;
the record does not claim a second complete repository run on the final
snapshot. No live deployment or package publication was performed.

## Next boundary

PS2 is the independent vector matrix, before wider capability claims.
PS3 owns the larger README activation rewrite and fresh-user/agent tests.
PS4 and later own skill changes, new algorithms, endpoint inspection and
remaining portfolio work. Existing buyer/evidence priorities and MPP work
remain in their own order. This implementation does not publish a package,
deploy the Worker, or send any external message.
