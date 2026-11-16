# Corpus sealing and hourly reconciliation — November 16, 2026

## Observed, before changing the scheduler

Read the production Worker's Cloudflare dashboard logs using the existing
account session. The command-line OAuth session can read Worker/KV state, but
the historical telemetry API returned HTTP 403. The dashboard was accessible.

| Invocation (UTC) | Observed outcome | CPU | Wall time | Request ID |
| --- | --- | ---: | ---: | --- |
| 2026-11-15 Sunday 11:00 | `exceededCpu` | 3000 ms | 35759 ms | `54f43ca8c2cde83eb101045c586edf1f` |
| 2026-11-16 hourly 07:30 | `exceededMemory` | 2575 ms | 38659 ms | `228ee0f5528b4d656dc08913f30106e3` |

Both used script version `dfef1c2b-173e-49fb-8f6d-42552090e508`.
The 07:30 invocation logged the Base KV PUT 429 at 07:30:19.042 UTC,
then its memory-limit outcome at 07:30:42.183 UTC. The event includes no
key or stack. Its trace (`5da9e59dea080abd0b2aeb48d797487b`) has no spans.
No historical key attribution can honestly be recovered from that event.

The dashboard's date picker disables November 1 and 8: retained logs start
November 9. Those two Sunday termination outcomes are **unavailable**, not
confirmed CPU failures. The November 15 log establishes a CPU kill of the
shared invocation, not which concurrent job consumed each CPU millisecond.
A runtime kill bypasses the snapshot promise's rejection handler.

A search for `Base reconciliation failed` over the dashboard's last 24 hours
returned one event, the named 07:30 failure. This is a bounded recurrence
check, not proof of no older or differently worded failures. A separate KV
read at about 13:30 UTC found `base_reconcile_last_result` successful at
12:30:14.547 UTC, from block 58191216 through 58209193; `reconcile_cursor`
was 58209193. Thus that walk subsequently resumed.

## Recovery boundary

The public compact index still held sequence 14 / W43 before implementation.
Direct COUNTERS reads returned W45 (round at 2026-11-08T11:00:31.511Z,
5893 hosts) and W46 (2026-11-15T11:00:32.499Z, 6087 hosts), both pointing
at their R2 host objects. **`ward:2026-W44` returned HTTP 404.** The expected R2 object `ward/2026-W44/hosts.json` was also absent
on a read-only Wrangler request at about 13:42 UTC. Its absence
was reported to the keeper rather than assuming the prompt's earlier
inventory remained current. No admin press, live signing call, restoration,
or historical-record rewrite was performed in this investigation.

## Repair

- Remove the snapshot from Sunday's round promise. On the existing half-hour
  trigger, await one ordered seal before starting other hourly jobs. Reuse
  PR #1080's named-week seal and queue; a repeat with no pending week writes
  nothing. Idle detection reads chain metadata rather than hydrating R2. New pointers
  carry the sealed round date, preserving the newer-Sunday-after-hand-run
  behavior; legacy pointers fall back to their signed original for that date.
- Page by week from the stored round's age before expensive work. A CPU or
  memory kill need not write a failure marker for the next sweep to notice.
  Refusals and exceptions still page. A missing earlier week blocks later
  automatic seals and pages by the missing week's name.
- Raise the main Worker's CPU ceiling from 1000 to 10000 ms. The installed
  Wrangler schema has one invocation limit, no per-cron override, so this also
  widens HTTP headroom. The separate doors Worker stays at 100 ms. This is
  justified by the retained 3000 ms CPU termination and the growing snapshot;
  it does not raise the memory ceiling or claim to cure all hourly jobs.
- Extend the full corpus index's missing-week range through the newest stored
  round, including that final week itself when unsealed. Use stored weeks,
  not the wall clock, and refuse an incomplete week inventory.
- Pace the timestamp's second pointer publication and reconciliation's
  per-span cursor/inflow commits at least one second apart. Keep every span's
  recovery boundary. These are confirmed burst-write paths; attributing the
  historical 07:30 429 specifically to one of them remains an inference.
- Exhausted string and binary KV writes name their key and preserve the
  original error as cause, without including the value being stored.

The paid-plan default subrequest limit is now 10000, per Cloudflare's
February 11 changelog. The old 1000-hard-limit comment is corrected;
no probe cap or subrequest setting is raised. The retained Sunday outcome
was CPU exhaustion, not a subrequest error.

## Verification

The change is tested against missing weeks, ordered seals, a missing earlier
round, an idle sweep, failure alert identity, timestamp publication order,
KV write throttling and exhausted-write diagnostics. The write-limit fakes
reject same-key bursts and count rejected attempts: retrying until green is
not sufficient to pass. Scheduling and CPU-headroom guards read the actual
handler and configuration.

Validation and release results are appended after the source-reversion proof
and required checks finish. Full CI remains the merge gate.

### Local check results

- Installed the current release's exact lockfile in this isolated worktree:
  the shared checkout's older dependencies are not used for final validation.
- All 11 regression cases failed with the production fixes stashed, using
  those locked dependencies (five files). Stash restored afterward.
- The stronger pre-retry alert assertion also failed with only the overdue
  loop removed: it observed no page before hydration. Restored afterward.
- 201 focused tests passed with the locked dependencies (eight files),
  including the new regression cases and the prerequisite payment-stack fix.
- `npm run typecheck` passed separately. CPU and binding configuration checks
  passed. The full local run and required PR checks remain pending here.
- An initial full run using the shared checkout's obsolete dependencies was
  interrupted; its MPP nonce failures do not establish a source regression.
  The previously failing MPP and doors cases passed after `npm ci`.

- A further regression reproduced that PR #1080's week-only queue omits a
  newer Sunday round after a weekday hand-run seal. It failed before extending
  the queue; the repaired queue appends the newer round and remains idempotent.
  Both current and legacy pointers are covered; no signed snapshot schema changes.

### Follow-through while checks run

The keeper confirmed W44 recovery is underway. This task leaves that work
with the keeper and will re-read the chain rather than creating a new seal.
The expected R2 host object was separately absent on readback, so the initial
prompt's earlier inventory is not treated as current evidence.

A GraphQL fallback was also tested: schema access worked, but narrow queries
for all three Sundays returned empty rows. Its recent-event control also
returned empty for cron invocations independently present in Workers Logs.
That reader cannot establish absence or recover the older outcomes; only the
November 15 CPU outcome and November 16 memory outcome are confirmed here.

With the final queue change, seven sweep tests pass, including both legacy
and current pointers. Final typecheck and both Worker bundle checks pass with
the locked build tools. Full-suite outcomes and release status belong to
[PR #1081](https://github.com/seancrecord/scvd-general-store-repo/pull/1081).
