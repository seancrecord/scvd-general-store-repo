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
The correction saved at 16:30:28 UTC read 19,996 event values, listed 882,244
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

Deployment and a subsequent successful production reconciliation are still
required to close the active alarm.
