# Launch Check: preserve the screen response

September 15, 2026. Released in [PR #700](https://github.com/seancrecord/scvd-general-store-repo/pull/700),
merged as `8483d147`. PR and main CI passed; both Cloudflare builds succeeded.
Public unpaid-offer, missing-record and fixture-index reads passed. A fresh
paid production issuance was not exercised. Earlier qualification below is
retained with its original scope.


## Scope and stopping point

The keeper accepted the smallest complete increment from the screening review:
preserve what the existing payout screen actually observed inside the Launch
Check already delivered. This is a complete feature, not automatic approval for
a standalone screening product or a second observation service.

The existing gate asks its configured RPC ladder for the oracle's `eth_call`
result at `latest`. The first exactly encoded boolean wins, including false.
Only failed or malformed answers lead to another endpoint. True withholds
payment; false permits proceeding; no valid answer withholds payment. Capturing
evidence adds no RPC, block lookup, retry, background task or provider account.

`oracleScreen()` now returns optional evidence alongside the existing `listed`
and `source` fields. Launch Check copies it onto the `screen` stage for both
listed and not-listed observations. That stage already belongs to the core
record, the pre-presentation recovery checkpoint, the evidence hash and the
Ed25519 signature. The existing storage/retrieval and recovery paths retain it.
The successful stage describes a named screen's not-listed response rather than
calling the address cleared.

## Evidence format and limits

`OracleScreenEvidence` in `src/services/launch-check.ts` defines version 1:

- `chain`: the configured oracle chain, derived from `BASE_NETWORK`. This is
  configuration, not a separately checked provider chain identity.
- `contract`, normalized `address`, `method` and `calldata`: the actual call.
- `block_tag: "latest"`, `block_number: null`, `block_hash: null`: the answering
  block was not pinned or retrieved. Null is an explicit gap.
- `provider_host`: the answering endpoint's host, produced by `redactRpc()`;
  URL user information, paths and query strings are not retained.
- `observed_at`: local time when the valid response was read; the oracle helper
  accepts an injected clock for deterministic tests. This is not a chain or
  payment timestamp.
- `result` and `listed`: the accepted ABI boolean bytes and their decoded value.
  The whole RPC body, headers, error text and credentials are not copied.

The observation is inspectable and signature-verifiable. It is not independently
reproducible chain history: the specific block is unknown. A valid signature
authenticates the captured bytes under the stated key, not provider honesty,
chain consensus, the completeness of sanctions lists or general counterparty
clearance. One endpoint's answer is not provider agreement.

Malformed/unavailable reads retain no accepted-response evidence. API-based
screens and legacy implementations can keep returning `{ listed, source }`.
Older records remain byte-for-byte unchanged. Missing evidence establishes no
additional outcome. The existing check URL explains these distinctions outside
the saved signed object.

## Consumers and compatibility

`SanctionsScreen` gains an optional field; bounty, credit and directory-walk
consumers continue to use `listed` and `source`. No acceptance rule changes.
`LaunchCheckStage` gains the optional nested field; there is no new required
top-level field or signature recipe. No battery verdict changes.

The retained-report reader hashes and verifies complete serialized core fields,
including nested stages. The public verifier's `verifyEd25519` primitive verifies
the new and legacy records in tests. Its JWS offer/receipt API is not a new
Launch Check schema validator. The x402-sign offer/receipt package is unchanged.
CLI and Tab have no fixed schema for this nested stage field requiring a release.
No npm version bump or publication is part of this change.

## Acceptance

The regression suite covers both boolean answers, first-answer short-circuiting,
fallback identity, credential redaction, malformed results, unsupported addresses,
unchanged payment decisions and request counts, pre-presentation retention,
recovery, saved-record retrieval, and API/legacy absence. Signature tests delete
and edit evidence, then recompute the evidence hash without replacing the old
signature; every altered artifact must fail verification. The existing paid
HTTP test also checks capture through the default oracle path and retrieval
through the public check URL.

The initial regression run against unchanged source failed five evidence
assertions while eight existing-behavior controls passed. An earlier attempt
could not load main's new rasterizer dependency and ran no tests; it is not
negative-control evidence. Dependencies were then installed from the lockfile.
After implementation, reverting both changed source files made six evidence
assertions fail, including default paid HTTP capture; 46 controls still passed.
Both implementation files were restored automatically.

Final local checks passed: 17 selected Worker test files / 557 tests, root
typecheck, evidence package batches (36 and 12 tests), CLI (30), Tab (101),
documentation check, claims (46 resolved, zero unbound), and both Worker dry-run
bundles. No selected tests were skipped. This was the focused pass; the full
validation below supersedes its outstanding full-suite requirement.
Qualification summary and tested-source/log hashes:
`research/qualification-2026-09-14/launch-check-screen-evidence.json`.

The first Node evidence-package attempt hit two sandbox restrictions opening
local HTTP fixture servers. The unchanged suite passed when granted local-server
permission. This was an environment failure, not a repaired assertion.

Stop after these checks and review. A two-provider pilot needs its own budget
and measured availability. A later safe-block record is a supplementary
observation, not reconstruction of the gate's unknown latest block. Exposure
would require a named recipient, durable delivery, separate signed linkage and
predetermined wording for differing results. None is built by this increment.
The larger screening/backup experiment and PQ activation remain separate.


## Full validation — September 14

The full root suite passed **707 files, 13,904 tests, one existing skip**.
The skip is the pending-wording case in `test/key-continuity.spec.ts`;
no test was newly skipped. All 24 commands from the repository's gate chain
then completed, including Tab, evidence, till, CLI, examples/packages,
door checks, publication/citation/correction tools, dependency audit,
claims, documentation and both Worker dry-run bundles.

The gate chain initially stopped on a pre-existing Node configuration test.
Main commit `2af67d62` deliberately raised the full Worker's CPU allowance
for PNG rendering while the quote-only Worker kept its smaller allowance.
The old test still required identical limits. The same failure reproduced
on unchanged HEAD files. `scripts/doors-config.test.mjs` now checks shared
configuration as before, but checks explicit positive CPU allowances with
the doors allowance no greater than the store's. Non-CPU limits still match.
Five isolated bad-configuration mutations fail this guard. No deployment
setting changed. The corrected door suite passes 52 tests.

The chain resumed at that Node test. The full root suite was not rerun after
the test-only correction; all four feature source/test hashes stayed identical
to the full passing run. The initial two-worker attempt was interrupted to
use six workers and is retained separately as partial evidence. One direct
Node retry lacked localhost-server permission; it passed unchanged with that
permission. Neither attempt is disguised as a completed passing chain.

Full results, command/log hashes, baseline reproduction and negative controls:
[qualification record](../research/qualification-2026-09-14/launch-check-full-gates.json).
No production-latency claim follows from local tests. Capturing and hashing
more bytes has local cost even though this feature adds no network requests.

The branch is ready for commit/review; nothing was committed, pushed, merged
or deployed in this pass. Integrating with a newer main and checking the
resulting deployment remain release steps. Production PQ, standalone
screening and the backup rollout remain parked. Existing tasks **Audit
cold-entry buyer journeys** and **Implement MPP PR 2** own the adjacent
buyer and MPP work; this validation does not complete or duplicate them.


## Release preparation — September 15

The keeper authorized a PR and merge. The validated feature was committed as
`b73ac8f4`, then integrated with main `bf52db66`. The only merge conflict was
the Node CPU-budget test: main had independently repaired it in `007d9d2a`.
The integration keeps main's version unchanged; the earlier local guard and
its negative controls remain historical qualification evidence, not a second
configuration-test change in the PR. No Worker configuration changed.

The runtime feature files merged unchanged. The September 14 full local run
applies to its recorded base; the PR's full CI run must establish the integrated
tree before merge. Production deployment and live reads remain separate checks.

Integrated local checks passed: typecheck, 52 focused Launch Check tests,
the door tests, documentation checks and both Worker dry-run builds.


## Release result — September 15

PR #700 merged at 08:49 UTC as `8483d147`. Its full CI passed 712 root test
files, 14,030 tests, and one existing skip. The subsequent main CI also passed.
Both Cloudflare Worker build checks for that merge succeeded. The public
fixture index returned Worker version `f3f92966-b978-4071-859f-e8b004442363`
with version time 08:49:34 UTC; the unpaid Launch Check door returned 402 and
a missing saved-check ID returned 404. These are deployment and smoke checks,
not a fresh production signing test or a source-to-runtime attestation.

No purchase was submitted for this release check. Reading a stored check ID
through the account API failed with authentication error 10000, so no
before/after comparison of an existing signed record is claimed. The later
account-level deployment read could not proceed after automatic permission
review timed out twice; public reads and GitHub's build checks supplied the
remaining deployment evidence. New capture, signing, tamper detection and
legacy retrieval remain covered by the controlled regression tests.

The bounded feature is complete. The standalone service, two-provider
supplement, backup rollout and production PQ checkpoint are separate
decisions. Release evidence: [release record](../research/qualification-2026-09-14/launch-check-release.json).
