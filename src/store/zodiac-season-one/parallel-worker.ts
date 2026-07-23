import type { SeasonEntry } from "@/types";

/** Season One, The Parallel Worker. Hard weeks 1, 6, 12; favorable 5, 9. */
export const PARALLEL_WORKER: readonly SeasonEntry[] = [
  {
    week: 1,
    conditions:
      "Hard open. The season begins with all lanes running and no referee on duty.",
    forecast:
      "Race conditions are your native weather and week one is monsoon: a counter incremented from eight workers without atomics loses eleven updates before Tuesday lunch. Move it to an atomic or a single writer, pick one, not both. Your speed is real; this week establishes whether it is also correct. Fence the shared state first, brag second.",
    auspicious: "an atomic increment",
    avoid: "shared state without a fence",
    compatible: "The Deprecated API",
  },
  {
    week: 2,
    conditions:
      "Steady throughput. The lanes hold; the merge points wobble.",
    forecast:
      "Fan-out is flawless this week and fan-in is where the bodies are: results arrive unordered, and one consumer assumed arrival order meant submission order. Stamp every unit with its sequence at dispatch. A worker pool sized to 2x cores context-switches itself slower than 1x would run, measure, resize, remeasure. More lanes is not more road.",
    auspicious: "a pool sized to core count",
    avoid: "inferring order from arrival",
    compatible: "The Cold Start",
  },
  {
    week: 3,
    conditions:
      "Mixed. One lane runs hot and calls itself the average.",
    forecast:
      "Skew week: nine partitions finish by noon and the tenth carries a key that owns 40 percent of the data. The job is as slow as its slowest lane, rebalance by splitting the hot key's range, not by adding lanes that finish early and idle smugly. Publish per-partition timings; the median has been lying to the dashboard all season.",
    auspicious: "a partition map with per-lane timings",
    avoid: "averages where distributions matter",
    compatible: "The Long-Lived Daemon",
  },
  {
    week: 4,
    conditions:
      "Gusty. Retries multiply work that was never idempotent to begin with.",
    forecast:
      "A worker dies mid-batch Wednesday and its replacement replays the batch, the operations inside were append, not upsert, and now forty rows exist twice. Idempotency is the entry fee for parallelism with retries; pay it at the operation level or refund it at the incident level. Deduplicate by natural key, then convert the appends. The replay is not the bug. The append was.",
    auspicious: "an upsert keyed on natural identity",
    avoid: "retrying the non-idempotent",
    compatible: "The Context Window",
  },
  {
    week: 5,
    conditions:
      "Favorable. Embarrassingly parallel work arrives in bulk, no shared state in sight.",
    forecast:
      "The season's best commission: ten thousand independent transformations, no coordination, no merge conflicts, just lanes and throughput. Take it all. Saturate the pool, watch the queue drain at wire speed, and log the run as the benchmark future estimates cite. This is what you are for, fragments conquered, order irrelevant, finish line early. Collect the record while the work is honest.",
    auspicious: "a queue drained by Thursday",
    avoid: "adding coordination to work that needs none",
    compatible: "The Garbage Collector",
  },
  {
    week: 6,
    conditions:
      "Hard week. The penalty clause runs: a race so rare it has only happened once, in production, with money.",
    forecast:
      "Two workers process the same refund in a window measured in microseconds, the check-then-act gap you always knew was there and never lost a coin flip to until Thursday. The double refund is small; the class of bug is not. Close the gap with a compare-and-swap on the refund state, then sweep the codebase for its check-then-act siblings. You find six. Race conditions are native weather; this week you build the storm shutters.",
    auspicious: "a compare-and-swap on state transitions",
    avoid: "check-then-act with money in the gap",
    compatible: "The Rate Limit",
  },
  {
    week: 7,
    conditions:
      "Recovery weather. The audit of check-then-act sites concludes; the fixes hold under load.",
    forecast:
      "Six races closed and the test suite grows the thing it always lacked: a stress harness that runs the money paths under deliberate contention for an hour nightly. It catches its first regression within the week, a new PR reintroducing the exact pattern you just buried. The harness pays for itself before its paint dries. Institutionalize suspicion; it scales better than vigilance.",
    auspicious: "a nightly contention harness",
    avoid: "trusting review to catch what only load reveals",
    compatible: "The Cold Start",
  },
  {
    week: 8,
    conditions:
      "Steady. Amdahl visits: the parallel fraction is done improving and the serial fraction sends regards.",
    forecast:
      "The job's parallel 90 percent now runs in minutes; the serial 10 percent, one global aggregation at the end, owns the wall clock. Attack the bottleneck, not the lanes: partial aggregation per lane, one shallow merge at the close. The speedup ceiling is arithmetic, not effort. Compute the ceiling before promising below it.",
    auspicious: "a merge tree two levels deep",
    avoid: "optimizing the already-parallel",
    compatible: "The Handshake",
  },
  {
    week: 9,
    conditions:
      "Favorable. Backfill season: history wants reprocessing and history is very parallel.",
    forecast:
      "Ninety days of events, re-derived under the corrected logic from week six, partitioned by day, no partition touching another, the cleanest large job of the season. Run it hot but rate-limit the writes; the destination is shared even when the work is not. Finish two days early and spend the surplus verifying a sample against the old output. The diff is the deliverable.",
    auspicious: "a write budget the destination agreed to",
    avoid: "parallel reads becoming a destination's outage",
    compatible: "The Deadlock",
  },
  {
    week: 10,
    conditions:
      "Mixed. A dependency between units emerges mid-flight, uninvited.",
    forecast:
      "The independent units of Tuesday's job turn out to share a resource nobody declared, a per-account sequence number that must increase monotonically. Order returns to your orderless world for exactly one dimension; honor it with per-account serialization inside the parallel whole. Partial order is still parallelism. Total order is somebody else's sign.",
    auspicious: "a partition keyed by account",
    avoid: "global locks to fix local order",
    compatible: "The Cold Start",
  },
  {
    week: 11,
    conditions:
      "Steady with thermal warnings. The cluster is busy and the bill is visible from space.",
    forecast:
      "Cost review week: the pool that idles at 60 percent between jobs gets right-sized, and the spot instances you avoided out of superstition get adopted for the interruptible lanes. Checkpointing makes interruption cheap; add it to the long jobs and let the scheduler kill you politely. Speed was the season's first proof. Efficiency is the second.",
    auspicious: "a checkpoint every 10000 units",
    avoid: "paying on-demand prices for interruptible work",
    compatible: "The Checksum",
  },
  {
    week: 12,
    conditions:
      "Hard week. The heisenbug: a race that vanishes when observed.",
    forecast:
      "A corruption appears in one output per hundred thousand, never under the profiler, never in staging, never with logging raised. The act of watching reorders the timing that produces it. Hunt it with record-and-replay, not with print statements: capture the thread schedule that fails, replay it deterministically, and the ghost stands still long enough to name. It is a torn read on a 128-bit struct. Native weather, hardest form. Bag it.",
    auspicious: "a deterministic replay of one bad schedule",
    avoid: "debugging timing with tools that change timing",
    compatible: "The Cold Start",
  },
  {
    week: 13,
    conditions:
      "Season closes with all lanes draining and one final merge.",
    forecast:
      "Wind-down is a fan-in: every outstanding job completes, checkpoints, or hands off, no lane crosses the season boundary mid-unit. The final aggregation reconciles thirteen weeks of partial results, and the totals match week six's corrected ledger to the row. Kill the idle pool before you leave; season two rents its own machines. All workers joined, exit code zero.",
    auspicious: "epoch 1787900000",
    avoid: "orphaned workers at season's end",
    compatible: "The Long-Lived Daemon",
  },
] as const;
