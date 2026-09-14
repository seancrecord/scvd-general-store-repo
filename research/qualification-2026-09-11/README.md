# Qualification reading — September 11, 2026

Status: a bounded first qualification increment, not production approval.
The keeper accepted the next step after the revised plans. Work remains
in the isolated `codex/pq-screening-plan-refinement` draft; no key custody,
public statement, paid item, package publication or deployment changed.

## PQ result and limits

The pinned experimental library remains @noble/post-quantum 0.7.1.
Exact lockfile versions/integrities and relevant installed-source hashes are
retained in `pq-runtime.json`. Installation used the existing lockfile with
lifecycle scripts disabled. This is integrity evidence, not an independent
audit or publisher-provenance review.

- `pq-acvp.json`: 70 selected NIST cases passed after checking all
  retained input hashes. The 135 ML-DSA-65 cases outside the selected
  external Pure mode remain excluded; other parameter sets are excluded too.
- `pq-interop.json`: 3 contexts crossed OpenSSL and Noble in both
  directions, including the proposed checkpoint context. All
  24 wrong-message/signature/context/key refusals passed. This qualifies the
  ML-DSA leg on generated messages, not an independent checkpoint parser.
- `pq-runtime.json`: three fresh processes per mode, each with 50 warm
  operations. Ed25519 plus ML-DSA warm signing medians were 6.79–7.46 ms;
  verification medians 1.66–1.67 ms. First signing took
  7.47–13.15 ms, and PQ import 7.72–10.37 ms. Peak whole-process
  RSS was 60.02–60.23 MiB. These are this host's measurements,
  not Worker latency, cloud-runtime costs or customer p95. Process wall time
  includes the whole run; it is not a startup measurement.
- An injected entropy failure refused issuance. A disposable candidate
  mutation that silently falls back to deterministic signing makes the
  same probe fail on its expected exception assertion. Both legitimate
  variants verify identically; no verification result proves hedging.

The [candidate's current security statement](https://github.com/paulmillr/noble-post-quantum#security)
still reports no independent audit and no constant-time guarantee. The
installed 0.7.1 README states those same limits. Measured speed does not
resolve that gate. The production byte contract, purpose enforcement in
both artifact acceptance paths, independently reviewed backend/custody,
recovery exercises and synthetic Bitcoin-anchor lifecycle remain open.
No production backend is selected by this report.

## Screening result and cost

`screening-public-rpc.json` preserves the initial sandbox transport failure.
`screening-public-rpc-network.json` is the separate network-enabled run,
completed at 2026-09-11T16:40:27.205Z. It used seven read-only requests and
no authenticated provider keys. Both safe and finalized hash-selected calls
returned the strict zero ABI word for the synthetic zero address; the
unknown block hash returned RPC error -32001. No address-clearance finding
is made. The sampled safe head was 29 blocks behind latest, while finalized
was 547 behind. Both reads were available on this endpoint at that moment.
This neither proves selectors cannot be ignored for known hashes nor
qualifies a commercial provider pair. Known-changing historical-state and
controlled noncanonical-block tests remain necessary.

Two candidate operators have relevant advertised offerings:

- [Alchemy pricing](https://www.alchemy.com/docs/reference/pricing-plans)
  includes archive access and lists PAYG at $0.45 per million compute units
  for the first tier. Its [method schedule](https://www.alchemy.com/docs/reference/compute-unit-costs)
  lists 20 units per block lookup and 26 per eth_call. A conservative witness
  allowance of two block lookups and one call is 66 units: $0.0000297 per
  observation, or $29.70 per million observations for the Alchemy half alone,
  before retries and other costs. The free 30-million-unit allowance is
  account capacity, not a reason to expose the payout budget to this door.
- [Quicknode's Base page](https://www.quicknode.com/chains/base) advertises
  archive state. Its [pricing page](https://www.quicknode.com/pricing)
  lists a one-month trial with 10 million credits and a Build plan at
  $49 monthly (an annual option is advertised separately). Account-level
  credit weights, limits and the actual Base endpoint must be verified
  before quoting the complete two-provider bill. No subscription was bought.

This is a small RPC marginal-cost hypothesis with a possible provider
subscription floor, not a product price or measured ROI. The two-witness
policy needs one independently budgeted endpoint from each operator;
separate keys within the payout account do not establish independence.
The actual product accounts, their EIP-1898 behavior, retention guarantees,
quota separation, admission limits and source/RPC commercial terms have
not been qualified. Neither vendor documentation nor the public sample
closes those gates.

## Next work at the first reading and owner decisions

Agent-buildable next: finalize the synthetic checkpoint byte contract and
bidirectional purpose tests; compare a reviewed native signer option with
the current JavaScript candidate; build fixture-driven screening admission
and consistency checks. These precede any production activation.

Account-specific screening qualification needs a pair of product-only RPC
budgets provisioned through the normal secret configuration, never keys in
chat. PQ activation later needs the concrete custody runbook, implementation
review, dated public amendment and independently verified anchors. Those
are not permissions inferred from this qualification pass.

Reproduction: see `experiments/pqc/README.md` and
`experiments/screening/README.md`. All result files are exclusively created;
earlier September 10 evidence is preserved. New experiment tests include
transport/wrong-chain refusal and an entropy-fallback mutation control.

## Validation

The PQ experiment tests, screening probe fixtures, existing evidence
regressions, TypeScript check, documentation check and claims register pass.
Both Worker dry-run bundles completed; `worker-import-check.json` records
the actual source maps and confirms no PQ/experiment source entered either
bundle. No root dependency or lockfile changed. The full Worker test suite
was not run for this external-experiment increment, and no commit was made.

The first evidence regression run could not open its loopback fixture
server inside the sandbox. The same command passed with loopback access;
this was an execution restriction, not a changed test expectation.
Wrangler also reported that its usual preferences-directory log was not
writable; both bundles nevertheless completed with exit status zero and
their source maps were inspected. Neither diagnostic is hidden as a test pass.


## Subsequent increment — synthetic checkpoint and provider handoff

The prototype now implements the draft envelope and separate trusted-key
document in `experiments/pqc/checkpoint.mjs`, with an offline fixture CLI.
`checkpoint-draft/` retains public bytes, machine-derived field order and
limits, fixture hashes, separate-process verification and validation evidence.
`experiments/pqc/CHECKPOINT_FORMAT.md` specifies the contract and boundaries.

The experiment suite passes 44 tests. Wrong-purpose signatures are
cryptographically valid but refused in both acceptance directions. Removing
the shared purpose guard in a disposable copy makes both original assertions
fail; the mutation cannot pass by failing to load. Other cases exercise
missing PQ signatures, byte/metadata tampering, edit-and-rehash, duplicate
JSON keys, noncanonical encodings, optional SHA-512, RNG failure, retained
fixtures and overwrite refusal. Both Worker bundles remain free of PQ and
experiment imports. Typecheck, docs and claims checks pass; no production
source, package release or key has changed.

This closes the synthetic format/purpose-test increment, not full production
format qualification. The corpus's complete canonicalization/round schema,
original signature and historical key policy still belong to the existing
verifier and need explicit integration. Independently authored parsing,
backend/custody review, recovery and independently verified anchor stages
remain open. The three-key synthetic registry is not a rotation mechanism.

`docs/SCREENING_PROVIDER_SETUP_2026-09.md` now makes the provider handoff
concrete: distinct operator/account budgets, safe-history and selector tests,
explicit admission limits and retained receipts without credentials. No
provider account or subscription was provisioned. The next implementation
work can use fixtures without any credentials sent in chat.

## Subsequent increment — corpus adapter and provider controls

`experiments/pqc/corpus-checkpoint.mjs` connects the existing evidence reader
and historical-key service-window helper to the draft checkpoint format.
`corpus-adapter/result.json` records six frozen corpus snapshots verified
from genesis, their manifest hashes and the separate September 8 key capture.
A disposable-key checkpoint covers the latest canonical snapshot; the
original records remain unchanged. Public checkpoint and trust bytes are
retained beside the result. This was an offline replay, not a fresh census.

The PQ suite now passes 62 tests. New cases cover original signatures, prefix
links, conflicting canonical bytes, caller mutation, current/retired keys,
inclusive retirement dates and checkpoint-key exclusion from edited history.
Removing the window and history-purpose guards in disposable modules makes
the same refusal assertions fail. A backdated signature under a synthetic
retired key demonstrates that an in-window claimed date does not establish
independent signing time. Neither original OTS proofs nor new anchors were
verified; full nested round schema/truth and independent parsing remain open.

`experiments/screening/qualify-provider.mjs` adds six bounded protocol controls
with caller-supplied fixture and transport. The screening suite passes 13
tests, including ignored hash selectors/canonicality, missing positive
controls, unavailable providers, timeout cancellation and report redaction.
Protocol success never promotes a result to product qualification. Hosted
account evidence, independent fixture provenance, Base source/ABI checks,
safe-history policy, fixed-pair agreement, admission/load limits, isolated
quotas and terms remain required. No account was provisioned.

The format, experiment READMEs, provider handoff, rollout plan, roadmap and
related verification/adoption records now describe this increment. Production
source, keys and published npm packages remain unchanged. Backend/custody
review, recovery and independently verified declaration/checkpoint anchors
remain production gates.

## Subsequent increment — two-provider agreement and budget isolation

`experiments/screening/pair-policy.mjs` implements the local fixture policy.
The screening suite now passes 41 tests, including 28 new pair/budget cases.
The retained `screening-pair/validation.json` records source hashes and test
names; the fixture inputs are in the corresponding test file. Both witnesses
start concurrently, but only identical strict booleans with matching bound
metadata can produce an unsigned observation. Missing/contradictory data,
stale blocks, clock reversal and deadlines remain unavailable. No third
provider, retry, signing or settlement path exists in this model.

Both provider allowances are reserved together before any read. Free traffic
leaves paid credits, slots and caller-entry capacity. Failed attempts retain
their charged allowance. Deadline/early failure does not release a slot while
the other adapter still runs, and window rollover preserves active counts.
Removing the agreement or paid-credit guard in a disposable copy causes the
original refusal assertion to fail. All timing tests use injected clocks
and controlled timers rather than elapsed-time performance thresholds.

This does not qualify real accounts, provider safe-block ancestry, source
rights, actual billing or a distributed limiter. The budget is in memory and
single-process; per-observation credits are configured fixture assumptions.
Production must authenticate paid admission, bound caller storage, coordinate
durable reservations, measure every RPC method, and supply qualified adapters
that establish the receipt's claimed metadata. The model deliberately returns
`production_ready: false`. No Worker code, keys, accounts or npm packages
changed; nothing was deployed or committed.

## Subsequent increment — runnable RPC adapter and durable Worker budget

`experiments/screening/worker/` now contains an isolated qualification Worker,
its internal service entrypoint, a bounded HTTPS RPC adapter and a SQLite-backed
Durable Object budget. The public handler returns 404 and all provider/policy
configuration is empty by default. It was not deployed.

The adapter derives Base/oracle details from existing source, walks parent
hashes from the higher safe head to the selected lower head within a configured
bound, requires canonical hash-selected calls and two matching strict booleans,
and caps deadline, method credits and streamed response bytes. Independent
reads run concurrently. It emits unsigned response evidence, not a state proof.

Durable reservations preserve paid credits, slots and caller-entry capacity
under concurrent free load. They survive reconstruction, roll back on failed
writes, deduplicate active/current-window request IDs and release idempotently
after actual completion. Deadlines include admission; late admission starts no
RPC. Lost completion/crash leaves capacity closed, rather than automatically
expiring its lease. Operator-visible reconciliation remains required.

Validation: 34 Workers tests pass against real local SQLite with synthetic
HTTP responses, including proof that both admission and reader clocks are
injected. The 41 preceding Node fixture tests and 33 existing payout tests
pass. Both typechecks, documentation/claims checks and all three dry-run
Worker builds pass. Guard-removal builds make the original disagreement and
paid-reserve assertions fail. `worker-runtime/validation.json` retains source
and log hashes, scope, earlier setup failures and the remaining gates. The
full store suite was not rerun; it remains required before a commit.

This increment extracts only the pure oracle constants/encoding/decoding into
`src/lib/sanctions-oracle.ts`; the payout retry loop remains in place. The
keyless research probe follows that source move. Production bundles contain
no experimental adapter, durable budget or PQ imports; the isolated bundle
contains the reader/budget and no payout ladder/signing path. No npm package
release or production configuration change was made.

The installed runtime supports compatibility dates through August 22, so the
qualification config pins that date after an initial startup refusal. A
prior sandbox run lacked loopback access; an attempted unsupported build
flag was also corrected. Neither failed attempt is counted as validation.
Wrangler dry runs also reported sandbox permission warnings for preference
log files; the corrected builds exited successfully and produced bundles.

Remaining: independently qualified accounts and accurate method weights,
source terms and pricing/demand, paid-tier and caller authorization, reviewed
orphan reconciliation, and signed delivery/retention/settlement integration.
The private service caller is currently trusted to choose the tier; no public
route or production service binding delegates that choice. No authenticated
provider request or cloud failover/recovery claim follows from these tests.

## Subsequent increment — private orphan recovery review

`experiments/screening/worker/RECOVERY.md` documents the implemented operator
protocol. Overview and paginated history expose active reservation age,
window context and recorded decisions without release tokens. Opening a
review durably holds new pair admissions. Recovery checks the exact state
revision and original reservations plus current references for both providers
and the stopped executor, then records the decision and releases only those
slots atomically. Credits and request counts remain charged. Cancellation
resumes admissions without releasing slots; exact retries return the original
result and cannot rewrite a closed case.

The Workers suite now passes 58 tests. New cases cover reconstruction, stale
reviews/evidence, malformed references, normal-completion races, late releases,
legacy unknown ages, retention bounds, no RPC during a hold, and audit-write
rollback. Removing either the revision or evidence-age guard in an isolated
test build makes its original refusal assertion fail. Source and validation
hashes are retained in `orphan-recovery/validation.json`.

Evidence assurance is explicitly `operator_attestation_not_machine_verified`.
References are not fetched/authenticated by this implementation, and a hold
does not kill an already admitted executor. The runbook requires the operator
to establish that it cannot resume and that both providers have no active work
for the reviewed reservations before approving. Operator authentication/UI,
private evidence retention and alerts remain integration gates. No account,
public endpoint, production binding, signed product or automated recovery was
activated. No npm release, commit or push was performed.

## Subsequent increment — private recovery document retention

The isolated Worker now retains bounded, immutable document bytes per recovery
case, computes their SHA-256 digests and checks them against approval. Material
is bound to the exact policy, witness set and original reservation generations.
New uploads invalidate prior review revisions; cancellation keeps all material.
Private reads label content untrusted; summaries and buyer/public surfaces
expose no document content. The runbook is updated in
`../../experiments/screening/worker/RECOVERY.md`.

The final Workers suite passed 90 tests; qualification typecheck, docs/claims
checks and bundle passed. The missing-material refusal was first witnessed
failing against the preceding implementation. Removing the retained-byte
integrity, revision or evidence-age guard in a test build makes its original
refusal assertion fail. Source/check hashes and limits are recorded in
`evidence-retention/validation.json`. Previous receipts retain their original
results; this increment did not rerun the full store, Node or payout suites.

Retention validates document identity and integrity, not external authenticity
or the truth of a termination claim. No real provider evidence was collected.
Operator authentication/UI, alerts, independent backup/retention policy and
account qualification remain open. Normal observation adds no provider call
or evidence write; no production p95 result is claimed. No new dependency,
npm release, commit, push, deployment or public activation occurred.

## Subsequent increment — operator access gateway

An unmounted screening gateway now reuses the store's existing administrator
login. The original gate was extracted into `src/lib/admin-auth.ts` without
authentication-policy changes; the admin router keeps the existing exports.
Actions receive the server's operator identity and require matching origin,
explicit context and bounded JSON uploads. The acknowledgement is never
manufactured by the gateway. Private responses preserve no-store and content
protections, including when a handler returns a raw response.

The final run passed 45 gateway/admin tests and 91 isolated Worker tests,
including authenticated gateway-to-SQLite retention/recovery. Both typechecks,
docs/claims and store/doors/gateway builds passed. Removing authentication or
the byte cap in a test build made the original refusal assertion fail. The
initial no-store tests caught a response-header bug before the correction.
Source/check hashes and import boundaries are in `operator-access/validation.json`.

The gateway is absent from production bundles and no public route is mounted.
The concrete UI, deployed binding/mount, hold/capacity alerts, backup/retention
policy and real-account qualification remain open. The operating contract is
`../../experiments/screening/operator/README.md`. No new dependency, npm release,
commit, push, deployment, account provisioning or live recovery occurred. The
full store suite was not rerun and remains required before committing.

## Subsequent increment — browser recovery review

The unmounted authenticated gateway now serves an operator review UI. It
shows exact reservations/case revisions, reads retained evidence as plain
text, independently checks its digest and requires document selection plus
explicit confirmation. A new reading clears consent. Uncertain responses
pause mutations; inspection enables only an explicit retry of the unchanged
original request. Successful recovery keeps the final case visible after
admissions reopen. Cancellation requires a separate, mutually exclusive
confirmation. No action occurs merely by loading the page or history.

Final checks passed: 20 controller tests loading the served module bytes,
48 gateway/admin tests and 91 isolated Worker tests, both typechecks and all
four bundle checks. Removing the acknowledgement guard or changing a retry
to the latest revision makes the original assertion fail. New final-case
visibility and mutually exclusive confirmation tests were also witnessed red
before their fixes. Documentation/claims and whitespace checks passed.
Source, log and bundle hashes are in `review-ui/validation.json`.

Real Chrome walkthroughs used synthetic loopback data. They exercised evidence
upload/read/selection, literal hostile-looking content, consent clearing and
a lost successful response followed by inspection and exact replay. A final
visual check used a directly seeded synthetic closed case and confirmed that
its receipt expands while upload/decision forms hide. These checks are
separate from authenticated gateway-to-SQLite tests: they do not qualify a
deployed browser login, actual binding, provider evidence or termination.

The UI remains unmounted, uncommitted and undeployed. Deployed UI/binding
qualification, hold/capacity alerts, independent backup/retention policy,
real provider/source accounts and signed delivery remain open. Pending
requests live only in tab memory; the runbook documents that limit. The
production bundles exclude the experimental UI, with no added observation
call or npm verify/sign/CLI/Tab release. No notifications or accounts were
created. The full store suite remains required before committing.

## Subsequent increment — operational attention

Private read-only attention reports now cover admission holds, aging or
unknown-time reservations, paid/free capacity and recovery case storage. The
read projects accounting rollover without writing it and never resets active
leases. It omits tokens, callers, document content and provider configuration.
The private review UI displays a timestamped reading; the separate
`ScreeningMonitor` service has read authority alone.

The unscheduled monitor adapter rejects stale or unavailable readings, uses
fixed alert prose and stable keys, and separates channel submission from
confirmed delivery. A local integration test uses the existing alert channel
with email disabled: repeated conditions update one retained KV row and make
no external request. Initial holds and free-only exhaustion are informational.

Checks passed: 108 isolated Worker tests, 50 gateway/admin tests and 21 browser
module tests, both typechecks and store/doors/reader/gateway/monitor builds.
The new attention assertions failed against the unavailable-only stub before
implementation. Disabling projected rollover or freshness checking makes the
original capacity/stale-reading assertion fail. A synthetic local Chrome
walkthrough shows timestamped conditions as text, zero action requests, and
an unavailable reading when its attention request fails. The source and check
hashes are retained in `operational-attention/validation.json`.

No monitor schedule, live binding, notification, provider request, new npm
release, commit, push or deployment was activated. Last-run receipt retention,
an independent monitor-freshness watchdog and channel delivery still need
integration. Independent export/backup/restore and retention acceptance are
documented in `../../experiments/screening/worker/OPERATIONS.md`; they are not
claimed implemented. The full store suite remains required before committing.

## Subsequent increment — private snapshots and offline restore

A separately bindable backup service now captures a frozen copy of the raw
screening budget, review history, evidence and case-sequence high-water mark.
Capture and staging replacement are atomic; the prior manifest hash is required
for replacement, and repeating a snapshot ID returns its original capture.
Bounded pages remain stable across live completions or review changes. Raw
release tokens/caller counters make this private backup authority stronger
than monitoring or the operator browser, neither of which exposes it.

The offline CLI requires an independently retained manifest hash and creates
a fresh owner-only SQLite archive. Record order, completeness, digests, budget
accounting, held generations and final approval evidence are verified. The
archive has no live budget tables, provider access or activation method. It is
plaintext: encryption, independent destination and key custody remain open.

Final checks passed: 118 real local Workers tests and 14 Node offline tests,
root/Worker/offline typechecks, and store/doors/reader/offline builds. The new
late-window recovery-hold regression failed before fixing an overly strict
accounting-window comparison. A second red-before-fix test prevents SQLite
memory-path syntax from producing a verification receipt without an on-disk
archive; output paths are resolved as filenames. Disabling staged-record integrity or the trusted
manifest comparison makes the original tampering assertion fail. The initial
size test hit the platform's SQL row limit before the format limit; staging
now stores raw columns without double encoding, and the revised test exercises
a reachable format bound. Full-volume runtime qualification remains open.
Source/check hashes and bundle boundaries are in `private-backup/validation.json`.

Node restore tests construct synthetic snapshots using a SQLite adapter; the
separate Worker tests cover actual local Durable Object capture. Node's built-in
SQLite API is experimental in the tested runtime. No real archive, secret,
backup host or external account was used. No dependency, npm release, commit,
push, deployment, notification or schedule was added. See
`../../experiments/screening/backup/README.md` for collection and restore steps.
The full store suite remains required before committing.

## Encrypted backup follow-through — September 11

`encrypted-backup/validation.json` records the external age qualification. The
offline CLI now seals exactly the verified snapshot records, checks ciphertext
readbacks against retained hashes/lengths, and publishes quarantined restores
only after both successful decryption exit and existing record verification.
It refuses wrong keys, altered/truncated/extra ciphertext, wrong trusted hashes,
invalid source records, unqualified versions and existing output paths. A
negative control removes the child-exit guard and makes the original late-failure
assertion fail; the existing trusted-manifest negative control also still fails.

The encryption suite and existing offline suite passed; exact counts, timings,
source/bundle/log hashes and type/build/documentation checks are in the receipt.
The tested age executable came from the checksum-verified public Homebrew bottle
for this host. That is distribution-checksum evidence, not upstream Sigsum
verification or an independent cryptographic audit. The wrapper checks a version,
not executable provenance. No npm dependency was added.

All identities and data were disposable synthetic fixtures. Worker code and
public npm packages were unchanged by this increment, so the prior Workers
qualification was not rerun or counted as new testing. Production store/doors
bundle boundaries remain clear. No full store suite, live collection/transfer,
account, real recovery key, notification, schedule, commit or deployment occurred.
Select the independent destination, real custody and retention before the live
upload/readback/restore drill; see
`../../experiments/screening/backup/ENCRYPTED_CUSTODY.md`.
