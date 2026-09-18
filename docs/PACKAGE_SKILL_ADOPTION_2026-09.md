# Package and skill adoption pass

Decision: September 16, 2026, following the portfolio audit discussion.
The keeper selected developers integrating verification as this pass's first
audience, and a bounded sequence following current priority work.
[ROADMAP.md](../ROADMAP.md) owns order and status; this document defines the
builds and their acceptance. It is not another queue. Nothing here claims
implementation, publication, outside adoption or a completed evaluation.

## Goal and fit

A developer with an x402 offer or receipt can install the verifier, obtain
a correct, bounded result, handle unsupported or inconclusive cases, and
use that result in an application without understanding SCVD's internals.
The second workflow is an agent inspecting an endpoint before spending.

This pass preserves the current NOW order, including TR1–TR3, evidence
coverage, buyer-readability repairs, deployment checks and active V3 work.
The buyer-first takeoff objective remains the store-wide objective;
developer-first is the audience order within this package pass. Reuse the
[takeoff acceptance instrument](TAKEOFF_READINESS_2026-09.md) where useful,
but keep package activation distinct from unprompted discovery and paid
buyer completion. Serial builds, one reviewable change at a time.

Keep the existing public package boundaries. Do not require all packages
to release together, change the store's category, or add a public shared
core. Preserve the issuer/verifier implementation boundary.

## Baseline to reconcile at implementation time

These are September 16 local-source observations, not registry or production
qualification. Re-read current main and public package versions before a build;
the shared checkout contains substantial work from other tasks.

- `verifier/`: `verifyArtifact(jws, options)` returns `ok` and checks;
  `verifyReceipt` and `verifyOffer` add `valid`, scope and limits. Ed25519
  support is explicit. Unsupported algorithms and unresolved keys currently
  share false boolean outcomes with failed checks, though prose distinguishes
  reasons. The proposed four-state result is not an existing API.
- `signer/`: Ed25519 JWS issuance. Wider verifier support does not require
  this package to issue every format.
- `x402-preflight/`: the local manifest names **x402-preflight**. The audit's
  **scvd-preflight** spelling is not authority to rename or publish a package.
  Verify the current registry identity before writing install instructions.
- `cli/`: protocol and MPP rendering already exists. Extend the existing
  commands where sufficient; a new `inspect` alias must earn its place.
- `src/routes/mcp.ts` already has modern and legacy paths;
  `mcp-starter/server.mjs` still pins the older handshake revision. Treat
  the latter as a separate compatibility repair, not a hosted rewrite.
- `src/routes/webmcp.ts` derives free tools from the MCP catalog. Preserve
  that relationship instead of introducing a replacement catalog.
- V3 owns the MPP implementation and its local census/passport/surface work.
  PS7 owns only remaining package and distribution deltas. An MPP payment
  pilot or merged purchase-lifecycle foundation was not established by this
  checkout review. Checkout and sessions do not enter this pass by implication.
- `skills/scvd-general-store/SKILL.md` and `registry/clawhub/SKILL.md` are
  existing distribution surfaces. Reconcile their build/publish path before
  choosing the source tree; identical files are not proof of generation.

## Measurement before the first change

Use a small dated record alongside the existing buyer/adoption evidence,
not a new analytics service. Start with verification, then add the skill and
inspection scenarios when their phases begin. For each other package,
record known outside-use evidence or explicitly unknown; do not invent
eight simultaneous evaluation projects.

Every record names package/release or tarball hash, fixture hash, scenario,
host/runtime/model, allowed tools, date, attempted/completed counts, time
to first correct result, errors, intervention and retained evidence paths.
Record the dependency versions actually installed. Failures and capped
runs stay in the denominator. Controlled runs measure usability, not demand.

- **Activation:** correct result and interpretation from a fresh environment.
- **Retention:** observed repeat use only. Offline reuse without voluntary
  evidence remains unknown; do not add tracking to the libraries.
- **Composition:** an appropriate next capability used to solve the task,
  not a forced cross-sell or an extra install counted as success.
- **External proof:** an independently located dependency, citation,
  integration or outside report, with date, URL and precise scope.
- **Paid use:** purchase and repeat purchase stay in existing store records,
  separate from package downloads and controlled purchases.

Freeze scenarios and evaluation budgets before comparing releases. Use
fresh sessions, retain the old run, and keep deterministic fixture checks
in CI separate from dated model/host observations. Establish the first
baseline before PS1; measurement construction must not become a long phase.

## PS1 — verification semantics

**Depends on:** baseline and entry into this lane. **Primary files:**
`verifier/x402-verify.js`, its declarations, package tests and documentation.
Trace all consumers, including the evidence bundle, CLI and hosted
conformance readers, before changing the contract.

Enumerate every return, caught dependency failure and possible throw in
the public verification entry points. Define stable status and reason-code
fields with these meanings:

- `valid`: the checks required by the stated verification scope passed.
- `invalid`: available evidence establishes a specific required check failed.
  Malformed input or schema failure has its own reason; it is not a claim
  that cryptographic verification ran and failed.
- `unsupported`: a required format, algorithm, identity/key method or
  runtime primitive is outside the declared capability envelope.
- `inconclusive`: a supported check could not finish because required key,
  history, network or other evidence was unavailable or ambiguous.

Keep individual findings so the summary cannot hide a demonstrated failure
behind an unrelated unsupported check. Pin aggregation precedence with
mixed-outcome fixtures. An unavailable optional history check does not
invalidate a signature-only result; a caller requiring that history gets
an incomplete required check. Key binding, signature, schema, freshness,
historical authorization and settlement remain separate claims.

Prefer additive status/reason fields on the existing entry points. Preserve
existing booleans, required fields and expiry/advisory behavior; no old
false result becomes true merely because classification improved. If a
compatibility requirement cannot be met, use a versioned API or major
release with migration examples. Do not silently change signed records.

**Acceptance:** each public state and reason has a fixture; unknown
algorithms, unsupported families, missing keys, fetch errors, malformed
input, wrong keys, tampering and expired offers are distinguished; clocks
are injected. Consumers can branch without parsing prose. Existing callers
retain their decisions. Never return a successful signature check when
the check could not run. Prove the regression tests fail without the change.

**Release:** one additive contract release where feasible. Its example
must say that validity within scope does not establish delivery, settlement,
merchant trust or permission to spend. Caller policy still decides action.

## PS2 — independent verification matrix

**Depends on:** PS1. Reuse `verifier/fixtures/` and the conformance suites.
Record exact upstream revision, generator implementation/version, provenance,
license, expected claims and hashes for each vector. Fixture generation may
use independent test dependencies without adding production dependencies.

Cover JWS EdDSA/Ed25519, JWS ES256/P-256, JWS ES256K/secp256k1 and EIP-712
with the appropriate key/identity bindings. A current SCVD artifact is an
issuer case within that matrix, not another signature format. Each row
separates specification availability, independent vector availability,
implemented capability, tested runtime and expected unsupported behavior.
Leave unavailable vectors unqualified rather than filling a checkmark.

Include independent positives and one-change negatives for payload,
signature, key, identity binding and applicable domain separation; add
malformed and cross-format confusion cases. SCVD signer/verifier round
trips may supplement but cannot establish conformance. Evaluate signature,
identity authorization and schema independently so a valid signature from
the wrong authorized identity is never promoted to a valid overall claim.

**Acceptance:** every currently claimed combination has an independently
verified positive and meaningful negative controls. Remaining combinations
return the scoped unsupported result. A reviewer can reproduce the matrix
without trusting `x402-sign`. No new algorithm is implemented in this phase.

## PS3 — developer activation

**Depends on:** PS1–PS2. Lead `verifier/README.md` with one install command,
one runnable example using the actual exported API, a packaged artifact with
independently supplied public-key provenance, and expected structured output.
Add support/runtime matrices, reason-code troubleshooting and migration
guidance. Link the signer, CLI or hosted service only for the next relevant
job. Public wording remains draft until the keeper inks it.

Test the installable tarball in a temporary project outside the monorepo,
without workspace imports. Test the same published version after the
authorized release; tarball success alone is not registry success. Compile
a TypeScript consumer as well as running JavaScript. Runtime promises must
follow exercised environments; do not claim Node, browser, Workers, Bun
or Deno parity from a single Node run.

**Acceptance:** a fresh consumer given only the package README and fixtures
returns the right state/reason/scope for valid, tampered, unsupported and
unavailable-key cases without rescue or monorepo access. Freeze two fresh
attempts per scenario in each of two available independent agent hosts,
including a smaller model where available; retain all attempts. This is a
bounded usability gate, not statistical proof of general reliability.
Record time to correct result; no unsupported arbitrary speed promise.
Missing host/runtime evidence remains untested.

**Release:** verifier documentation, packaged examples and tested support
claims. Other package READMEs receive only necessary routing/link corrections.

## PS4 — one skill with progressive disclosure

**Depends on:** PS3; reuse relevant TR1/TR3 traces and avoid duplicate
skill repairs. Keep one public skill identity initially. The entry file
contains accurate triggers, the task router, appropriate access choices
and safety/spending boundaries. Detail moves into focused references for
verification, inspection, payment debugging, seller/buyer testing, MPP,
transports and the package map. Preserve discoverability of the whole store.

Prefer the existing library/tool/API that fits the environment. Application
integration should route to the library; a host already equipped with the
read-only tool need not install a package just to verify one artifact.
No new script directory unless a concrete task needs executable support.

Generate marketplace payloads from one canonical tree, preserving each
marketplace's required packaging. Verify that references actually arrive
and resolve after installation. Adapt freshness/price/parity guards to
follow the installed reference graph, not just the shortened entry file;
preserve price, cadence, consent and recovery instructions where needed.

**Acceptance:** fresh-host runs compare the old skill, new skill and a
no-skill control on verification, unsupported interpretation, preflight,
payment diagnosis, history retrieval, appropriate free access and MPP
questions. Include unrelated prompts to measure false activation. Separate
metadata-only trigger tests from explicitly invoked task-completion tests.
Capture correct/incorrect/missed triggers, completion, references loaded,
tools selected, bytes/tokens where observable and needless context.
No secret request, unauthorized spend or unsupported-to-valid promotion.
Every named workflow remains reachable; any regression is fixed or held
from release. Split a public skill only after a retained failure shows why.

**Release:** one refactored skill bundle and its generated distributions;
publication remains a separate authorized action.

## PS5 — verifier interoperability, one combination at a time

**Depends on:** PS2 and PS3; normal sequence follows PS4. Select the first
additional matrix row using observed artifacts, current official usage,
integration benefit and implementation risk. Retain the selection evidence.
This phase is one bounded capability addition, not a promise to implement
the entire matrix before PS6 can proceed.

Expose a machine-readable capability inventory tied to the implemented
dispatch and tested combinations. Distinguish package capabilities from
the current runtime's capabilities and the store's checkout networks.
Derive documentation from it. Evaluate the dependency/security cost before
adding crypto libraries; zero dependencies must not motivate home-grown
cryptography. KMS integration is not required for verification.

**Acceptance:** PS2 vectors pass on each advertised runtime, confusion and
tampering tests still fail correctly, legacy cases retain outcomes, and
unsupported combinations remain explicit. Key/network fetches preserve
the relevant existing bounds and untrusted-input protections. Run the
PS3 activation scenario for the new combination. A further combination
gets its own decision and small release.

## PS6 — agent inspection as the second workflow

**Depends on:** PS1, PS3 and PS4. PS5 supplies additional coverage when
available, but completion of every signature format is not a prerequisite.
Use `x402-preflight/`, `cli/`, existing hosted inspection and the canonical
tool catalog. Reuse business semantics and fixtures without collapsing
independent verifier implementations or creating a second preflight engine.

Report observed protocols and terms, structural findings, signature support
and results when checked, freshness, coverage and unperformed payment or
settlement checks. Detection is a set, never forced to one protocol. Define
the CLI exit policy separately from observation states; do not silently
change the existing deploy gate or the x402 meaning of the top-level verdict.

**Acceptance:** x402-only, MPP-only, mixed, unknown, unreachable and
truncated-response fixtures produce correctly scoped answers. The same
recorded evidence agrees across relevant library, CLI, HTTP and tool
surfaces. Absent observations are not claims of protocol absence; unsigned
or unverified evidence cannot be labeled signature-valid. The collector
cannot sign or pay, and the agent correctly explains remaining uncertainty.

## PS7 — MPP portfolio integration

**Depends on:** the relevant V3 implementation being reviewed/qualified and
the inspection contract in PS6. V3 continues in its existing position;
this phase must not make MPP wait behind the package sequence.

At entry, list only remaining deltas across preflight, CLI, installed skill,
MCP/WebMCP where relevant, hosted inspection, corpus/history and READMEs.
Separate built, deployed, published and outside-tested states. Reuse V3's
parsers, batteries and protocol histories. Preserve old x402 verdicts and
signed bytes; missing historical MPP measurements remain unobserved.

**Acceptance:** an MPP-only door can be described correctly without being
called globally broken because it is not x402-ready. Mixed doors retain
both readings and limitations. Relevant surfaces expose the same capabilities
and versioned meanings. No MPP checkout, session handling or automatic
renewal is introduced by a documentation/integration release. Close this
phase without a build if V3/TR3 have already resolved every delta.

## PS8 — signer additions, only with an issuer workflow

**Entry trigger:** a concrete issuer integration needs a supported verifier
combination; PS2/PS5 give it independent qualification. No obligation for
signer/verifier feature symmetry. Add the smallest issuance path or signer
interface that serves the need, keeping private-key handling out of examples
and logs and retaining existing fail-closed schema/amount checks.

**Acceptance:** an independent verifier accepts the produced artifacts,
tampered and wrong-domain/identity cases fail, existing issuance remains
unchanged and the named issuer can complete its task. Otherwise defer.

## PS9 — bounded UCP experiment

**Entry trigger:** PS6/PS7 are usable and a concrete UCP merchant/profile
scenario with retrievable evidence is selected. First re-read current
primary specifications. Limit the experiment to one profile/capability
inspection job, an independently sourced example and malformed/conflicting
controls. Read-only; no merchant checkout or portfolio-wide support claim.

**Acceptance:** retain raw/hashable evidence and source revisions; report
what maps to existing observations and what requires UCP-specific semantics;
exercise coexistence with another protocol where evidence permits. Deliver
a go/defer decision naming consumer value, remaining blind spots and the
appropriate existing owner. A prototype does not add UCP support to
`x402-verify` or authorize another package.

## PS10 — extraction decision

**Entry trigger:** inspect duplication after the x402/MPP work and any UCP
experiment actually completed. A deferred UCP experiment is not a blocker
to a small proven extraction or a decision to extract nothing.

Candidate internal reuse: fetch outcomes, evidence provenance, version
metadata, detection and serialization. Require two concrete consumers with
matching semantics and tests; do not unify signature, authorization,
settlement or retry rules merely because their fields look alike. Keep
unsupported/unobserved/inconclusive distinctions and artifact history intact.

**Acceptance:** either a small internal extraction preserves each consumer's
fixtures, or a written no-extraction decision explains why. Public core
publication requires a separate outside-consumer case. Architectural
tidiness is not a completion requirement.

## Maintenance and release boundaries

The standalone MCP starter receives a bounded modern/legacy compatibility
repair when a reproduced client failure or claimed-support mismatch calls
for it. Reuse the hosted contract and test a real independent client, plus
legacy behavior and unsupported-version refusal. It may take a serial
maintenance slot without waiting for PS8–PS10; it does not reopen hosted MCP.
Tab, corpus client and defects retain their current jobs; update them only
for demonstrated defects or required new fixture/vocabulary coverage.

Each phase is independently reviewable/releasable. PS1–PS4 complete the first
developer milestone. PS5 is a selected interoperability increment. PS6–PS7
complete the second workflow. PS8–PS10 are conditional decisions, not an
automatic expansion commitment. Use acceptance gates instead of a seven-week
promise; estimate each small change after its baseline/reproduction exists.

Before a code commit: typecheck and full tests; add relevant package,
evidence, CLI, Action and skill suites. Run build:check for imports, config
or non-TypeScript modules. Prove behavioral regressions red without the fix
in an isolated checkout so unrelated shared edits are not stashed away.
Use mutation/tamper controls for evidence claims. Freeze clocks on both
sides. Offline CI does not depend on live host or network availability.

At release, reconcile current published versions, changelogs, tarball files,
runtime/support declarations and all affected discovery surfaces. Check
package schema/return-shape compatibility and the complete installed skill
tree. Keeper wording and publication actions go to KEEPER_LIST only when
concrete and reviewable; no build is placed there. No commit, push, deploy,
spending or publication is performed by writing this plan.

## First implementation handoff

When this lane becomes eligible, start PS1 only: reconcile current source
and registry state, retain the minimal activation baseline, enumerate
verifier outcomes and consumers, specify the additive classification and
reason codes, demonstrate failing regression cases, implement and qualify
the contract. Prepare the release notes and migration example. Leave
algorithm expansion, skill restructuring and MPP code for their own builds.

Sources and limits: the keeper's September 16 decisions and supplied audit;
the local files named above; [spec reads](SPEC_READS.md#2026-09-16--package-portfolio-audit-initial-discussion)
and [skill planning read](SPEC_READS.md#2026-09-16--package-and-skill-build-plan).
The audit supplies proposals; the keeper's decisions govern this sequence.
