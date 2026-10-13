# Skills listing and traffic accounting — October 13, 2026

## Scope closed by the keeper

The keeper asked to check skills.sh and make traffic accounting the next piece.
Native-host runs, paid purchase/delivery/receipt verification, wallet onboarding,
and authenticated dashboard visual readback are skipped/closed for now. They
remain unverified; they are no longer outstanding actions for this batch.

## skills.sh checked

The actual browser page still renders 404 / “scvd-personal-shopper isn’t available
in this repository,” and suggests the original `scvd-general-store` skill.
The GitHub shopper definition returns HTTP 200, declares the correct name and
is 5,030 bytes. The website files index returns HTTP 200 and lists the shopper.
Prior release verification installed the three-file skill successfully; this
check did not repeat the installation or emit install telemetry.

The current [official FAQ](https://www.skills.sh/docs/faq) says leaderboard
entries appear through anonymous installation telemetry. Our controlled
verification installs disabled telemetry, so those checks did not contribute
listing activity. This is an indexing/distribution gap, not evidence that the
published source disappeared. No manual submission is described in the FAQ;
no artificial installs, outreach, account creation or recurring monitor were
performed. Genuine telemetry-enabled installation is the documented discovery
path, not a guarantee of an indexing time or ranking.

## Traffic: confirmed local defect; rollout pending

The saved snapshots still match their original hashes. Recounting gives 34,014
unique listed event keys and 34,014 rows. The comparison set has 16,114 distinct
saved challenge records, all dated October 11 UTC, with the same non-house /
non-infrastructure filter. All ten daily counter shards are present and sum to
6,829. The gap is 9,285. This rules out a simple duplicated key list, an accidental
two-day event filter, and an omitted shard in this saved comparison. Distinct
records are not necessarily distinct HTTP requests; the snapshots contain no
request ID with which to establish that identity.

A defect exists in the pre-fix source configuration:

- `doors/wrangler.jsonc` routes unpaid `/api/buy/*` requests to `scvd-doors`,
  shares COUNTERS with the store, but declares no COUNTER_LEDGER namespace.
- `src/lib/doors-app.ts` invokes the shared payment gate, which calls
  `recordChallengeIssued` with the doors environment.
- `src/lib/metrics.ts` uses the serialized writer only if that binding exists;
  otherwise it falls back to KV get, add, put. Concurrent updates can overwrite
  increments while independent event rows survive.
- The main store does declare the protected writer. Its desk showing a bound
  ledger is therefore insufficient evidence that the fast doors use it too.
- Existing doors config tests explicitly forbid Durable Object bindings, and
  the parity test removes COUNTER_LEDGER from its modeled environment. The
  correction must distinguish a reference to the store's counter writer from
  ownership of a second trade counter.

A read-only attempt to inspect both live Workers' binding metadata returned
HTTP 401 on the initial attempt. Live settings were subsequently verified below; the exact historical cause remains unverified;
the reproduced defect does not establish that it explains all 9,285 events.

### Local reproduction and correction

`test/doors-counter-accounting.spec.ts` forces twenty requests to read the same
old daily value before any write. All twenty event rows survive; the unbound
counter ends at one. The real SQL-backed counter retains all twenty increments,
then accepts another request through the same namespace and ends at twenty-one
in both SQL and its KV mirror. This establishes a concrete loss mechanism,
not a reconstruction of the October 11 traffic.

The local correction references the store's existing `CounterLedger` namespace
from `doors/wrangler.jsonc`. It creates no class or migration. The config guard
now requires the shared writer and still forbids ownership/migrations; it failed
on the old config and passes with the binding. The quote parity fixture retains
only this shared namespace; the other unavailable object bindings stay absent.
Quotes still return before background accounting completes.

### Handover prerequisite — do not deploy the binding alone

An already-seeded SQL counter does not reread KV. A second local case holds SQL
at seven while the legacy doors advance KV to twenty-five: reading the ledger
still returns seven. Simply switching the doors to SQL could therefore replace
a higher published baseline. The existing `raiseTo` operation preserves the
observed twenty-five before the protected burst; the counter then ends at
forty-five. This tests a handover primitive, not an automated migration.

Before release, obtain current live binding metadata and a read-only snapshot
of the affected KV and SQL counters. Coordinate the stop of legacy writers,
allow outstanding writes and KV propagation to settle, preserve the higher
observed baseline through the existing ledger, and verify both Workers use that
same authority. The baseline must come from existing counters, not the 16,114
retained events. A partial or stale snapshot cannot establish a safe cutover.
At that checkpoint no production setting or historical counter had been changed.
The subsequent PR and approved handover are recorded below. The full CI gate
remains required before merge.

### Validation

- Config regression: 1 failure before the binding, all 5 checks pass after it.
- Focused quote, counter and response-order suite: 29 checks passed before the
  extra handover case; the accounting file with all 3 cases passes separately.
- Typecheck and both Worker bundle checks pass.
- No production burst, paid request, historical recount write or new telemetry
  install was performed.

[Machine-readable check](readback.json). Original evidence remains under
`/tmp/scvd-traffic-investigation`; no raw visitor rows were copied or published.

## Approved PR release follow-up

[PR #1016](https://github.com/seancrecord/scvd-general-store-repo/pull/1016)
is open as a draft while the handover is pending. Refreshing the existing
Wrangler session restored metadata access: the store uses namespace
`1d3abae2047a4c339ac7f4d0f554c435`, and the live doors Worker has no Durable Object
binding. A read-only KV snapshot retained 1,864 current-period challenge and
venue counter keys under `/tmp/scvd-counter-handover/kv-before.json`.

A Data Studio `SELECT` over today's ten daily SQL shards totals 279, while the
KV snapshot totals 611. These are separate observations, not an atomic snapshot;
the size of the difference confirms that a binding-only rollout risks lowering
the published baseline. The SQL read issued no insert, update or ledger RPC.

Automatic approval review rejected a temporary remote inspector because the
existing ledger `read` method can seed missing SQL rows. That rejected command
was not executed. The keeper subsequently approved preservation of the higher
already-recorded traffic counter baselines; the completed operation is below. No event-based
historical reconstruction or sales adjustment is proposed. Merge remains held
until baseline preservation and the full CI gate are satisfied.

## October 13 — wards and public-reader audit

The keeper approved preserving legitimate existing baselines and asked for the
wards and public censuses to be checked too. Eight relevant test files passed
107 checks: ward rounds, heartbeat, request census, buyer census exclusions,
MPP census, observatory, pulse and house reclassification. Live house-marked
reads of `/sources.json`, `/registry`, `/pulse.json`, `/observatory` and `/stats`
all returned 200 with their expected JSON data.

- The external ward census reads saved probes, not our visitor counters.
  `/sources.json` reports `beating`, no missing weeks, and the October 11 round:
  5,069 host rows against 12,855 known, with six of eight sources answering.
  The known-source count is not a claim that every host was probed. Individual
  source failures remain visible; this read did not rerun the external census.
- `/registry` retains the same dated ward evidence. Its latest round reports
  5,068 probed doors and 1,994 shape-ready; these do not derive from shop traffic.
- The admin request census scans independent event rows with a cap and retained
  date bounds. It does not use the lossy aggregate request counter as its input.
- `/observatory` reads separate porch counters through the already-bound main
  Worker; all four returned months report `truncated: false`. The per-isolate
  write budget and scan cap remain disclosed. Its reader-class split is a
  classification of requests, not verified identities.
- `/pulse.json` DOES read affected challenge counters and latency buckets.
  Its public method text was stale and now describes the shared writer,
  historical lost samples, background failures, and request-ratio limitations.
  Event-based machinery deductions cannot produce an exact buyer denominator
  from separately counted request totals. No field name or arithmetic changed.
- The hourly counter raise repairs settlement counters from settlement records;
  it cannot repair unpaid request counts. Reclassification writes separate
  correction records and does not overwrite the raw request counters.
- Other best-effort summaries remain: referral counters and bounded client /
  referrer JSON maps still read-modify-write KV. They are separate potential
  undercounting paths, and are not fixed by adding the doors binding. No exact
  visitor or buyer count is inferred from them.

### Authorized daily baseline preservation

The current ten daily shards were preserved at 17:54:56 UTC via `raiseTo`, using
only the higher actually observed counter values. Their resulting sum was 831.
Two saved KV readings had already shown individual shards falling from earlier
readings, so the baseline uses the per-key maximum across both snapshots. No
counter totals were added together and no event-derived number was substituted.
The operation excluded closed days, prior months and financial counters.

The keeper explicitly approved the remaining 1,810 current-period keys: per-item challenges
(organic, house and infrastructure), request channels, venue markers, latency,
errors and refusals. The total scope including the ten daily shards is 1,820.
The first wider request was rejected for missing explicit scope approval and did
not execute. After the keeper approved that exact scope, all 1,810 keys completed
at 19:56:55 UTC. Every returned SQL value met or exceeded both its saved baseline
and current KV reading. A preview connection timeout was retried with the same
idempotent operation. The helper is authenticated, limited to captured keys and
floors, and has no lowering or reset operation. Sales and revenue are excluded.

CI caught a stale test expecting the old settlement wording. Its assertion and
comment now follow deliver-before-settle while retaining the delivery-evidence
limit. The public count register also stops assigning porch limits to challenge
counts, states historical missing samples and mirror lag, and defines null rates
from recorded counts rather than claiming nothing was served. All 57 focused
pulse, blind-spot and published-count checks pass; typecheck passes.

Release still requires the complete CI gate, a fresh baseline preservation around
the legacy-writer cutover, and verification that both live Workers reference the
same namespace. [PR #1016](https://github.com/seancrecord/scvd-general-store-repo/pull/1016)
tracks the final CI, merge, deployment and cutover receipt. This operation preserves
observed floors; it cannot reconstruct historical lost increments or establish
an exact total for requests arriving during the mixed-writer transition.

Local raw handover receipts and public snapshots remain under
`/tmp/scvd-counter-handover`; no visitor-level data is published in this record.

The final HTML sweep also found duplicated pre-delivery wording and unsupported
upper-bound claims in the pulse page and admin porch ratio. Those now state the
same recording limits as the JSON. No arithmetic, classification or counter
values changed in that copy correction.
The final four-file run passes 64 tests and typecheck. Restoring the old HTML
produces two failures (37 pass); restoring the correction restores the tested
source. Full CI remains required on the final commit.

A later CI shard caught the latency disclosure guard requiring the old
last-write-wins mechanism to remain named. The method now names it explicitly
as historical behavior. All 19 specs referencing the pulse report pass locally
(308 checks), and typecheck passes. This includes the latency disclosure guard.
