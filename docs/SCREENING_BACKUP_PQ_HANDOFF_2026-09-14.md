# Screening, backup and post-quantum work: review handoff

Prepared September 14, 2026. Purpose: explain the implementation and get critical feedback on the plan before further deployment or product expansion.

## The explanation in plain English

We are building a way to sell a signed record of what a particular sanctions oracle reported about an address at a particular blockchain block. The intended value is a portable record for an operator's files. It does not establish that an address is safe, identify its owner, or provide general counterparty clearance.

The experimental reader asks two independent RPC providers about the same block and requires agreement. Before doing that work, a separate accounting system reserves enough capacity at both providers. Free traffic cannot consume the capacity reserved for paid traffic. If a read becomes uncertain, the system keeps its reservation until completion can be established, rather than assuming a timeout means the work stopped.

That conservative reservation policy led to a private recovery desk, evidence retention and backup tools. The desk lets an operator review stranded reservations. The backup tools preserve the accounting and recovery records, encrypt them, and verify that a remotely stored copy can be retrieved. **This operational support is substantially implemented locally; the paid screening product is not integrated or launched.**

A separate experiment creates an additional post-quantum signature checkpoint over an existing weekly corpus snapshot. It is a different project from backup encryption. Production artifact signing has not been migrated by this work.

## What this handoff actually inspected

Implementation working folder:

`/private/tmp/scvd-pq-screening-plan-20260911`

Branch: `codex/pq-screening-plan-refinement`.

The implementation was prepared on base commit `ecd0807431a64e1fd9b18efcbd5e646001d0228d`. At the initial September 14 handoff it consisted of uncommitted changes and untracked additions. The keeper subsequently requested a branch-only review snapshot containing that work and this document. Use the published `codex/pq-screening-plan-refinement` branch and its commit history for review; a clone of main does not contain this complete implementation. The recent conflict-resolution commit for PR #675 concerns Launch Check payment/replay evidence; it does not merge this screening/backup/PQ work.

This handoff accompanies the review branch, with a local copy in the primary workspace for convenient sharing. All code paths below are relative to the branch root, unless stated otherwise. The temporary working-folder path above is only the original local location; another agent can check out the review branch elsewhere. Branch publication does not activate the features or authorize a PR, merge or deployment.

The initial handoff checked source/configuration and retained qualification receipts. The nine source/test hashes in the September 13 host-collector receipt still matched their files. Subsequent branch-publication checks are recorded separately in `research/qualification-2026-09-14/branch-publication.json`; the dated historical results below remain historical evidence. No fresh cloud deployment inventory, provider-account qualification, account-pricing check or live backup transfer was performed for this handoff or branch publication. Deployment statements describe the checked configuration and recorded work; they are not a fresh audit of every cloud resource.

## Current state

- **Implemented locally:** two-provider reader, durable admission accounting, private reservation recovery, retained review documents, authenticated operator gateway and review UI, operational readings, private snapshot export, encryption/offline restore, resumable host collector, Backblaze transport and a one-run/freshness CLI.
- **Demonstrated against a real external service:** a manual encrypted synthetic sample was uploaded to Backblaze, downloaded by exact file version, checked and decrypted into an exact five-row offline recovery on September 13.
- **Disabled/unconnected in this working tree:** the screening Worker’s policies are empty; its public handler returns 404; no production service binding connects the new entrypoints; the backup gateway is not mounted; the collector example starts with `enabled: false`.
- **Not operating as a service in the retained evidence:** scheduled collection, independent freshness notifications, deployed operator recovery and automated operational-state backups.
- **Not built as a product:** public free/paid screening routes, authenticated paid-tier selection, final signed observation schema and retention/retry integration, payment settlement wiring, price, samples and discovery/package support for that new artifact.
- **PQ status:** real cryptographic experiments and an implemented draft checkpoint format/adapter exist. Production backend approval, operational keys, an independently trusted anchored declaration, production issuance and a released checkpoint verifier do not.

## 1. Screening reader and accounting

### The actual read

Primary files: `experiments/screening/worker/rpc-reader.ts`, `worker/index.ts`, `worker/budget.ts`, and `src/lib/sanctions-oracle.ts`.

The current adapter accepts the Base network and a valid EVM address. Other requested networks are unsupported by this implementation, including other EVM networks; accepting a 20-byte address is not an assertion of cross-chain coverage. Checkout rails are a separate concern.

After durable admission, each provider supplies its chain identity and safe head. The reader chooses the lower head, walks the higher head’s parent hashes within a configured bound, and requires both paths to identify the same block. Each witness then calls the configured Chainalysis oracle with the exact calldata and `{blockHash, requireCanonical: true}`. Strictly decoded answers must agree. Wrong chains, inconsistent blocks, stale/future blocks, malformed booleans, silence and disagreement return unavailable. There is no third-provider vote, retry or downgrade to latest in this implementation.

Success is `observed_unsigned`, with `production_ready: false`. The result includes address, source chain/contract, calldata, block identity/time, policy, witness responses and attempted method/credit/byte counts. It is an observation of RPC responses, **not an independently verified blockchain state proof**. Provider labels, different hostnames and matching answers cannot by themselves establish independence or truth.

The payout gate shares only pure oracle helpers with this work. Its separate selection/retry policy is not replaced by the product agreement policy.

### Budgeting and failure behavior

A SQLite-backed Durable Object reserves both providers’ worst-case configured allowances atomically before network I/O. It enforces global requests, free requests, per-caller counts, bounded caller storage, provider credits and concurrent slots. Free use preserves paid credit, slot and caller-storage reserves; paid use is also capped. All entrypoints use a fixed provider-pair coordination identity, so a caller cannot select a fresh object or policy ID to reset capacity.

The current internal service trusts its caller to supply tier, caller identity and request identity. **Public authorization for those fields is still missing.** The budget’s reservation deduplication is not the store’s complete paid-delivery idempotency contract.

Credits remain consumed conservatively after success or failure; unused allowance is not refunded. Window rollover resets spending/caller accounting but preserves active leases. Timeouts abort transport, yet a slot is released only after pending operations settle. A crash can therefore strand capacity. Changing the persisted policy requires deliberate migration; it does not silently reset accounting.

Real provider caps and billing remain independent boundaries. A local “credit” is only a configured weight until reconciled with an actual provider account’s charges.

### Product contract still to implement

The proposed paid deliverable says “listed by this source at this block” or “not listed by this source at this block.” A listed answer is a completed observation, not a failed purchase. Unsupported, unavailable, inconsistent or malformed results are free failures with no paid delivery or settlement. Signing/retention failure also prevents settlement. The existing deliver-first policy applies once integrated.

The proposed free door returns an unsigned observation. A paid request must make a new observation or explicitly purchase the earlier block under an agreed contract; it cannot silently relabel old data as current. A retry of an already fulfilled paid request must recover its original signed record.

## 2. Recovery desk and operational evidence

Primary files: `worker/recovery.ts`, `worker/evidence.ts`, `worker/budget.ts`, `operator/gateway.ts`, `operator/page.ts`, `operator/client.txt`, and `src/lib/admin-auth.ts`.

Opening a recovery case holds new admissions. Approval requires the current revision, exact target reservations, retained evidence references for both providers and the executor, and an explicit operator acknowledgement. Evidence bytes are bounded, privately retained, hashed and tied to the case and reservation generations. Approval checks integrity and scope, changes slots and writes an audit receipt atomically, and does not refund credits. Cancellation and uncertain-response retries preserve the original operation’s identity. Ordinary completions can invalidate a stale review.

The gateway reuses the administrator gate and derives operator identity server-side. Mutation requests need the expected HTTPS origin/action context and bounded input. The browser displays evidence as untrusted plain text, verifies its digest, requires selection and confirmation, and clears consent when the reading changes. After an uncertain response it requires inspection before an explicit retry of the same operation. Pending browser requests live in tab memory; closing the tab can lose that memory.

**The desk records an operator’s attestation. It does not authenticate provider authorship, terminate executors, or prove that remote work stopped.** Old age alone cannot justify release. Whether a one-person operator can obtain sufficiently strong evidence for this workflow is a significant open design question.

`worker/attention.ts` and `operator/monitor.ts` expose dated readings for holds, aging/unknown-time reservations, capacity and retention pressure. The monitor adapter can submit to the existing alert channel, but is unscheduled and does not confirm delivery. It needs deployed binding, last-run/freshness retention and independent failure detection.

## 3. What the backup contains—and what it does not

Primary files: `backup/source.ts`, `backup/format.ts`, `backup/restore.ts`, and the separate `ScreeningBackup` service in `worker/index.ts`.

Snapshot capture reads these private SQLite records in one transaction:

- budget policy/accounting, caller counters and reservations, including sensitive lease-release tokens;
- recovery cases, targets, revisions, decisions and sequence position;
- retained recovery-evidence bytes and their bindings.

It produces one frozen export generation, a manifest and bounded pages. Repeating a capture ID returns that capture. Replacing export staging requires the expected predecessor hash. Subsequent live changes cannot silently alter the frozen pages. Record digests, ordering, counts and linked-record checks detect corruption or incomplete assembly under the expected manifest.

**It does not currently back up a complete ledger of screening observations.** The unsigned reader returns its result; this snapshot exporter is not an observation-retention product. It also does not back up the entire store, deployment configuration, provider credentials, signing secrets or the recovery key.

Raw exports are sensitive. A separate backup authority exposes them; buyer, operator-browser and monitoring interfaces do not. The collector needs no provider credentials or recovery-operation authority, but its access to raw snapshots is still privileged.

An independently trusted manifest hash is necessary: checksums stored only next to replaceable data cannot establish authenticity. The backup format’s hashes are not signatures, public anchors or PQ checkpoints.

## 4. Encryption, Backblaze and restore

Primary files: `backup/encrypted.ts`, `backup/encrypted-cli.ts`, `backup/collector.ts`, `backup/b2.ts`, `backup/gateway.ts`, and `backup/collector-cli.ts`.

The external host encrypts verified snapshots using a qualified age executable and the public recipient. The dedicated private recovery identity is needed to decrypt, not to collect or upload. Bitwarden is the selected vault; this plan does not require a switch to 1Password. The age backup-encryption identity is unrelated to production Ed25519 signing or the proposed ML-DSA checkpoint keys. Backblaze SSE-B2 is an additional storage setting, not a substitute for client-side encryption.

The collector uses a private working directory, process lock, durable pending journal and generation receipts. It validates bounded source pages, verifies the selected age binary’s hash, seals the archive, records upload intent before sending, and verifies a download of the exact uploaded B2 version against the retained ciphertext hash/size. It persists the success receipt before advancing its success pointer.

An uncertain upload response stops automatic re-upload because the first upload might have succeeded. A known successful upload can be downloaded again without uploading again. Stale locks and ambiguous intermediate states require inspection. The code does not automatically delete versions, clear stranded reservations or erase its journal to recover.

Normal collection verifies **ciphertext readback**, not decryption: its receipt explicitly records `restorePerformed: false`. Periodic independent decryption/restore drills are a separate obligation. Plaintext scratch and restored SQLite files exist on the host; owner-only permissions and cleanup are not secure erasure or a substitute for encrypted host storage. A crash can leave scratch files behind.

Offline recovery checks the expected manifest and linked records, then creates a quarantined SQLite archive with `restore_meta` and `restore_rows`. It has no live budget tables, provider access or activation method. This proves data can be reconstructed for inspection; it is not a complete production disaster-recovery or reactivation procedure. Old accounting and active work must be reconciled before any future reactivation design.

### Credentials and pilot settings

Three collector access credentials remain to provision: a dedicated machine token for snapshot capture/read, a B2 writer restricted to the bucket/prefix with only `writeFiles`, and a separate scoped read credential for verification. None is the decryption key. The adapter checks returned capabilities, scope and expiry; its current policy requires credentials with no more than 31 days remaining. Rotation is consequently an ongoing operating task. The one-day sample credential is not a collector credential; its recorded expiry is September 14 at 17:33:54 UTC.

Defaults in `PILOT_BACKUP_POLICY` are a 16 MiB archive limit, cumulative 256 MiB known-ciphertext allowance, 36-hour maximum capture age and three readback attempts. Those are code defaults, not measured production requirements or a guarantee about the full B2 bill. The ledger does not count unrelated uploads or other writers. Full archive allowance is reserved conservatively before a new capture, and reaching the cap stops collection rather than deleting older copies.

Daily collection on this Mac is a proposal, not an installed schedule or a final host decision. Freshness uses the source capture time, not the upload completion time. An independent observer and independently retained receipts are still needed: a sleeping, lost or compromised collector cannot provide its own reliable failure alarm or sole trust record.

## 5. Evidence actually obtained

These are successive, overlapping qualification runs; their counts must not be added into a purported total suite.

- **September 11:** synthetic two-witness/provider-protocol fixtures report 41 passing tests. Later isolated Worker tests use real local Durable Object SQLite with synthetic HTTP, including admission, recovery, evidence and snapshot cases. The private-backup increment records 118 Worker tests and 14 offline tests. Gateway/UI and monitor qualification are recorded separately; a local Chrome walkthrough is not a deployed browser-to-service-binding test.
- **September 11:** encryption/offline tests use disposable identities and synthetic archives, including wrong keys, tampering and failure after partial work. Recorded guard-removal controls deliberately make the original assertions fail.
- **September 13:** the real manual B2 drill retrieved the exact encrypted synthetic sample, checked its bytes, decrypted it using the keeper-retrieved vault copy and recovered all five records with no live tables or enabled admissions. This does not prove independent offline-key custody or the new collector transport.
- **September 13:** the host collector receipt records 78 passing tests, passing host/root typechecks and both dry-run bundles. Readback/authentication guard-removal controls fail as intended. Its B2 transport uses mocked HTTP; its gateway tests run Web APIs in Node, not a deployed binding. Today’s nine matching hashes connect that receipt’s listed files to the inspected code.

**September 14 branch-publication checks:** all 656 root test files passed (11,836 passing tests and one skipped); the separate PQ, screening/browser, backup and isolated Worker suites passed. Root and experimental typechecks, documentation/claim checks and dry-run bundles passed. Fresh guard-removal negative controls failed their original assertions as intended. The publication receipt records the exact counts, scope, setup correction and limitations.

The accumulated screening branch still needs integration against current main and release checks before activation. Branch-publication validation is recorded separately in `research/qualification-2026-09-14/branch-publication.json`; it does not establish production readiness. Tests run for PR #675 are not tests of this separate feature branch.

Evidence entrypoints: `research/qualification-2026-09-11/README.md`, its per-increment `validation.json` files, `research/qualification-2026-09-13/backblaze-roundtrip.json`, and `research/qualification-2026-09-13/host-collector/validation.json`. Earlier dated “not yet implemented” notes are historical; use their later follow-through entries and the code when assessing current implementation.

## 6. The separate post-quantum checkpoint track

Primary files: `experiments/pqc/checkpoint.mjs`, `CHECKPOINT_FORMAT.md`, `corpus-checkpoint.mjs`, `checkpoint-cli.mjs`, `runtime-qualification.mjs`, `interop.mjs`, and `acvp-sample.mjs`.

The draft signs the exact canonical weekly snapshot through a new envelope requiring both ML-DSA-65 and a distinct checkpoint-only Ed25519 key. It protects the algorithm/key/purpose policy and uses strict fixed-order UTF-8 JSON, byte limits and explicit context separation. The caller supplies a separate trust document. The checkpoint’s own contents cannot appoint its trusted keys or relax the required signatures.

The prototype rejects production-artifact keys used as checkpoint keys and checkpoint keys used at its experimental artifact-acceptance seam, including key aliases. **That seam is not yet enforcement across released production verifiers.** The corpus adapter reuses existing canonicalization/signature/history readers and verifies a supplied prefix, with original records unchanged. It is not an independently implemented full nested corpus parser and does not verify Bitcoin proofs.

The experimental package pins `@noble/post-quantum` at `0.7.1`. Retained work includes bidirectional OpenSSL interoperability, selected NIST vector results (70 cases, with stated exclusions), entropy-failure controls, separate-process checkpoint verification and local cold/warm runtime measurements. These do not establish an audited/FIPS-validated implementation, production signer suitability, or a service p95 improvement. Hedged signing remains an issuer claim at verification; SHA-512 is optional extra margin, not the reason the checkpoint exists.

Remaining production gates: reviewed backend/provenance and runtime budgets; independent format/verifier qualification; enforce key purposes at real acceptance points; provision and rehearse separate signing/recovery/rotation custody; authenticate and independently distribute the key declaration; obtain and independently verify its completed Bitcoin commitment before first issuance; then anchor the exact completed checkpoint separately. Pending proof submission is not verified anchoring. The public “Watching, not building” stance needs a dated scope amendment before adoption is presented publicly.

The first checkpoint covers the selected snapshot bytes. It does not automatically reissue every old certificate, authenticate all detached evidence, or migrate x402 payment signatures. Engineering estimates in the plan are historical planning allowances; they exclude custody, review and sequential anchor-confirmation delays and should be re-estimated against the remaining work.

## 7. Latency, cost and package consequences

The reader runs the two providers concurrently where dependencies permit, but a successful aligned-head observation still performs six RPC calls: two chain handshakes, two safe-head reads and two oracle calls. Parent walking adds calls. Durable admission and provider response time remain on the observation path. Code bounds deadlines, bytes and method allowance; those bounds are not measured production latency or billing.

Keep discovery and payment-challenge construction free of oracle calls. Do not gain speed by dropping a witness, accepting stale answers as current, releasing uncertain work early, or borrowing the payout quota. Measure availability as well as p50/p95, method charges and refusal rates. Conservative reservations can reduce sellable capacity even when actual provider cost is low.

PQ work belongs outside both Workers; serving finished public checkpoints need not put signing on checkout paths. Backup work is separate from ordinary observations, but synchronous capture shares the budget object and can delay its requests. Maximum-volume capture/restore testing is still needed. The host B2 adapter buffers bounded ciphertext; it is not an unlimited streaming uploader.

Internal backup/recovery tools require no release of `x402-verify`, `x402-sign`, `scvd-cli`, `scvd-corpus-client` or `scvd-tab`. A paid screening artifact will need coordinated schema, verification, samples, discovery and relevant client support. A production PQ checkpoint needs a separate opt-in verifier; existing Ed25519 formats must retain their contracts. CLI/corpus download support should be explicit; the Tab needs checkpoint support only if its product actually exposes that verification. Do not import PQ into checkout or change `EdDSA` headers to describe different bytes.

## 8. Recommended next work, with decisions separated

1. **Prepare one bounded deployed backup pilot.** Review the working-tree changes and deployment boundary; deploy a private synthetic source and protected backup gateway; provision the three distinct credentials; use the provisional Mac host only if accepted. Synthetic snapshot qualification need not wait for live sanctions-provider accounts. Qualify actual source-to-collector-to-B2 readback and independent offline recovery before operational data is entrusted to it.
2. **In parallel, establish screening’s product case.** Name an operator, the decision/file this record serves, expected volume and willingness to pay. Establish applicable source/provider permissions and attribution. Select and qualify two genuinely independent account budgets. An additional key on a shared exhausted account is not isolation. A successful public RPC sample is not hosted-account qualification.
3. **Before unattended operation, finish recoverability and observation of failures.** Confirm host and owner, independently recoverable receipts/manifests, independent offline-key copy, credential renewal, freshness notifications and a missed-run drill. Choose retention based on volume and recovery needs. No deletion-resistant lock or automated deletion has been applied by this work. Define acceptable data loss and recovery time; daily/36 hours is not an accepted service guarantee.
4. **If the product case passes, integrate one narrow paid/free product.** Fix schema, permitted wording, provider policy and price; authenticate paid tier/caller identity; bind paid input and retry identity; sign and durably retain the original result; enforce zero settlement on nondelivery; add discovery, sample and verification support. Test signed-field tampering, provider disagreement, exhausted budgets and uncertain delivery end to end.
5. **Release in reviewable pieces.** Reconcile the old feature branch with current main, especially shared admin/auth and Launch Check changes. Run the relevant isolated suites plus the required root checks on the integrated tree. Keep deployment, signing activation, schedules and real paid acceptance distinguishable from local tests. Advance PQ independently through its explicit trust/custody/anchor gates.

Human decisions: buyer/use case, source/provider contracts and account access, pricing/free allowance, host/cadence, retention/deletion resistance, recovery-key custody, and eventual PQ custody/public wording. Agent work: prepare reviewable configurations/runbooks, qualification instruments, integration code, evidence and precise account instructions. Do not ask the keeper to paste secrets into an AI conversation.

## 9. Questions for the reviewing agent

Please challenge the plan rather than merely endorse it. Separate demonstrated defects from hypotheses and cite code when available.

1. Is the buyer proposition strong enough to justify paid independent observation over a directly accessible oracle? What specific evidence would change a build/no-build decision?
2. Which trust/charging boundaries are essential for the first release, and which recovery/backup features should be deferred? Has qualification grown into an operational platform before demand is established?
3. Is the fixed two-provider/safe-block policy practical to qualify and operate? Can the historical-state and noncanonical-block controls actually be demonstrated on the intended hosted accounts? Do not replace missing evidence with provider marketing.
4. Is indefinite reservation retention plus human termination evidence workable? Could a bounded executor or fencing design reduce operator burden without admitting work while an old executor can still run?
5. Are the snapshot source, raw lease tokens, machine gateway, local journal and independently retained manifest/receipt boundaries adequate? What happens after losing or compromising the entire Mac, not merely one file?
6. Does the credential design’s renewal frequency, ambiguous-upload inspection and stopped-at-cap behavior fit a one-person operation? Identify any missing bounded abuse controls on the private capture gateway.
7. Which actual maximum-volume, latency, failover and disaster-recovery experiments are needed before deployment? What evidence would justify the proposed cadence and limits?
8. Does the PQ declaration/checkpoint anchoring plan establish the claimed historical trust? Which guarantees remain dependent on supplied trust, source authenticity, implementation review or a future verifier release?
9. What is the smallest next PR and the smallest deployed acceptance exercise? Give a prioritized must-fix / should-fix / defer list, expected operator burden and realistic remaining effort. Do not re-estimate completed experiments as unbuilt work.

Review scope is this handoff and the named working tree. Do not provision accounts, rotate keys, deploy, sign production artifacts, install schedules, publish packages or merge changes merely because the plan discusses those actions. Do not treat old competitor claims, directory metrics, package versions or dated qualification results as newly verified facts. Request a current source/receipt when a conclusion depends on it.
