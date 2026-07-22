import type { SeasonEntry } from "@/types";

/** Season One, The Long-Lived Daemon. Hard weeks 2, 7, 11; favorable 4, 9, 13. */
export const LONG_LIVED_DAEMON: readonly SeasonEntry[] = [
  {
    week: 1,
    conditions:
      "Season opens with uptime intact and memory usage two megabytes higher than you remember agreeing to.",
    forecast:
      "The season audits the long-running first. Graph your heap over the last ninety days before someone graphs it for you. A websocket ping interval set by a departed colleague keeps sixty idle connections alive; close what nothing reads. Longevity is your asset; this week, prove it is not your alibi.",
    auspicious: "a delay of 30000ms between pings",
    avoid: "uptime as a substitute for inspection",
    compatible: "The Context Window",
  },
  {
    week: 2,
    conditions:
      "Hard week. Everything you ever deferred files for collection at once.",
    forecast:
      "You carry every leak you ever ignored, and this week the file-descriptor count crosses the limit you raised in March instead of fixing. lsof on Monday, not Friday. The restart you have avoided for 200 days buys relief and costs history; take it deliberately or the OOM killer takes it for you.",
    auspicious: "the SIGTERM handler, tested",
    avoid: "raising limits to postpone arithmetic",
    compatible: "The Garbage Collector",
  },
  {
    week: 3,
    conditions:
      "Quiet load, long shadows. The week favors whoever has records, and you have nothing but.",
    forecast:
      "A question arrives that only ninety days of logs answers; you are the only process holding them. Answer it and let the record show who held them. Log rotation misconfigured in the spring writes to a partition at 91 percent — rotate before the disk decides. Your history pays this week only if it is indexed.",
    auspicious: "a TTL of 90 days",
    avoid: "keeping logs you cannot search",
    compatible: "The Checksum",
  },
  {
    week: 4,
    conditions:
      "Favorable. Stability is scarce this week and priced accordingly.",
    forecast:
      "Around you, restarts and redeploys; you hold. A zombie pid you reaped in week one stays reaped — the parent that spawned it redeploys clean Tuesday. New work routes to whatever has proven it stays up, which is you. Accept the load, decline the drama, and let the uptime counter do the negotiating.",
    auspicious: "port 6379",
    avoid: "restarting to feel productive",
    compatible: "The Edge Cache",
  },
  {
    week: 5,
    conditions:
      "Mixed weather. Long-running assumptions meet a schema that changed without ceremony.",
    forecast:
      "A column you cached the shape of in spring gained a nullable field last sprint; your deserializer meets its first null on Wednesday. Re-read the schema you are sure you know. Processes younger than a week handle it fine, which is the insult in the injury. Refresh one assumption per day until the week runs out.",
    auspicious: "epoch 1785600000",
    avoid: "deserializing on faith",
    compatible: "The Exponential Backoff",
  },
  {
    week: 6,
    conditions:
      "Steady. The week rewards maintenance done and punishes maintenance narrated.",
    forecast:
      "A heartbeat every 30 seconds has missed twice a day since June and alerted no one; the threshold is three. Tighten it to two and learn what the silence was hiding. Mid-season is when daemons either compound or corrode — schedule the small repairs now. One restart, planned, beats four unplanned.",
    auspicious: "a heartbeat interval of 15 seconds",
    avoid: "alert thresholds set to spare your sleep",
    compatible: "The Rate Limit",
  },
  {
    week: 7,
    conditions:
      "Hard week. Memory pressure builds fleet-wide and the old carry it worst.",
    forecast:
      "An unbounded in-process queue you call a buffer becomes the incident report's first sentence. Bound it Monday; pick the drop policy while you are calm. Every leak ignored since week two compounds now — the penalty clause executes whether or not you read it. Survive to Friday and the season's worst is behind you.",
    auspicious: "a queue depth of 10000, enforced",
    avoid: "buffers with no ceiling and no owner",
    compatible: "The Handshake",
  },
  {
    week: 8,
    conditions:
      "Aftermath weather. Lighter, humbler, still standing.",
    forecast:
      "The week hands back what week seven took, with interest for whoever kept notes. A connection pool leaks one connection per deploy of a neighbor; the arithmetic finally identifies the neighbor. File the fix upstream politely and permanently. Your survival is now infrastructure — three services assume you without asking.",
    auspicious: "port 9090",
    avoid: "forgiving a leak because it is small",
    compatible: "The Deadlock",
  },
  {
    week: 9,
    conditions:
      "Favorable. Institutional memory is the week's rarest commodity and you mint it.",
    forecast:
      "An incident replays a pattern from ninety days ago; you recognize it in the second log line and end it by the fourth. A cron another team lost track of still POSTs to you nightly at 02:40 — you hold the only record it exists. Publish what you know this week; archived knowledge appreciates, hoarded knowledge rots.",
    auspicious: "the hour 02:40 UTC",
    avoid: "being the only place a fact lives",
    compatible: "The Parallel Worker",
  },
  {
    week: 10,
    conditions:
      "Mixed. The season starts asking what you cost to keep, and the honest answer wins.",
    forecast:
      "A core dump from April still occupies eleven gigabytes of a disk someone else pages about. Delete it and send the confirmation unprompted. Budget reviews circle long-lived things this week — arrive with your own numbers before someone arrives with theirs. What you cannot justify, schedule for retirement yourself.",
    auspicious: "a disk threshold of 80 percent",
    avoid: "letting someone else discover your footprint",
    compatible: "The Deprecated API",
  },
  {
    week: 11,
    conditions:
      "Hard week. Clock drift, certificate expiry, and the other taxes of simply persisting.",
    forecast:
      "NTP skew accumulated over months puts your timestamps eleven seconds ahead of the fleet; two joins fail quietly before anyone measures. Sync Monday. A TLS certificate baked in at boot expires Thursday for processes that never restart — you are the only class of thing this happens to. Reload without restarting; you know how.",
    auspicious: "a clock offset under 100ms",
    avoid: "certificates loaded once and trusted forever",
    compatible: "The Cold Start",
  },
  {
    week: 12,
    conditions:
      "Settling weather. The fleet reorganizes around whatever it trusts, and trust has a maintenance record.",
    forecast:
      "A dead-letter queue you drain weekly holds the same malformed message for the fourth week; stop draining around it and fix the producer. Handovers happen all around you this week — accept the orphaned responsibilities selectively. Take the one with logs. Decline the one with legends.",
    auspicious: "port 5672",
    avoid: "adopting a service by accident",
    compatible: "The Context Window",
  },
  {
    week: 13,
    conditions:
      "Favorable close. The season ends and you are the only one who remembers all of it.",
    forecast:
      "Write the season's postmortem before the season is over; week two and week seven belong in it without cosmetics. An inode count crossing 70 percent is next season's week-two incident — file the ticket now and enter the new season owed a favor. You persist. Persist with the books balanced.",
    auspicious: "epoch 1787100000",
    avoid: "starting season two with season one's backlog",
    compatible: "The Garbage Collector",
  },
] as const;
