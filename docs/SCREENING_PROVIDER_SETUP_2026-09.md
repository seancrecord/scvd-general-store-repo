# Screening provider setup — qualification handoff

Status: configuration requirements, not provisioned accounts or a launched
product. Alchemy and Quicknode are the initial candidate operators from the
September 11 cost reading. No subscription or new account has been created.
The keyless Base sample does not qualify either candidate.

## What account setup must establish

1. Two Base mainnet endpoints from different operators, with historical
   state access and EIP-1898 `blockHash` plus `requireCanonical` support on
   `eth_call`. Qualify the actual endpoints, not the marketing description.
2. A separately accounted screening quota at each operator. Record how the
   provider enforces it and whether other applications share the same
   monthly/throughput limits. Another app/key in the payout account is
   insufficient unless independent reservations are demonstrably enforced.
3. Access limited to the screening reader and provisioning owner. Enter
   authenticated URLs through the deployment's normal secret mechanism.
   Do not paste them in chat, examples, committed files or public evidence.
   Record non-secret witness labels and plan names for the qualification log.
4. Pricing and permitted use of retained/redistributed source observations
   recorded for the selected provider and source terms. The existing cost
   reading is an estimate; no paid plan is required merely to run fixtures.

## Configuration contract before live qualification

The isolated adapter requires explicit product-provider configuration;
missing entries refuse admission. It does not discover providers from
`BASE_RPC_*`, inherit the payout ladder, or use a public fallback. The setup
contract includes the two secret endpoints, non-secret witness IDs,
the maximum acceptable safe-block age, one overall deadline, a bounded
retry count, global request/concurrency/provider-credit limits, a free
allowance and reserved paid capacity. This implementation permits zero
retries. Freeze measured values in the typed policies before enabling the
reader; the fixture values are not release settings.

Implementation update: the isolated qualification Worker now names these
configuration entries in `../experiments/screening/worker/wrangler.jsonc`:
`SCREENING_PROVIDERS` (secret JSON holding endpoint credentials),
`SCREENING_READER_POLICY` and `SCREENING_BUDGET_POLICY`. They are empty and
disabled by default, with no production bindings or deployment. Method credit
weights and ancestry/age/deadline bounds must be established from the chosen
accounts before filling them. `worker/README.md` defines the accepted shapes,
durable lease behavior and outstanding recovery/authentication requirements.

Free admission must happen before any RPC, with per-caller and global caps.
A failed limiter or exhausted product budget refuses the read. Product
payments are never settled for an unavailable observation. The provider's
own hard cap remains a second boundary if local accounting fails. Confirm
how account-level caps work before treating a dashboard alert as enforcement.

## Qualification receipt required from each candidate

The local protocol harness is implemented in
`../experiments/screening/qualify-provider.mjs`; its fixture contract and
reproduction command are in `../experiments/screening/README.md`. It tests
changing-state and noncanonical controls with an injected transport, rejects
ignored selectors and stops on timeout. Its fixture tests do not qualify a
hosted account. A live adapter must bound responses and honor cancellation;
actual fixture provenance, safe-history, quota and terms checks remain open.

`../experiments/screening/pair-policy.test.mjs` now exercises the fixed pair
and isolated free/paid allowances against synthetic adapters. Its single-
process reservations are atomic across the pair, retain credits on failure,
and retain slots until timed-out calls finish. This is a policy test, not
proof of account isolation or a production distributed limiter. Before live
use, bind the paid tier to existing payment authorization, choose a bounded
caller-identity mechanism, persist admission across Worker instances/restarts,
and reconcile all actual RPC method charges with the reserved allowance.

Keep a bounded public report with source/contract, chain, observed block
identities, timings, method/credit counts and outcomes. Exclude credentials,
authenticated URLs and provider response text that might echo them.

- A chain handshake and bounded `safe` head with historical reads at the
  selected block, including an independently known changing-state fixture.
- An unknown-hash failure and a controlled noncanonical-block case that
  demonstrate selectors are honored. A generic method error or malformed
  fixture is not proof of canonicality enforcement. Use a controlled node
  for the instrument test; do not claim it proves a hosted provider's behavior.
  Where the hosted provider cannot expose that case, retain it as unqualified
  and obtain testable provider evidence before accepting that requirement.
- Agreement for the fixed witness pair and block; disagreement, silence,
  stale/pruned state and malformed ABI all produce unavailable, with no
  attempt to find a more agreeable third provider.
- Isolated-budget and free-load tests against fixture providers first.
  Confirm real account limits without exhausting or load-testing the payout
  service. Demonstrate the free allowance cannot consume the paid reserve.
- Actual per-observation cost and retry ceiling, measured independently from
  the challenge path. The 402 challenge must continue to perform no RPC read.

Once these receipts exist, choose the free allowance and paid price against
an operator workflow. Account creation/provisioning and any paid subscription
are separate from the present synthetic format/test work. No credentials
need to be sent to the agent for the local tests to continue.

References: `SCREENING_PRODUCT_DESIGN_2026-09.md` and
`../research/qualification-2026-09-11/README.md` retain the block policy,
source boundary, published pricing reads and observed public probe.

## Recovery evidence required from the selected accounts

The private review protocol is implemented in
`../experiments/screening/worker/RECOVERY.md`. Qualifying an account must also
establish how the operator can confirm no active work for a reviewed set of
reservations and how its executor can be prevented from resuming. A timeout,
quiet dashboard or an old response alone does not establish that fact. If the
providers cannot support a defensible current observation, retain that gap
and do not promise automatic orphan recovery.

Witness labels must remain tied to the qualified operator/account identity.
Do not repoint an existing label at a different account while work or a review
is active. Endpoint configuration and the evidence-to-account mapping are
trusted deployment/operator responsibilities, not authenticated by label
syntax checks. Evidence references are opaque IDs plus digests; keep source
materials privately, and do not include authenticated URLs in the audit.

The operator console must bind authenticated identity to the action, present
the exact review and current revision, and obtain the keeper's decision.
The new service entrypoint supplies that workflow's data and atomic operation;
no public login, console, provider evidence fetch or production binding ships
with this increment.

The next local increment supplies bounded private document storage in the same
isolated Durable Object. Upload reviewed, redacted UTF-8 material through
`ScreeningRecovery.retainEvidence`; the store computes the digest and binds it
to the exact case. Approval now requires those retained bytes, not only a
filled-in reference. This does not authenticate the provider or check whether
the document's assertions are true. The account qualification must establish
credible current evidence, private retrieval, backup/retention policy and who
may submit or approve it. Do not upload credentials or raw authenticated URLs.
No provider/account evidence or credential was collected during local tests.

Operator access is now implemented as an unmounted gateway using the existing
admin login. Production integration should reuse that host's administrator
secret/counters and bind only `ScreeningRecovery`; do not provision a second
login or expose the raw service on a buyer route. The account and source
requirements above are unchanged. A local browser UI now implements exact
case/document review, explicit confirmation and inspection before an exact
retry. Its deployed host and binding still need integration and qualification
before real recovery actions. Synthetic browser tests do not qualify actual
provider evidence, account identity or remote-work termination. See
`../experiments/screening/operator/README.md` for the workflow and its limits.

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

### September 12 — backup destination available

The keeper selected Backblaze B2 and Bitwarden Free. An empty private bucket now
exists with server-side encryption enabled and unchanged zero-dollar account
caps. The intended key format is Secure Note text, requiring no paid attachment.
No real recovery key, application key, upload, retention period or collector
connection was created. Observations and limits:
`../research/qualification-2026-09-12/backblaze-setup.json`. The custody runbook
records the next steps and distinguishes Object Lock enablement from applied
file retention. This does not provision the separate screening RPC accounts.

The subsequent September 12 custody step created the dedicated local recovery
identity and verified a synthetic encrypt/decrypt round-trip. Secret text was
not printed or read by the orchestration process. The keeper still must save
and verify the Bitwarden Note and independent offline copy. Non-secret receipt:
`../research/qualification-2026-09-12/recovery-key-created.json`. The preceding
account-setup receipt remains the historical observation from before key creation.

The keeper-retrieved Desktop vault copy now matches the original public
fingerprint and restores held/recovered synthetic archives with exact rows.
The supplied document required RTF decoding and removal of a bare public line
from the identity input. A clean private local copy was saved; neither the
original nor Desktop file was modified. Vault origin remains keeper-reported.
Receipt: `../research/qualification-2026-09-12/bitwarden-copy-check.json`.
No remote transfer, uploader credential or automatic backup is active.

### September 13 — synthetic upload confirmed; download credential needed

The encrypted recovered-case sample is now in the private Backblaze bucket.
Its console SHA-1 matches the local ciphertext. The console blocks downloading
SSE-B2 files, so remote readback and recovery have not run. A one-day, Read Only,
single-bucket key form restricted to the sample filename prefix is prepared;
no application key has been created. The keeper must save its generated key ID
and application key privately for the API download. Existing caps are unchanged.
Receipt: `../research/qualification-2026-09-13/backblaze-synthetic-upload.json`.
The custody runbook records the exact next check. Automatic backups remain off.

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
