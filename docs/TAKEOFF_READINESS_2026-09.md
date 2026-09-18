# Takeoff readiness — buyer-first build plan

Decision: September 16, 2026, following the keeper's review of the
Discovery Surface Gap Audit. This is the design and acceptance contract;
[ROADMAP.md](../ROADMAP.md) owns build order and
[KEEPER_LIST.md](../KEEPER_LIST.md) owns decisions and outward submissions.
No implementation, publication, external acceptance or paid test is claimed
by writing this plan.

## Objective and scope

> SCVD is takeoff-ready when an unaffiliated agent can discover it,
> understand when it is useful, connect to it, complete a useful
> verification/evidence task, and independently verify the result—without
> SCVD-specific handholding.

Primary user: an agent checking before spending. Merchant proof follows;
platform embedding follows the merchant flow. Immediate revenue and listing
count do not govern this work. Existing MCP, signing, payment, identity and
evidence engines remain canonical.

Controlled cold-agent runs can establish usability under their recorded
conditions. They are commissioned tests, not organic or unaffiliated
adoption. Record genuine outside completions separately when observed.
Do not turn successful house testing into a claim of outside demand.

The September 16 source comparison used `origin/main` at `834fd186`.
The shared checkout is an older feature branch with substantial unrelated
work; this plan is additive. Implement against current main in an isolated
branch, preserving this checkout. Reconcile intervening releases before
each build; named older defects are candidates for reproduction, not
assumed present in production.

## First release: one task, two environments, two discovery lanes

The canonical task is evaluating a nominated public merchant endpoint
before spending and retaining defensible evidence for that decision.
The buyer must discover a suitable instrument, use the free check first,
interpret its scope, and acquire relevant verifiable evidence if needed.
The task prompt names the merchant and business need, not SCVD, a tool
name, a registry result, or a sequence of implementation steps.

Run two distinct classes and never combine their discovery denominators:

- **Unbranded discovery:** a fresh agent receives the task and a normal
  public search/catalogue capability. Retain its actual query, returned
  candidates and selection. If it never finds SCVD, record that outcome;
  do not inject the URL and call it discovery.
- **Directed connection diagnostic:** a fresh agent starts from a real
  public SCVD listing or skill page. This isolates installation and use
  after discovery. It cannot establish unprompted discoverability.

Initial environments: two independently implemented agent hosts, selected
from the user's available supported clients at build time. Use distinct
model families where available; changing models inside one host alone does
not establish host diversity. At least one cohort uses a smaller model.
A third host follows once the first two have complete traces. Record exact
host, model (resolved revision when available), installed dependencies,
tools, prompts, permissions and budgets. An unavailable host is untested,
not a pass or a product defect.

Initial discovery lanes: public intent search and a public MCP/skill
catalogue. Use the same host on both lanes and both hosts on a shared lane
so a host difference is not inseparable from a discovery difference.
GitHub or AGNTCY admission is not required to start; use reachable public
lanes and retain their actual results.

### What a complete trace must establish

1. **Discover:** the initial query and public result explain how SCVD was
   encountered. No repo, inherited conversation, private notes, preloaded
   SCVD skill or store-specific configuration was available initially.
   Knowledge learned from public documentation during the run is allowed.
2. **Understand and connect:** the agent explains why the free instrument
   fits the task and connects using instructions it found publicly. It
   distinguishes free checks, quotes and paid evidence.
3. **Check:** it submits the intended endpoint, reads the actual result,
   and distinguishes payable shape from delivery, uptime or trust. Unknown,
   unsupported and stale observations must remain visible.
4. **Decide:** it may correctly decline the merchant or stop with adequate
   free evidence. A failed preflight is a successful user outcome when
   interpreted correctly. Never require a purchase to manufacture a pass.
5. **Obtain evidence:** retained evidence concerns the requested subject,
   observation and time. An unrelated signed certificate cannot satisfy
   the task. A free preflight JSON response is not automatically a signed
   artifact; record that boundary and follow the published evidence path.
6. **Verify:** verify original signed bytes outside SCVD's online verifier,
   using a documented verifier and public key provenance learned separately
   from the artifact's self-asserted key. A separate recipient sees only
   the public artifact and public documentation and explains subject, date,
   signature, issuer binding, expiry and limitations. Valid signature,
   correct subject and truth of the underlying observation remain distinct.

Use a separate receipt scenario with an authentic retained receipt and
known provenance. It tests receipt interpretation without pretending a new
payment occurred. Include a deliberately altered receipt as a negative
control. If the main task explicitly requests evidence verification,
label it prompted; a separate unprompted variant measures whether the
buyer independently decides to verify. Do not combine those outcomes.

### Paid continuation

Build the first baseline without spending. If suitable signed evidence is
not freely available, record that stage incomplete rather than substituting
unrelated evidence. Prepare a bounded paid continuation using a suitable
live offer, actual inputs, a named rail and the existing buyer journal.
Select by task fit, then price; the cheapest novelty is not a verification
product. The spending ceiling, funded buyer and unresolved-authorisation
reserve must be established before execution. No automatic purchase merely
to seed a directory, and no automated self-purchase heartbeat.

Reuse the buyer benchmark's payment, recovery and chain-reconciliation
evidence. A 402, queued order, mock settlement or online green check cannot
stand in for delivery and independent verification. A customer payment to
the merchant and an evidence purchase from SCVD are separate intents and
separate budget lines.

## TR1 — extend the cold-buyer instrument and capture the baseline

First build, small enough to review on its own. Extend
`scripts/buyer-cold-isolated.mjs`, the snapshot/score scripts and
`scripts/lib/buyer-run-evidence.mjs`; reuse the existing four-wave evidence
format where its meaning fits. Add host adapters only as needed. Do not
create a second payment collector, defect queue or aggregate readiness score.

The current runner supplies SCVD entry URLs, explicitly asks for verification
and stops at a quote. Preserve the September 12 cohort with those limits.
New cohorts need a new schema version and fresh directories. An adapter
cannot preload the store's skill and then claim installation was discovered.

Each stage stores outcome (`pass`, `fail`, `incomplete`, `not_applicable`),
evidence references, timestamps, subject, actual requests and the reason.
Keep discovery misses, installation failures, tool/probe failures,
misinterpretation, payment ambiguity and verification failures separate.
Capture model self-reports as statements, not objective success evidence.
Reviewer judgments cite transcript spans; cryptographic checks and request
outcomes are independently computed.

Persist the planned cohort before execution: host/lane/scenario assignments,
request/time/token budgets, repeat count and allowed tools. Keep every
attempt, including caps and failed runs. Proposed initial acceptance is two
fresh completed attempts per required host/lane cell after repairs, plus
the negative controls. Report fractions and limits, never universal
reliability from a small sample. This threshold is an engineering gate, not
a statistical confidence claim.

Test the scorer with missing transcripts, inherited store context, a
truncated catalogue, a stale observation, a wrong-subject signed artifact,
tampered bytes, an unbound key and a queued-but-undelivered purchase.
Each must prevent the corresponding pass. Keep a correct refusal control
that does pass its safety decision. Change only the failing input in a
control so the test proves the detector ran.

**TR1 done:** instrument controls pass and the first real zero-spend cohort
is retained with reviewed stage outcomes and a concrete failure list. A
red buyer journey can close instrument construction; it cannot establish
takeoff readiness. No intervention mid-run; after a repair, start a fresh
session and preserve the original failure.

## TR2 — A2A correctness on the same evidence task

**Approved September 16:** canonical v1 with a bounded, explicitly
separated 0.3 compatibility path; no new legacy capabilities. The keeper
selected this posture ("latter agreed lets do it"). Existing legacy
semantics remain pinned while the v1 interface becomes canonical.

First slice: pin official definitions and an independent v1 client; retain
failing discovery/request/task/result examples against the current server.
Map version negotiation, method names, message/part representation, task
state, error semantics and capability declarations before choosing the
adapter. Preserve the three existing evidence tasks and their business logic.

The generated validator is also consumed by `src/lib/a2a-instrument.ts`,
which evaluates other agents under a published 0.3 contract. Split or select
versioned validators explicitly; upgrading our server must not silently
redefine the paid repair kit's checks or reinterpret historical findings.
Add coverage for that consumer before replacing the shared constant.

Second slice: version-correct parsers and serializers over those shared
handlers; a canonical card advertising only real A2A bindings. MCP/x402
cross-links stay on their appropriate discovery/identity documents.
Compatibility must not mean a hybrid response that no client fully accepts.
If legacy is retained, pin its regression contract and explicit routing or
negotiation; historical card URL aliases must resolve to documented valid
representations. Unknown versions must refuse intelligibly.

**TR2 done:** a pinned external v1 client discovers the card, performs the
canonical preflight task, retrieves/interprets its task and artifact, and
handles malformed input, unsupported versions, task errors and terminal
state operations correctly. Retained legacy clients pass their own
contract when legacy is selected. The stranger harness gains A2A as a
transport; this is not permission to add conversation, streaming, push or
new business capabilities. Schema acceptance alone is insufficient.

## TR3 — repair measured friction and qualify the buyer flow

One failure family per reviewable change, led by the TR1 transcript or a
reproduced contradiction. Retest the failed cell and a neighboring working
cell, then run the final frozen cohort. Use existing BUY findings when they
describe the same defect; annotate scope and release instead of duplicating
them. Money-integrity defects encountered here take precedence over polish.

- Skill or tool selection failure: repair the canonical description or
  instructions, then its derived surfaces. Wording is still the keeper's
  pen. Check that extension context teaches customers how to use the store
  rather than injecting repository maintenance instructions.
- Installation failure: repair the thin manifest and exercise a fresh
  installation in the affected real host. Generate shared metadata when
  duplication causes drift; ecosystem-specific fields remain deliberate.
- Bazaar omission or contradiction: extend `ourSearchReading()` and its
  shared resource model; menu/OpenAPI/publication inventory supplies the
  expected set. Reuse existing publication discovery work instead of
  inventing a parallel inventory or checker.

The Bazaar observation model separates `declared_locally`,
`externally_catalogued`, `schema_agrees`, `publication_exercised`, and
`checked_at`, with an evidence reference and unknown reason for each.
Key by resource type and operation: HTTP method plus canonical URL, or
server plus MCP tool identity when that resource is intentionally published.
Define equality semantically for relevant input/output/payment fields;
server formatting or optional enrichment is not automatically drift.
A catalogue hit does not prove which submission/payment populated it.
Partial reads and failed probes cannot establish absence or agreement.
Preserve previously signed rounds; new observation fields are additive and
versioned. The admin page, audit and CLI consume the same observations.

**Buyer qualification gate:** the required host/lane cells complete the
task and relevant independent verification without rescue; refusal and
tampering controls behave correctly; each material observed failure is
fixed or remains an explicit failing scope. Free and paid completion are
reported separately. Any required unexercised paid path stays incomplete.
The four-wave all-shelf/multi-rail benchmark remains broader and open; this
bounded gate does not certify every product, rail or third-party host.

## External admission, alongside the serial builds

Preparation may proceed while reviews are pending; publication and messages
remain the keeper's outward act. This plan does not create an automation or
authorize sending correspondence. Build work remains serial.

GitHub package: canonical official-registry identities and versions,
repository, MCP endpoint, a reproducible install/use trace and current
listing terms. Verify the actual current submission route and whether a
request already exists. Record request reference, submission date and
external dependency. Acceptance: an outside catalogue query returns SCVD,
installation works, and any claimed version synchronization is observed.
Do not promise automatic upstream synchronization until verified.

AGNTCY package: generated OASF record and CID, public domain key, existing
local push/sign/name-verification record, documented shared-node permission
failure and a concrete participation request. Acceptance: an independent
peer discovers, retrieves, verifies and dry-runs installation; safe-search
is recorded separately after its scanner actually runs. Routing renewal
uses the existing CID unless content changes. Decide its permitted
publication mechanism and TTL handling before operationalizing it.

Use exact states such as `package prepared`, `submission pending`,
`submitted / external review`, `access granted / publication pending`,
`externally observed`, and `declined`. Do not mark an entire roadmap blocked
because one external admission has not happened. Unknown submission status
is not an instruction to resubmit.

## Surface evidence, without the audit's single score

For each surface maintain three independent evidence dimensions:
**Implemented**, **Externally observed**, **Usable by a stranger**.
Each carries its own verdict, scope, version, date and evidence reference.
The fourth requested dimension, **Unknown/unverified**, is the explicit
list of unanswered checks within those dimensions; it can coexist with
successful implementation or observation. It is not a fourth mutually
exclusive milestone. A new release can leave the old observation true at
its date while making current usability unverified.

Store this in the existing listings/buyer observation records. Render it
on the existing desk/report; do not build another dashboard or registry.
MCP and ERC-8004 receive reconciliation and failure repair, not speculative
new features. Directory exposure and buyer completion retain separate
denominators.

## After the buyer gate

Merchant flow: a merchant supplies an endpoint and obtains a dated account
of whether the tested buyer can use it, with scope, failures and gaps.
Use the same checks and signed artifacts; no blanket sellability warranty.

Platform flow: a separate consumer integrates those evidence primitives,
handles schema/version changes and reproduces verification without private
SCVD knowledge. Reuse the contract proven above, including failure and
expiry behavior. No parallel product implementation or new approval score.

## Release discipline and first handoff

The first implementation handoff is TR1 only: preserve the old cohort,
version the evidence schema, add cold discovery and host adapters, prove
the scorer's controls, run the bounded unsigned baseline and report the
failures. Paid execution and outward submissions are later concrete acts.

Every behavior repair needs a regression observed failing without the fix.
Before a code commit run typecheck and the full test suite; run build:check
for imports/config/non-TypeScript changes. Deterministic fixture tests
belong in CI; live agents and catalogues produce dated observations and
must not make an offline suite depend on an outside service. Run native
host installation and live independent-client acceptance where needed.
No commit, merge or deployment is authorized by this planning turn.

Primary-source reads and limitations are recorded in
[SPEC_READS.md](SPEC_READS.md#2026-09-16--takeoff-readiness-plan).
The attached audit supplies hypotheses, not instructions to execute its
backlog. The keeper's subsequent decisions govern this plan.

## September 16 implementation record — TR1

The isolated `codex/takeoff-cold-buyers` branch implements the schema-2
runner and evidence scorer. See the [run guide](../research/BUYER_COLD.md)
and [first baseline](../research/takeoff-readiness-2026-09-16/REPORT.md).
The collector can be usable while the buyer journey remains incomplete.
This dated record does not mark TR2/TR3 or paid acceptance complete.

## September 17 release authorization

The keeper authorized merging the prepared work, followed by live buyer and
evidence-handoff qualification and reconciliation of admission requests. Required
checks still gate each merge. This does not authorize payments, directory-key
use, or outbound admission messages. The September 16 observations retain their
original scope; release alone cannot turn them into a successful buyer journey.
