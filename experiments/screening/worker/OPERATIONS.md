# Screening operational attention and backup gates

Status: local qualification only. The private readings, monitor adapter and
operator display are implemented. No schedule, deployed binding, email,
external heartbeat or backup has been activated.

## What the reading measures

`BudgetStore.attention()` consumes the relevant SQL state synchronously in a
read-only transaction. It reports a timestamp, fixed condition codes, counts,
a held case reference and pair-wide capacity. It returns no lease token,
caller identity, document bytes, provider URL or credentials. It makes no RPC
request to either provider and adds nothing to normal observation calls.

`ATTENTION_LIMITS` in `attention.ts` is the source for qualification thresholds.
The age thresholds and recovery-register warning fraction come from that
object; the register cap comes from `RECOVERY_LIMITS.maxCases`. These are local test choices,
not production policy or proof that an executor has stopped. Production
thresholds and a cadence must be chosen from the qualified reader deadline,
expected operating load and an exercised response procedure.

The conditions are:

- An active admission hold, with a separate aged-hold condition.
- Active reservations at or beyond the age threshold, or without a recorded
  start time. Neither condition releases or expires a reservation.
- Pair-wide paid capacity exhausted, and free allowance exhausted separately.
- Recovery case storage nearing its cap, or full. Documents are not deleted
  or overwritten to make the warning disappear.

Capacity projects the reset that the next reservation would perform when a
new accounting window begins. It does not write that reset; active slots
survive it. Capacity is before the admission hold and caller-specific limits:
a true value does not promise that any particular caller will be admitted.
A full free allowance alone is expected protection of the paid reserve.
Corrupt state, backwards/future timestamps and a missing or inconsistent held
case return unavailable. This checks the state used for the reading; it is
not a full audit of all historical cases or evidence bytes.

## Private access and alert integration

The operator gateway offers authenticated `GET /attention`; the review UI
loads it alongside its other reads and displays a dated snapshot. Failure to
read attention does not prevent an otherwise valid evidence review. A stale
reading is identified when the UI renders again; there is no live countdown
or background polling in the tab.

Bind **only `ScreeningMonitor`** to the future monitoring host. That service
entrypoint exposes `attention()` alone, on the same fixed provider-pair
object as the reader/recovery services. The monitoring host does not need
recovery authority, documents, credentials for the providers, or buyer-tier
selection. The public qualification HTTP handler still returns 404.

`../operator/monitor.ts` supplies `checkScreeningAttention(service, publish)`.
Its host can supply `input => sendAlert(env, input)` using the existing store
alert channel. The adapter bounds the private read, rejects stale/malformed
results and submits fixed prose with stable `worker_health` keys. Initial
holds and free-only exhaustion remain informational; aged holds, aging or
unknown-time reservations, paid exhaustion and register capacity page through
the supplied channel. Unavailable readings have their own stable key.
No private strings returned by the service enter alert prose.

Repeated conditions use the existing channel's deduplication/backoff and
standing alert rows. They do not create a new case-specific key on each poll.
A quiet reading does not close an old alert row; current state must be checked
in the private UI. The adapter reports successful submissions and exceptions
separately, and never claims delivery: `sendAlert` may record locally,
suppress repeated email, or swallow transport errors under its existing
contract. Transport acknowledgement needs separate qualification.

Before activating a schedule:

1. Configure the read-only binding and alert channel on the intended host.
   Keep all test runs on fake deliveries until the destination is confirmed.
2. Pick and exercise the cadence and thresholds, including at capacity and
   during a held review. Keep this work off the buyer/payout request path.
3. Persist a bounded latest-run receipt at the host, distinguishing last
   attempt, last valid reading and last channel submission. Display timestamps,
   not a persistent green flag. This receipt is not implemented here.
4. Independently monitor that receipt's freshness and channel delivery. A
   process that stops running cannot send its own “I stopped” warning. The
   independent watchdog is also not implemented or activated here.
5. Exercise unavailable service, late responses, failed channel submission,
   recovery/cancellation and recurrence. Observe the final destination before
   calling end-to-end notification qualified. Never test by releasing a real
   reservation just because it is old.

The existing alert channel is tested locally here with email disabled: repeated
monitor submissions update the same KV row and perform no external fetch.
No cron or automation was installed by this increment.

## Independent backup and retention acceptance

The current private SQLite retention is the operational copy. Cloudflare's
[SQLite storage API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)
describes point-in-time recovery within the platform; that is not an
independent copy outside the same account and failure boundary.

Before live evidence retention, complete these acceptance gates (local snapshot
and offline restore implementation is recorded below):

- A bounded consistent export of policy, budget state, active reservations,
  review revisions, case history and all retained evidence bytes. Include a
  manifest with counts, digest scheme and exact schema version. Preserve
  opaque references and distinguish secrets/release authority from public
  evidence. Existing overview/history output is not a complete backup.
- An encrypted destination under independently controlled access, with
  documented key custody and recovery. Provider URLs/passwords must not
  enter exported review material. Destination, access policy and retention
  duration still need to be selected; none was provisioned here.
- Restore tests into a disabled, isolated destination: byte/digest integrity,
  missing and extra documents, case/revision linkage, retained holds and
  accounting consistency. Do not give that destination provider access or
  accept buyers while restoring.
- A reviewed reconciliation procedure before reactivation. Restoring old
  state can restore spent credit or an obsolete lease/hold; a successful
  database restore alone cannot justify spending or releasing capacity.
- A verified export before any reviewed retention migration. No deletion,
  reset or automatic expiry is implemented. A full case register blocks new
  reviews rather than silently dropping its history.

Consistent snapshot capture, bounded page export and offline SQLite restore
verification are now implemented and locally tested; see `../backup/README.md`.
The restore database has no live budget tables or activation path. External age
sealing, ciphertext readback and offline open are also locally qualified; see
`../backup/ENCRYPTED_CUSTODY.md`. A private B2 destination and dedicated key now
exist, and a synthetic encrypted sample completed authenticated API readback
and exact recovery September 13. Independent offline-key verification, retention, live
authenticated collection, full-volume qualification
and a production restore/reconciliation drill remain open. A staging snapshot
on the same object is not an independent backup.

## Local verification

Run the isolated Worker suite and typecheck from `README.md`, the private
operator/admin tests and the browser module tests from `../operator/README.md`.
The negative controls must fail their original assertions:

```sh
SCVD_SCREENING_GUARD_MUTATION=attention_rollover node_modules/.bin/vitest run --config experiments/screening/worker/vitest.mutation.config.ts -t 'free exhaustion is distinct'
SCVD_SCREENING_GUARD_MUTATION=monitor_freshness node_modules/.bin/vitest run --config experiments/screening/worker/vitest.mutation.config.ts -t 'reports stale reading'
```

Counts and source/check hashes for this increment live in
`../../../research/qualification-2026-09-11/operational-attention/validation.json`.

## September 13 — host collector ready for deployment qualification

The private snapshot connection, host collector, B2 adapter and one-run/freshness
CLI now have local tests. They are not mounted or scheduled. Source capture
remains on the separate backup authority, and no recovery/admission operation
is available to the collector. Unknown upload outcomes keep the pending snapshot
frozen. [Host collector operations](../backup/HOST_COLLECTOR.md) records the
credential contract, storage cap, crash handling, proposed cadence and remaining
source/deployment/independent-monitor gates. The earlier manual B2 recovery test
remains the only live transfer qualification.
