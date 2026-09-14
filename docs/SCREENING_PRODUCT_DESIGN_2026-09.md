# Recipient oracle observation — September 11, 2026

Status: revised product design with an isolated, disabled implementation;
no new item or public product endpoint.
The keeper-supplied review narrowed the source, evidence and charging
contract. No price, production launch, source-rights conclusion or paying
buyer is established here.


## September 11 qualification reading

The keeper accepted a bounded qualification increment after this plan.
See `../research/qualification-2026-09-11/README.md` for the disposable-key
results, entropy-failure mutation control, public RPC sample, candidate
provider costs and the gates still open. No production activation or
commercial-provider qualification is inferred from those results.
The concrete account and qualification handoff is
`SCREENING_PROVIDER_SETUP_2026-09.md`. It describes the required isolation,
configuration and evidence; no provider account has been provisioned.

The next local increment implements agreement and budget policy fixtures in
`../experiments/screening/pair-policy.mjs`. Both witnesses must agree; free
traffic preserves paid credit, concurrency and caller-storage capacity.
Timeouts retain slots until adapters finish. These tests run entirely on
synthetic receipts and in-memory counters, not a deployed product reader.
Live safe-block selection/ancestry, actual RPC cost accounting, durable
admission, paid-tier authorization, source rights and delivery/settlement
integration remain open. The record is in
`../research/qualification-2026-09-11/README.md`.

The following increment implements the HTTPS RPC adapter and SQLite-backed
admission in an isolated, disabled Worker; see
`../experiments/screening/worker/README.md`. Local runtime tests cover durable
reservations, fixed safe-block ancestry, method/byte bounds and completion
cleanup. Production still requires account qualification, real method weights,
paid-tier/caller authorization, operator recovery integration, source terms and
signed delivery/settlement integration. Only pure oracle helpers were extracted
from the payout gate; its existing retry behavior is preserved by regression tests.

## Buyer and product boundary

The proposed buyer is an operator retaining an independent observation in
a transaction, audit or compliance file. An agent may make the call on that
operator's behalf. Demand for that paid record remains a hypothesis; a free
oracle lookup alone is not a reason to charge. Record a real use case or an
explicit anticipated-demand case before adding the item. Compare pricing
with existing signed observations and measured cost; do not invent a price
from a competitor's shelf.

Offer a free unsigned check alongside a paid signed observation, using the
same bounded source reader and the same evidence semantics. The paid value
is the portable signed record, provenance and retention. An unsigned result
is not silently promoted into a paid current observation later: either
re-read for the paid request or explicitly retain and label its original
block under an agreed product contract.

The intended successful wording is "listed by this source at this block"
or "not listed by this source at this block." Neither result establishes
identity, fraud risk, all sanctions exposure or legal clearance. Avoid the
labels "not sanctioned," "safe," "approved" and "cleared" in machine
fields, rendered text, examples and metadata. The observation is about the
source's answer, not an endorsement of the address or proof that its data
was current or complete.

## Source and existing seam

`SanctionsScreen`, `oracleScreen` and `chainalysisScreen` in
`src/services/launch-check.ts` provide the existing abstraction, on-chain
reader and API reader. Current callers already fail closed on silence.
Share only pure address validation, calldata construction and strict ABI
decoding, plus the existing deployment constant. Give the product its own
provider selection, retry, deadline and consistency policy; leave existing
payment and payout policy intact. The current gate returns the first valid
boolean and skips silent endpoints. It does not establish agreement across
providers and must not become the product's evidence policy.

The first product reader uses **only the on-chain Chainalysis oracle**.
It must not silently fall back to the public API or another dataset. The
existing Base deployment constant supplies the contract address and source
chain; do not duplicate it manually in product code. Exclude the API until
its applicable commercial-use terms have been established.

The [oracle documentation](https://go.chainalysis.com/chainalysis-oracle-docs.html),
read September 11, permits use without a customer relationship, describes
EVM deployments and a Solidity `address` input, and describes designation
sources including US, EU and UN lists. It does not establish unrestricted
commercial redistribution rights, nor that every deployment implements an
identical source set. Public on-chain access alone is not a complete rights
analysis. Record applicable source/RPC terms and attribution before sale.
This review has not established that the API forbids resale or that the
oracle is free of all applicable restrictions.

Use "Chainalysis on-chain sanctions oracle" as the source name, with its
exact deployment and block. Do not label it OFAC itself or restrict its
provenance to OFAC alone unless the selected deployment's data policy has
been verified to support that narrower description.

## Block-bound read and record

The existing `oracleScreen` calls `eth_call` at `latest` and returns only
`listed` and a source string. That is a useful payment gate, but it cannot
support an artifact claiming a specific block. This requires a new bounded
evidence-producing adapter, not merely renaming the existing result.

1. Validate the input address namespace and requested coverage before paid
   execution. The first source is the existing Base oracle. Record source
   chain separately from any requested recipient network; checkout payment
   rails are not oracle coverage. Non-EVM addresses, including Solana,
   receive `unsupported`. A syntactically valid 20-byte address alone does
   not establish supported recipient-network semantics.
2. Use **Base `safe`** for the first version. Resolve a candidate's number,
   hash and timestamp, and require both selected providers to recognize it
   at or below their safe head on their canonical chain. Head skew is not
   permission to change block mid-observation. Call with the EIP-1898
   selector `{blockHash, requireCanonical: true}`. No number-bound fallback,
   no downgrade to `latest`, and no block fetched after an unpinned call.
   Declare a maximum block age in the versioned policy before release,
   measured against an injected clock in tests. Stale or unverifiable safety
   is unavailable. `safe` is a technical block policy, never an address verdict.
3. RPC retries must preserve the same source chain, contract, calldata and
   block identity. Fail rather than downgrade to latest, change source or
   accept contradictory answers. Preserve strict ABI true/false decoding;
   malformed output is unavailable, never false. Publish the RPC trust
   boundary: a signed observation of a response is not an independently
   verified chain-state proof.
   The proposed first consistency policy requires two separately qualified
   independent providers to return identical strict ABI answers at the same
   block. Fix the witness pair before reading; do not shop for a matching
   majority after a disagreement. A missing, malformed or contradictory
   witness is unavailable. Bounded transport retries stay with that pair
   and block. Provider agreement is still not independent consensus validation.
4. Bind artifact version/purpose, address and namespace, declared coverage,
   oracle chain/contract/method, exact calldata/raw response, decoded result,
   block number/hash/timestamp, confirmation and consistency policy,
   non-secret witness identifiers and observation time.
   A block timestamp and the time our reader ran have different meanings.
   Include provenance and coverage limits, without RPC credentials or
   authenticated URLs. Derive the shape from one schema across HTTP, MCP,
   WebMCP, samples and the verifier.
5. Sign and durably retain the completed observation through the existing
   artifact and recovery machinery. A later block is a new observation;
   retries for the same paid request recover the original record instead
   of silently replacing it with a newer answer. Input identity must bind
   the requested address and coverage, using the established request-body
   idempotency rules.

A later reproduction may require access to historical chain state. State
that dependency; retaining the raw response does not manufacture a storage
proof. A later list update does not alter what the earlier record says.

## Provider qualification, isolation and cost

`safe` trades lower expected state age for exposure to L1 reorganization;
it is not finality. Base documents both tags, but neither a universal
15-minute finality lag nor a safe head always inside 128 blocks is an
acceptance assumption. OP Stack documentation allows substantial safe-head
lag; Geth's state-history behavior depends on storage mode/configuration.
Qualify the actual product providers for the chosen block age and retention
window. `finalized` is a later policy change requiring renewed historical
state qualification and pricing; either tag can need archive-capable service.

Every provider must pass EIP-1898 capability checks with known historical
state that differs from latest, unknown hashes, and a controlled noncanonical
block case. A successful response to a valid hash alone does not prove the
selector or `requireCanonical` was honored. Unsupported or ignored selectors,
pruned state, stale heads and canonicality failures make the read unavailable.
Hash selection pins the queried state and checks canonicality at the read;
it does not prevent a later reorg. No downgrade or number-before/after check
substitutes for that contract.

The September 4 RPC-quota incident in the payout gate makes isolation a
launch prerequisite. Provision product-only RPC capacity with an independent
quota or account budget; another key sharing the payout account's exhausted
quota is not isolation. Never fall back to the payout ladder or its keys.
Put admission limits before any RPC: per-caller throttling plus global free
request, concurrency and provider-cost budgets. Reserve paid capacity within
the product budget and cap paid reads too. Free load must be shed before it
can consume that reserve. An unavailable limiter/budget refuses admission;
an exhausted product budget produces no paid delivery or settlement.

The baseline observation costs two oracle calls plus safe-head and block
identity reads for both witnesses; qualification must measure the exact
request/credit count, bounded retries and retained bytes. Run independent
witness reads concurrently after the block is fixed, within one total
deadline. Cache provider capability metadata, not an old answer advertised
as a new observation. Keep challenge/discovery responses free of RPC work.
Measure availability and latency with the actual isolated providers before
setting a price or promising p95. A free check and subsequent paid re-read
consume separate observation budgets.

Sources checked September 11: [Base RPC tags](https://docs.base.org/base-chain/api-reference/rpc-overview),
[EIP-1898](https://eips.ethereum.org/EIPS/eip-1898),
[OP Stack transaction status](https://docs.optimism.io/app-developers/guides/transactions/statuses)
and [Geth state-history storage](https://geth.ethereum.org/docs/fundamentals/archive).
These describe protocols and implementations, not successful qualification
of any store RPC provider. No authenticated product-provider probe was run
for this documentation revision.

## Charging and failure contract

A successful `listed` or `not_listed` observation is a completed deliverable
under the proposed contract. Whether the address is listed does not change
the price or trigger a transfer to that address.

**Unavailable, unsupported, inconsistent or malformed answers are not paid
deliverables.** Return an explicit free failure, deliver no paid observation
and make no settlement call. Record failed attempts in operational coverage
counters. Do not sell a signed record of silence in this first product.
Failure to sign or durably retain the promised record also withholds
settlement. Preserve deliver-first: if delivery succeeds but settlement
subsequently fails, the store keeps its existing recovery/loss policy.

Building a 402 challenge must not call the oracle. The free-check handler
and the authorized paid handler make bounded reads. Fix the block within
each observation, keep retries within a total deadline, and measure the
block and witness reads rather than claiming the existing boolean call's timing.

## Acceptance and remaining decision

Before sale, fixtures must cover listed/not-listed, unsupported addresses,
wrong chain or contract, malformed ABI, RPC silence, provider disagreement,
block-hash mismatch/reorg, stale-block policy, retry identity and signing/
retention failure. Assert zero settlement calls for every non-deliverable
case. Tamper with each signed binding and require verification to fail.
Test all advertised discovery and reader paths and witness new regression
tests fail before their fixes. No product launch follows from this design.
Also test ignored selectors, historical-state pruning, key/account quota
isolation, and free-load saturation while paid capacity remains reserved.
Assert no screening request can reach a payout provider or bypass admission
on limiter failure. Prove both witnesses are required; a first `false` must
not hide the other witness's `true`, error or silence. Concurrency must not
permit the first completed response to become an early success.

Revised planning allowance: roughly 2–4 focused engineer-days for the
isolated two-provider reader, capability probes, admission budgets and
evidence fixtures, then 2–4 for free/paid delivery, recovery, discovery,
samples, verification and release checks. This supersedes the earlier
1–2-day reader estimate. Provider provisioning, commercial terms, historical
state support and acceptance failures add separate calendar uncertainty.
These are estimates, not a quote or evidence of demand. The next
product decision needs a concrete operator workflow, acceptable source
use, an evidence contract and a price justified by that workflow.

## September 11 — private orphan review implemented

The isolated Worker now supplies overview/history/inspection and a separate
`ScreeningRecovery` operator entrypoint. Opening a review durably holds new
admissions. Commit checks the current revision, exact original reservations,
both witness references, executor-termination reference and evidence times;
it changes slots and the retained audit atomically without refunding credits.
Cancellation and uncertain-response retries are recorded and idempotent.
Normal completions invalidate stale reviews. Read-only output omits release
tokens and does not classify elapsed age as termination.

This records an operator attestation, not independently authenticated provider
evidence. The API does not fetch referenced materials or terminate an executor.
Private bounded evidence retention is implemented in the next increment below.
Authenticated operator UI, backup/retention policy and alerts remain launch work. `../experiments/screening/worker/RECOVERY.md` is the operating contract;
no production binding or recovery action was activated by this implementation.

## September 11 — private recovery document retention implemented

Recovery now requires the reviewed document bytes to be retained privately
before approval. The isolated SQLite store computes their SHA-256 digests,
binds them to the case, policy, witness set and original reservation generations,
and checks integrity, role and timestamp against each approved reference.
References are immutable; refresh uses another bounded reference. New uploads
invalidate old approval revisions without changing credits or slots. Cancelled
cases keep their documents. Content is returned only by a separate private
read and is labeled untrusted; public HTTP and buyer entrypoints expose none.

The implementation checks document identity and integrity, not whether a
provider issued it or whether remote work actually stopped. It adds no external
request or evidence-storage operation to normal observations. Local tamper,
rollback, bound and retry tests do not establish production p95, cloud backup,
provider authenticity or operator authentication. It is operational retention,
not a customer custody product. The operating contract and remaining gates are
in `../experiments/screening/worker/RECOVERY.md`.

## September 11 — operator access gateway locally qualified

The unmounted operator gateway now applies the store's existing admin gate,
including its throttle and failed-login reporting. Operator identity derives
from that gate's username; the client cannot supply it. Actions require a
matching HTTPS origin, explicit action context and bounded JSON uploads.
The gateway does not manufacture the acknowledgement or change a stale
revision. Private responses carry no-store/nosniff/content-policy headers.
Local tests exercise gateway-to-SQLite evidence retention and exact recovery
retries with no credit refund. See `../experiments/screening/operator/README.md`.

This qualifies the access boundary, not a deployed login. The next increment
below supplies local keeper review buttons. Production mounting/binding,
deployed UI qualification, hold/capacity alerts,
independent backup/retention policy and real-account evidence remain open.
No new public product, provider call, npm release or deployment is included.

## September 11 — browser recovery review locally qualified

The unmounted gateway now serves a review UI behind the same administrator
gate. It displays exact targets/revision, reads retained documents as plain
text, verifies their digests, requires deliberate selection and obtains a
separate approval or cancellation decision. Fresh readings clear consent.
An uncertain response pauses mutations; inspection precedes an explicit retry
of the unchanged original operation. Successful recovery retains the final
case on screen. No provider request runs from the browser.

Controller tests and a real Chrome walkthrough against synthetic loopback
data cover the interaction; gateway/SQLite tests cover the private service
separately. This is not a deployed browser-to-binding qualification. Pending
requests live only in tab memory; the operator runbook explains how to inspect
a case if that memory is lost. Mounting/binding, alerts, independent backup,
retention policy and real-account evidence remain launch gates.

## September 11 — operational attention locally implemented

Private timestamped readings now distinguish held admissions, aging or
unknown-time reservations, paid/free capacity and recovery-register limits.
The calculation projects accounting rollover without resetting active slots
or changing stored credits. The UI shows a dated snapshot; a read-only monitor
entrypoint feeds an unscheduled adapter to the existing alert channel. Failed
or stale readings generate a separate unavailable condition. Local tests
exercise shared alert deduplication with email disabled.

No schedule, provider request, deployed binding or notification was activated.
Monitor last-run retention, an independent freshness watchdog and real channel
delivery remain to qualify. Backup/export/restore and retention acceptance are
specified, not implemented, in
`../experiments/screening/worker/OPERATIONS.md`. The new work stays off production
observation and payout paths; verify/sign/CLI/Tab releases remain unnecessary.

## September 11 — private snapshot and offline restore qualification

A separate backup service now captures a consistent frozen copy of screening
budget state, case history and evidence, with bounded pages and a manifest
hash. Raw contents include sensitive release tokens/caller counters, so the
operator browser and monitoring service do not expose it. Replacement affects
only export staging and requires the previous manifest hash.

The offline restore utility verifies exact bytes and linked records against an
independently retained manifest hash, then leaves a quarantined SQLite archive
with no live budget tables or activation method. Local held/recovered cases,
tampering, missing material, retries, rollback and window changes are tested.
Output is owner-only plaintext; encryption, independent storage, authenticated
live collection, maximum-volume qualification and production reconciliation
remain open. See `../experiments/screening/backup/README.md`. No new dependency,
verify/sign/CLI/Tab package release, deployment or real backup transfer occurred.

### September 11 follow-through: encrypted backup qualification

The offline backup tool now seals verified snapshots with an external age
executable, checks downloaded ciphertext against a retained receipt, and opens
archives only after full decryption success and existing record verification.
Disposable hybrid keys and synthetic state exercise tampering, late failures,
wrong keys/hashes and exact quarantined recovery. Production/Worker imports and
verify/sign/CLI/Tab packages are unchanged. This adds an external host tool, not
an npm dependency or a public post-quantum signing claim.

Independent destination, real recovery-key custody, retention, authenticated
collection/transfer and a live restore drill remain open. Private scratch and
restored SQLite files are plaintext; use an encrypted private host volume.
The keeper choices and exact qualification boundary are in
`../experiments/screening/backup/ENCRYPTED_CUSTODY.md`. No real key, transfer,
account, deployment or schedule was created.

### September 13 — backup custody progress

The private Backblaze destination and dedicated recovery key now exist, and the
keeper-retrieved key copy passed local held/recovered synthetic restores after
formatting cleanup. One encrypted synthetic sample has now been uploaded; its
console SHA-1 matches the source ciphertext. The console refuses SSE-B2 download,
so API readback and remote recovery remain pending. A one-day Read Only key form
restricted to the sample bucket/filename prefix is prepared but not submitted.
No operational-state transfer, retention policy or automatic backup is active.
Current evidence: `../research/qualification-2026-09-13/backblaze-synthetic-upload.json`;
procedure: `../experiments/screening/backup/ENCRYPTED_CUSTODY.md`. Earlier dated
entries describe their original qualification boundaries.

### September 13 — manual remote recovery drill passed

The keeper-created one-day Read Only credential was verified against the B2 API
for the intended bucket and filename prefix. The exact uploaded sample was
downloaded and matched the retained ciphertext hash/size. The verified recovery
identity authenticated/decrypted it; all five archived records match the source,
with admissions disabled and no live tables. Receipt:
`../research/qualification-2026-09-13/backblaze-roundtrip.json`. The console preset
also includes scoped download-token issuance (`shareFiles`); no such token was
created. Its full granted capabilities and expiry are recorded in the receipt.

No further keeper action is needed for this manual synthetic drill. Independent
offline-key verification and retention decisions remain; operational collection,
trusted manifest retention, scheduling/freshness checks and production recovery
remain unfinished. Automatic backups are off. Credentials were not displayed,
and existing spending caps were unchanged. This completion supersedes the
pending-download status above without changing those earlier observations.

### September 13 — host collector and source connection implemented

A resumable host collector, B2 Native API adapter, disabled private source
handler/client and one-run/freshness CLI are now locally tested. Jobs retain their
pending snapshot across failures, refuse blind re-upload after an uncertain
response, verify the downloaded ciphertext, and publish a durable receipt before
advancing. Freshness is measured from capture, not upload completion. Storage
limits stop collection without deleting versions. Recovery identities stay off
the collector; the normal receipt makes no new decryption/restore claim.

The live screening source remains disabled. Dedicated source and prefix-scoped
B2 writer/reader credentials, deployed-source qualification, trusted receipt
retention, scheduling and independent notification remain open. The new B2 tests
use mocked HTTP; the earlier manual live drill is separate. No source deployment,
new live upload, schedule or companion npm release occurred. Procedure:
`../experiments/screening/backup/HOST_COLLECTOR.md`; evidence:
`../research/qualification-2026-09-13/host-collector/validation.json`.
