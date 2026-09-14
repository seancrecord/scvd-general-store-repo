# Reviewing stalled screening reservations

Status: implemented and locally tested inside the disabled qualification
Worker. No production binding, operator console or authentication route has
been activated. This is a manual review protocol, not automatic proof that
remote work stopped.

## Authority and evidence

Bind `ScreeningRecovery` only to the authenticated operator service. Never
expose it to the buyer-facing service or let a public request supply the
operator identity. The entrypoint trusts that service to identify the keeper
and authorize each decision. The unmounted gateway in `../operator/README.md`
now reuses the store's existing administrator login and derives operator identity
on the server. Its local browser UI now presents exact cases/documents and
requires explicit confirmation, with uncertain responses handled by inspection
and exact replay. Production mounting and UI qualification remain open. Neither layer independently
authenticates the provider evidence.

The recovery receipt explicitly says
`operator_attestation_not_machine_verified`. Evidence references and SHA-256
digests identify the materials the operator reviewed. The private retention
API now stores bounded document bytes and checks their integrity and scope
when approving recovery. It does not fetch source materials, assess their
truth, or establish that a provider signed them. Wire the operator service
to authorization and current-evidence review before activation. Retaining a
document is not verification that its termination claim is true.

## The review sequence

1. Call `overview()`. It returns active reservation IDs, tier, reservation
   time/age, spending-window context, counts and the current hold. Release
   tokens are omitted. Older reservations without an issuance timestamp
   retain unknown age. Neither age nor a deadline means work is finished.
2. Call `begin({caseId, operator, requestIds})` with a unique case ID and the
   exact nonempty set to review. Opening is durable and pauses **all new
   admissions for this provider pair**, including paid admission. Existing
   work can still finish and release normally. Repeating the identical open
   request returns the existing review; it does not create a second hold.
3. Establish that the executor of these reservations cannot resume or start
   more requests, including delayed admission replies and outstanding retry
   machinery. Obtain current evidence that **both configured providers have
   no active work for the exact reviewed reservations**. Opening a hold does
   not itself terminate an already admitted executor or cancel remote work.
   If those facts cannot be established, do not recover the slots.
4. Retain the reviewed, redacted documents with `retainEvidence(submission)`
   as described below. Use the returned digests and reference IDs in approval.
   Uploading a new document changes the review revision.
5. Call `inspect(caseId)` immediately before the decision. Compare its target
   set and `stillActive` list with the evidence. Use its current revision.
   A normal completion or other stored budget change invalidates an earlier
   revision. If a target already completed, cancel this review and, if needed,
   open a new case for the remaining targets. Do not silently narrow approval.
6. Call `commit(approval)` through the operator service. The approved fields
   are defined by `RecoveryApproval` in `recovery.ts`: case ID, exact revision,
   operator, `RECOVERY_ACK`, one `executor_terminated` reference and exactly
   one `no_active_provider_requests` reference per configured witness. Each
   reference carries an opaque non-secret ID, SHA-256 digest and observation
   time. Evidence must have been observed after the hold began and within
   `RECOVERY_LIMITS.evidenceMaxAgeMs` at commit. Future times, wrong witnesses,
   missing/duplicate references, unknown fields and URL-shaped references
   are refused. Every reference must resolve to retained bytes for this case,
   role, witness and observation time, with a freshly recomputed matching hash.
   These checks establish document integrity, scope and claim freshness.
7. Retain the returned receipt. It records the reviewed targets, operator,
   references, time, resulting revision and released slot count. Only the
   exact original reservation generations are released. Spending and request
   counts are unchanged; `creditsRefunded` is always false. The hold and audit
   update commit atomically with the slot changes. New successful decisions
   carry `evidenceRetention: private_bytes_checked_at_decision_v1`. Historical
   receipts without that field do not acquire it or manufactured evidence.

`RECOVERY_ACK` is the single source of the confirmation text; an operator
console must display that exact value beside the concrete review rather
than hand-copy it into a second constant. Its confirmation is a keeper action,
not a cron or agent assertion. The qualification timing and retention bounds
are declared in `RECOVERY_LIMITS`; review them before production adoption.

## Private evidence retention

`retainEvidence(submission)` accepts the exact `EvidenceSubmission` fields in
`evidence.ts`: case ID, operator label, opaque reference, kind, witness ID
(null for the executor), observation time, and plain text content. Use only
redacted material the keeper has reviewed. Do not submit credentials, private
keys, authenticated provider URLs or unnecessary personal data. This API
checks format and size; it is not an automatic secret or personal-data filter.
The operator gateway must bound the request body before deserializing it.

Content is preserved as exact UTF-8 text, never trimmed, normalized, executed
or interpreted. Empty/whitespace-only input, lossy Unicode and oversized byte
sequences are refused. `EVIDENCE_LIMITS` is the single source for per-document
bytes and documents per case. Those bounds, combined with the case cap, bound
total document storage. They are qualification limits, not a production
retention policy. At the cap, nothing is overwritten or deleted.

The service computes SHA-256, records byte length and retention time, and
binds the document to the case's policy, witness set and original reservation
generations. The bounded hash and SQLite writes are synchronous inside one
transaction; persistence is acknowledged before success. New material changes
the budget revision without changing spending or slots. All of this happens
on the private operator action; normal observations gain no provider calls
or evidence-storage operations. No production latency improvement is claimed.

A reference is immutable within its case. An exact retry returns the original
metadata, including after cancellation or recovery. A changed body, submitter,
role or timestamp at the same reference is refused. To refresh evidence, use
a new reference and inspect the new revision. New references require an open
held case. Cancellation preserves all uploaded evidence. If the evidence cap
is exhausted before a valid decision, cancel and open a new review; the old
materials and reservations remain, and new evidence must be current for the
new case. Do not reuse an old observation as if it happened after the new hold.

`evidenceList(caseId)` returns bounded metadata only. `evidence(caseId,
reference)` returns one retained document with `contentTrust:
untrusted_operator_submission`. Both recheck stored integrity/scope. The
operator UI must render content as plain text, never HTML or instructions.
Overview, case history, inspection and successful upload replies contain no
document content. The buyer entrypoint has no evidence methods; public HTTP
still returns 404. Service-binding restriction is the current access boundary;
the unmounted operator gateway separately applies the shared admin login.

This is private operational retention, not a customer evidence-custody SKU,
an encrypted commit-reveal vault, a signed provider statement or an externally
anchored audit. A database administrator able to rewrite both the documents
and audit is outside these integrity checks. There is no deletion/export
migration, independently stored encrypted backup or retention deadline yet.
Local consistent snapshots and quarantined offline restore verification now
exist in `../backup/README.md`. Qualify the remaining policies
and retrieval on the real account before activation. A previously committed
approval can still return its original receipt if its documents are later
unavailable; that is a replay of the decision at the recorded time. Use the
separate evidence reads to assess present availability and integrity.

## Cancellation, races and uncertain responses

`cancel({caseId, expectedRevision, operator})` removes the admission hold and
records cancellation. It frees no reservations and refunds no credits. Use
the current revision from `inspect`; stale cancellation is refused.

If a commit response is lost, retry the **same approval**. A committed case
returns its original receipt, even if later admissions changed the budget.
A changed operator, reference, revision or decision cannot rewrite that case.
Cancellation has the same retry behavior for its original operator/revision.
Case IDs cannot be reused. A late ordinary release is harmless and cannot
release a newer reservation reusing the old request ID.

If a write fails, inspect the same case before deciding what happened.
The transaction rolls back audit and budget changes together, while an
uncertain persistence acknowledgement can mean the original operation
committed. Do not create a new case to work around an uncertain response.
Reconstruction preserves open holds and final receipts. No timeout or restart
clears them, and no recurring recovery task is installed.

## Retention and visibility

`history(afterSequence)` returns a bounded page, the retained/returned counts
and the next sequence. It omits release tokens on every page. The audit never
silently drops old cases. When `RECOVERY_LIMITS.maxCases` is reached, new
reviews are refused before creating a hold; existing reviews remain usable.
A verified export and reviewed retention migration are required to extend
that capacity. There is no automatic deletion or unaudited reset method.

The operator gateway now applies the shared admin login in local tests. Its
production mounting/binding and UI qualification, independent backup/retention
policy and deployed alerting for persistent holds/stalled reservations remain
launch work. Local attention readings and the unscheduled monitor adapter are
implemented; `OPERATIONS.md` specifies integration and backup acceptance. The local review UI uses the private overview/history/inspection data;
the public HTTP handler remains 404.

## Validation

`recovery.spec.ts` uses real local SQLite with injected clocks. It covers
holds, restart reconstruction, normal-completion races, exact retry behavior,
changed evidence, stale revisions/times, malformed references, transactional
write failure, legacy records, pagination/caps and zero RPC on held admission.
`evidence.spec.ts` additionally tampers with retained bytes, edits and rehashes
a document, deletes one and copies it across cases. It checks UTF-8 bounds,
concurrent retries, immutable references and transactional insert failure.
The fixtures assert what the API enforces; they do not validate a real provider
termination receipt or cloud failover.

The normal suite and typecheck are in `README.md`. The additional negative
controls intentionally fail the original assertions, without editing source:

```sh
SCVD_SCREENING_GUARD_MUTATION=retention_integrity node_modules/.bin/vitest run --config experiments/screening/worker/vitest.mutation.config.ts -t 'refuses recovery after retained evidence is edited_bytes'
SCVD_SCREENING_GUARD_MUTATION=recovery_revision node_modules/.bin/vitest run --config experiments/screening/worker/vitest.mutation.config.ts -t 'refuses stale_revision'
SCVD_SCREENING_GUARD_MUTATION=recovery_evidence node_modules/.bin/vitest run --config experiments/screening/worker/vitest.mutation.config.ts -t 'refuses stale_evidence'
```

The offline age seal/copy-check/open tools now have synthetic qualification;
`../backup/ENCRYPTED_CUSTODY.md` records their private working-file requirements
and current custody status. The private B2 destination and dedicated key now
exist; a synthetic encrypted sample completed authenticated B2 API readback
and exact five-row recovery September 13 using a scoped one-day credential.
No operational state transfer or automatic backup occurred.

## September 13 — host collector ready for deployment qualification

The private snapshot connection, host collector, B2 adapter and one-run/freshness
CLI now have local tests. They are not mounted or scheduled. Source capture
remains on the separate backup authority, and no recovery/admission operation
is available to the collector. Unknown upload outcomes keep the pending snapshot
frozen. [Host collector operations](../backup/HOST_COLLECTOR.md) records the
credential contract, storage cap, crash handling, proposed cadence and remaining
source/deployment/independent-monitor gates. The earlier manual B2 recovery test
remains the only live transfer qualification.
