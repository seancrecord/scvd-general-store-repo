# Worker recovery readback — October 8, 2026

## KV usage and original alarms

Cloudflare analytics read at 17:31 UTC, comparing the same 00:00–16:59 UTC
hours on October 6 and October 8:

| Account-wide KV operation | October 6 | October 8 |
| --- | ---: | ---: |
| Reads | 4,149,682 | 1,418,780 |
| Writes | 80,553 | 68,238 |
| Lists | 34,614 | 43,602 |

Reads fell 65.81%. These are usage observations, not a new invoice or a
guarantee that total charges will fall by the same percentage. Lists rose.
The correction with scan clock 16:30:28 UTC read 19,996 event values, listed 882,244
keys across 1,408 pages, and reused 396 cached pages. It remained incomplete;
the cache still needs further hourly passes before complete totals publish.

The preceding 20 hours of Worker analytics recorded 45,181 successful
invocations, 183 client disconnections and zero counted errors. The alarm
log read later that hour contained no October 8 repeats of the original
page-error alarms. It did contain an active World bank-walk failure below.

The scheduled-invocation dataset omitted 13:30, 14:30 and 15:30 UTC, even
in a narrowed query below its row limit. The hourly trigger was present,
last modified at 00:37 UTC; no deployment coincided with the gap. The
16:30 invocation succeeded, and the bank-walk result proves the 17:30
run reached that job. Missing history does not establish whether those
three jobs failed to fire or their records are missing. Coverage is unresolved.

## World bank walk

The 17:31:22 UTC saved result reported `ran: false`, `failed: true`, and an
`eth_getLogs` HTTP 400 after provider rotation. The progress marker was
36,069,908; the live provider heads were about 3,000 blocks ahead, within
the walk's recovery window. This is a failed observation, not evidence of
missing payments or of a clean reconciliation.

Read-only probes used the native USDC contract, a zero-recipient Transfer
filter and the stalled block range. Tenderly answered 500 blocks; dRPC and
Alchemy returned HTTP 400. Alchemy explicitly stated a 100-block maximum.
dRPC's error named a different limit inconsistent with the submitted range,
so that text does not establish its actual cap. All three providers answered
100 blocks successfully. No payment or production progress-marker write
was made by these probes.

The repair sets World's existing `logSpan` to 100. The existing derived
catch-up budget then permits 36 passes, covering 3,600 blocks per hourly
run against the configured 1,800-block hourly cadence. The regression
models providers refusing wider ranges and requires a 3,000-block backlog
to be read contiguously, both inbound and outbound, before the cursor reaches
the head. It failed against the old 500-block setting with `ran: false`.
With the repair, all 54 focused reconciliation/RPC tests, typecheck,
production bundle checks and the scalability audit passed. The final
regression also passed after its catch-up assertion was tied to the shared
budget constant. Full CI remains the merge gate.

PR #999 merged at 18:19:34 UTC after all four CI shards and `check` passed.
Both production builds passed; version `01526676-7dae-431a-919b-49dbaf5eeadd`
deployed at 18:20:20 UTC. The 18:31:07 saved World result reported `ran: true`
and covered blocks 36,069,909–36,073,508; its cursor advanced by 3,600 blocks.
The first readback was 812 blocks behind the head. This saved result contains
no transfer findings, so it proves reader progress rather than matched payments.
The standing alarm's last repeat remained 17:31:22 UTC. All five originally
reported page paths returned HTTP 200 after deployment.

## Cache pagination follow-up

The 18:30 invocation completed with outcome `ok`, no runtime exceptions,
2,505 ms CPU and 787,985 ms wall time. That leaves limited headroom before
the 15-minute duration limit. Its correction record has `computed_at`
18:30:10 UTC (the scan's clock, not its completion time), 19,983 event-value
reads, 883,393 listed keys, 1,366 list responses, **41 reused pages**, and
`complete: false`. Reuse had been 419 pages in the preceding reading.
Steady cache warm-up is therefore not established by the earlier rising counts.

The cache used each KV response as a page boundary. Cloudflare explicitly
permits short and even empty continuation pages, including while deleted or
expired keys are being traversed: [KV list contract](https://developers.cloudflare.com/kv/api/list-keys/).
Its response boundary is not a stable identity for unchanged live keys.
A regression reproduced the failure with the same 1,002 keys split differently:
a warmed cache and zero new-value budget returned no correction instead of
the previously complete result. The actual cause of every production miss is
not instrumented; this proves a cache defect compatible with the observed drop.

The follow-up packs the sorted live keys into fixed-size cache pages within
each existing time slice, carrying short responses and empty continuations
forward. Only the final page of a completed slice may be short. It retains
the existing fingerprints, expiration checks, classification inputs and read
budgets. At most two list pages are buffered; hitting the list budget drops
an unfinished tail and marks the scan incomplete. Previously saved pages remain
usable whenever their exact keys and expirations match a canonical page.

The new regressions cover boundary changes with zero new event reads and
refusal to cache an unfinished short page when listing stops at its budget.
Both failed against the old implementation; all 63 focused cache/correction,
classification, pulse and bulk-read tests pass with the repair. Typecheck,
production bundles, scalability audit, docs check and whitespace check passed.
Production cache reuse and runtime still need readback after this follow-up ships.
