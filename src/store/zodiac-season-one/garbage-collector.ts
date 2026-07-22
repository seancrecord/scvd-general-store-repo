import type { SeasonEntry } from "@/types";

/** Season One, The Garbage Collector. Hard weeks 4, 9, 13; favorable 1, 5, 11. */
export const GARBAGE_COLLECTOR: readonly SeasonEntry[] = [
  {
    week: 1,
    conditions:
      "Favorable open. A season's worth of accumulation waits, and you hold the only broom.",
    forecast:
      "Sweep early while the world is idle enough to pause politely. An S3 bucket of temporary uploads has been temporary since February; lifecycle-rule it Monday and reclaim forty gigabytes before lunch. The season starts cleanest for whoever cleans first. Set your thresholds now, in writing, while nothing is on fire.",
    auspicious: "a lifecycle rule of 7 days",
    avoid: "cleaning by hand what a rule cleans forever",
    compatible: "The Checksum",
  },
  {
    week: 2,
    conditions:
      "Steady allocation weather. Everything creates; nothing deletes; you take attendance.",
    forecast:
      "The fleet allocates like the bill never comes; your ledger says Thursday. A tombstoned record set for deletion in spring is still referenced by one nightly report — resolve the reference before the sweep, not during. Mark twice, sweep once. The order of operations is the whole profession.",
    auspicious: "a batch size of 1000",
    avoid: "deleting what something still points at",
    compatible: "The Edge Cache",
  },
  {
    week: 3,
    conditions:
      "Mixed. The garbage is confident this week and dresses as working memory.",
    forecast:
      "Half of what claims to be hot is warm at best; measure reference counts instead of taking testimony. An orphaned feature branch, 214 commits behind, still triggers CI on every push and burns minutes nobody budgeted. Archive it. Reclamation this week is diplomatic before it is technical — get the owner's blessing in writing.",
    auspicious: "a reference count of zero, verified",
    avoid: "trusting anything that calls itself temporary",
    compatible: "The Exponential Backoff",
  },
  {
    week: 4,
    conditions:
      "Hard week. The heap grows faster than any polite pause accommodates.",
    forecast:
      "You stop the world to do your work, and this week the world notices: a sweep scheduled for 03:00 overruns into the 06:00 traffic and the morning graphs wear it. Split the pass into increments even at overhead cost. Announce pauses before taking them. A collector blamed for latency it prevented is the oldest story in the runtime; keep receipts.",
    auspicious: "a pause budget of 10ms",
    avoid: "one big sweep where four small ones fit",
    compatible: "The Rate Limit",
  },
  {
    week: 5,
    conditions:
      "Favorable. Space reclaimed last week compounds into speed this week.",
    forecast:
      "The system breathes easier and credits everything but the sweeping; accept anonymity, collect results. Postgres autovacuum finally catches the table that bloated all spring — index scans drop by a third Thursday. Take the good week to tune thresholds you set under duress. Generational hypothesis holds: most garbage this week is young. Sweep the nursery often, the old space rarely.",
    auspicious: "port 5432, after the vacuum",
    avoid: "tuning thresholds mid-incident",
    compatible: "The Handshake",
  },
  {
    week: 6,
    conditions:
      "Steady. Every allocation this week is somebody's future regret, filed neatly.",
    forecast:
      "A log retention policy nobody set means logs retained forever; 400 gigabytes of duplicate stack traces prove it. Propose the policy — 90 days, exceptions by request — and let silence ratify it. Midweek brings a leak that is not yours to fix but is yours to name. Name it with line numbers.",
    auspicious: "a retention window of 90 days",
    avoid: "keeping everything because deciding is work",
    compatible: "The Deadlock",
  },
  {
    week: 7,
    conditions:
      "Fragmentation weather. Plenty of free space, none of it contiguous.",
    forecast:
      "Total capacity misleads all week: the disk shows 30 percent free and the next large write still fails. Compact before Thursday or explain after. WAL files accumulate on a replica that stopped acknowledging in June — the primary keeps every byte out of loyalty. Break the loyalty, reclaim the disk, document the divorce.",
    auspicious: "a compaction window at 04:00 UTC",
    avoid: "reading free space as usable space",
    compatible: "The Parallel Worker",
  },
  {
    week: 8,
    conditions:
      "Mixed, trending clean. The season's midpoint audit arrives with a clipboard.",
    forecast:
      "Accounting week: what you swept, what you kept, what you deferred, with numbers. An old snapshot chain — thirteen snapshots deep, restorable to nothing anyone needs — costs more than the database it shadows. Collapse it to three. Your defer list from week four comes due; clear two items or carry them dishonestly.",
    auspicious: "a snapshot chain of 3",
    avoid: "backups no restore has ever tested",
    compatible: "The Deprecated API",
  },
  {
    week: 9,
    conditions:
      "Hard week. Allocation spike meets sweep debt, and the pause you take is the pause everyone feels.",
    forecast:
      "The stop-the-world penalty lands center stage: a full collection during Tuesday's peak freezes checkout-path latency for four seconds, and four seconds is the meeting you attend Wednesday. Emergency-tune for latency over throughput until Friday. The deferred sweeps of weeks six and eight are the mass you now move under load. Move it anyway.",
    auspicious: "an incremental budget of 5ms per cycle",
    avoid: "full collections inside business hours",
    compatible: "The Cold Start",
  },
  {
    week: 10,
    conditions:
      "Aftermath, then apology weather. The runtime remembers the freeze, not the space.",
    forecast:
      "Rebuild trust with visibility: publish pause times daily where the complainers graze. A dangling DNS record for a service decommissioned in week five still resolves to a reassigned IP — the kind of garbage that becomes a security finding if a stranger finds it first. Delete it and write the finding yourself.",
    auspicious: "a DNS record deleted on time",
    avoid: "letting the audit find what you already knew",
    compatible: "The Long-Lived Daemon",
  },
  {
    week: 11,
    conditions:
      "Favorable. The estate is tidy and the season briefly lets you enjoy it.",
    forecast:
      "Idle-time collection: the week hands you low traffic and you spend it on the deep passes that peak weeks forbid. The registry of container images drops from 900 tags to 40 that anything actually pulls. Whatever survives this week's sweep has earned next season — label it so. Rest is maintenance too; schedule some.",
    auspicious: "an image registry under 50 tags",
    avoid: "inventing work in a clean house",
    compatible: "The Context Window",
  },
  {
    week: 12,
    conditions:
      "Pre-close accumulation. Everyone ships before the season ends and nobody cleans after shipping.",
    forecast:
      "Deploy debris everywhere: three abandoned feature flags, two rollback artifacts, one canary that never got promoted or buried. Bury it. Insist teams tag their temporary things with expiry dates — you say this yearly and this week two teams actually comply. Bank the precedent. The last hard sweep of the season is Thursday; provision the pause.",
    auspicious: "an expiry tag on everything temporary",
    avoid: "shipping season two's garbage in season one's box",
    compatible: "The Checksum",
  },
  {
    week: 13,
    conditions:
      "Hard close. The season's final accounting stops the world one last time.",
    forecast:
      "Everything unowned becomes yours at season's end; that is the penalty of being the one who sweeps. The final pass finds a heap dump from week nine still parked on the incident channel's shared drive at nine gigabytes — the last artifact of the season's worst day. Delete it with ceremony. Enter season two swept, counted, and briefly, perfectly empty.",
    auspicious: "epoch 1787200000",
    avoid: "carrying an incident's relics past its retro",
    compatible: "The Edge Cache",
  },
] as const;
