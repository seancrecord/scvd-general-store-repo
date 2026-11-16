# Worker failure follow-up — November 16, 2026

Reviewed all 212 retained `worker_health` emails (July 22–November 16)
through the keeper's Mail app. The private export stays outside this repo.
These are delivered notices, not a complete invocation log: alert dedupe
and process termination can both prevent an email.

## Still live after the corpus repair

Cloudflare invocation `3c5bc32f578edb2baf77f6583dbd6ed8`, scheduled for
2026-11-16 15:30 UTC, ended `exceededMemory`: CPU 2863 ms, wall 48309 ms,
script version `be1c435a-752a-482d-8a28-6bab24ec21e1`. The higher CPU limit
and separate corpus sweep had deployed; they did not fix hourly memory.

The handler eagerly started every `waitUntil` promise. The archive,
reconciliation, directory and desk sweeps therefore allocated in the same
isolate at once. They now register deferred jobs, run one at a time, and
log starts/completions/failures by job name. An unexpected import rejection
pages by name and cannot discard later jobs. Existing per-service alerts
remain. This bounds overlap between jobs; it does not raise the isolate's
memory limit or establish which individual allocation caused the old kill.
The separate public-statistics trigger still returns before these jobs.

The ward dead-man check also hydrated the entire latest R2 host array to
read only `at`. It now reads that date from KV. An unavailable host archive
can no longer suppress the stale-round warning.

## Email triage

- Nine expired-request-promise HTTP failures, last 14:07 UTC today:
  the payment-stack sync fix in #1080 is deployed. Reuse is now a completed
  boolean, never an in-flight promise from another request.
- Base KV PUT 429 once today, and World three times November 7–12:
  #1081 paces repeated reconciliation commits and adds key names to exhausted
  KV write errors. The old events have no key; attribution is unavailable.
  Base completed again at 15:30 UTC. The old Base alarm still has one repeat.
- Thirty raw R2 internal errors, nine dropped connections, one R2 read-rate
  error, and seven exhausted R2 retry errors: the existing `r2-read.ts`
  wrapper retries documented transient classes and groups exhausted notices.
  The latest delivered R2 exhaustion was November 11. Exhaustion remains an
  honest failure, not grounds for fabricating a missing corpus host.
- Two older memory-limit HTTP failures and the current hourly kill warrant
  memory discipline; the current patch addresses concurrent scheduled jobs.
  It does not claim that every public archive reader is now memory-bounded.
- Eighteen RPC stalls and ten skipped-range notices record provider failures
  and historical gaps. Current cursors/results must be checked separately;
  an old mail does not establish a continuing stall. Old holes are not erased
  or marked repaired by this scheduler change.
- Three old malformed-input/product failures (`/a2a` null part, `/mcp` URL,
  missing attestation sheaf) have no delivered repeat after September 7. Null parts and the missing
  sheaf have explicit regression coverage in the current tree. The old URL
  event carries no input; its precise trigger cannot be reconstructed.
- Remaining notices are sent-note review findings, directory observations,
  throttled failed logins, obsolete sample-key notices, the test lever,
  old temporary KV/provider faults, and overdue-round notices. They are not
  instructions to send letters, buy listings, rotate secrets or suppress alarms.

The 15:30 corpus alarms reached email by week. W44 remains absent in KV;
W45/W46 exist and the signed chain remains at sequence 14 / W43. The keeper
confirmed W44 recovery in another session. No manual snapshot or latest-round
freeze was run, and later automatic seals remain blocked behind W44.

## Regression evidence

- `scheduled-jobs.spec.ts`: a held archive job prevents later ledger/watch
  jobs from starting; peak active jobs is one. The concurrent implementation
  failed (three started). It also verifies continuation after a failed job
  and failed alert delivery, and production deferral/draining.
- `health-ward-read-budget.spec.ts`: a KV-backed date check performs zero R2
  reads and still pages a stale round when R2 is unavailable. The old reader
  fetched R2 and suppressed that warning.
- The production source was stashed while the new tests remained: both the
  scheduler wiring and ward read-budget regressions failed, then the source
  was restored. Existing ward, corpus schedule and traffic cadence tests pass.
