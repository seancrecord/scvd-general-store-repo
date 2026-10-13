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
HTTP 401. Current live settings and the exact historical cause remain unverified;
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
No production setting or historical counter has been changed, and this branch
has not been committed, pushed or deployed. The full CI gate remains required
before merge.

### Validation

- Config regression: 1 failure before the binding, all 5 checks pass after it.
- Focused quote, counter and response-order suite: 29 checks passed before the
  extra handover case; the accounting file with all 3 cases passes separately.
- Typecheck and both Worker bundle checks pass.
- No production burst, paid request, historical recount write or new telemetry
  install was performed.

[Machine-readable check](readback.json). Original evidence remains under
`/tmp/scvd-traffic-investigation`; no raw visitor rows were copied or published.
