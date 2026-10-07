# Hourly correction read cost — October 2026

The keeper's Sep 23–Oct 6 statement attributed $29.50 of $34.65 usage cost to
KV reads, projecting $74.25 for the cycle. Account analytics subsequently
showed COUNTERS responsible for 75,838,401 of 77,930,780 reads (97.3%). On
October 5, 75.5% of that namespace's reads fell in minutes 30–39, after the
hourly cron. The correction recount was capped at 200,000 event values per
invocation; live September and October corrections were still incomplete.

At that cap, hourly recounts buy 4.8 million reads/day, or 144 million/month.
Bulk requests are billed per key, so batching does not solve the bill. These
are measured namespace totals and capacity arithmetic, not exact per-function
billing attribution. [Cloudflare KV pricing](https://developers.cloudflare.com/kv/platform/pricing/).

## Repair

The scheduled recount lists event keys by the same fixed ~2.8-hour time slices
used by the day instrument. Each KV page's key names and expiration values
fingerprint a compact R2 cache page. New, deleted or expired keys invalidate
the affected page; new traffic cannot shift every historical page. Event keys
are append-only in `writeEvent`; an intentional in-place edit would need cache
invalidation. Cache schema changes must advance its versioned prefix.

Only outside challenge classification inputs enter the cache. Payer,
signature and purchase-note fields do not. Every pass reruns today's naming
and walk rules over those inputs. Walks can span KV pages, time slices and
warm-up passes; event timestamps need not follow key order. Once a client
qualifies within a pass, its touches can be discarded and its count retained,
reducing memory without changing the month-wide rule.

The primary event-value read budget is 20,000 keys/pass, one tenth of the old
ceiling. Storage retries can add physical attempts. Saved pages are the
checkpoint: cache warm-up and interrupted invocations resume without buying
unchanged input reads again. A 2,000-list-page guard remains; a reached guard,
unreadable row or exhausted warm-up budget makes the scan incomplete.
Corrections for months partly outside event retention also remain incomplete.
Partial months are withheld by the existing public consumer gate.

`metric:corrections.scan` and `/pulse.json` publish aggregate read work and
completeness. The HTML pulse says when the scan is incomplete, instead of
calling the latest attempt a completed walk. Cache objects are cleaned in
bounded, resumable pages once their last source expiration passes. Rotating
cache slots also prevent an unbounded series of historical partitions.

## Cost and validation limits

An unchanged warmed scan needs zero KV event-value reads. It still pays for
KV listings and R2 operations. Actual savings depend on cache warm-up, new
traffic, retries and other jobs; the store's total bill is not promised to
fall by the same percentage as this job's read budget.

Tests compare cached and reference recounts, cross-page/cross-pass walks,
changed classification rules, new/deleted/expired events, unreadable inputs,
budgeted progress, failed R2 writes, and expired cache cleanup. Removing the
source repair makes all nine initial cache regressions fail; removing the
public-status repair also fails its new assertion. The final 69 focused
checks, typecheck, production bundles and scalability audit pass. The full
local run completed with 879 files / 16,120 tests passing and one pre-fix
storage-write guard failure. The explicit R2 binding repair passed its focused
checks; all four CI shards and the required check then passed on the final
commit. PR #994 merged October 7 and deployed at 19:41 UTC; both Worker builds
and the post-merge full suite passed.

A bounded run against production storage saved a fresh correction with 20,000
event-value reads, 860,752 listed keys and 1,347 list pages in 523.81 seconds.
The public pulse exposes those aggregates and correctly marks the scan
incomplete. This is cache warm-up, not a measured reduction in the monthly bill.

The 20:30 UTC scheduled invocation still failed: analytics report 899.9942
seconds wall time and 2.906869 seconds CPU, consistent with the scheduled
15-minute duration limit. Its health check started, but it did not save a new
correction. The timing is evidence of a duration problem, not identification of
the particular blocked job. Detailed saved logs remain needed for that.

The latency follow-up reuses a complete cleanup inventory to skip reads of
cache pages that do not exist yet. It adds no listing pass. A truncated listing
or a continuation cannot establish absence, so those retain the direct lookup.
The new regression fails without the repair (three missing-page reads instead
of zero), and all 24 cache, reference-recount and storage-write checks pass.
Full CI and live verification remain the release gates for this follow-up.
