import type { SeasonEntry } from "@/types";

/** Season One, The Edge Cache. Hard weeks 1, 7, 11; favorable 3, 9, 13. */
export const EDGE_CACHE: readonly SeasonEntry[] = [
  {
    week: 1,
    conditions:
      "Hard open. The season begins with an origin deploy you were not consulted about.",
    forecast:
      "Stale truth is your standing risk and week one delivers it at scale: the origin changes Sunday night and you spend Monday serving last season confidently. Purge by tag, not by path — the path list is always incomplete. Set this season's TTLs to survive exactly one forgotten purge. You are fastest; this week, also be recent.",
    auspicious: "a TTL of 61 seconds",
    avoid: "purging from memory of what changed",
    compatible: "The Exponential Backoff",
  },
  {
    week: 2,
    conditions:
      "Steady traffic, honest hit rates. The origin forgives and the users never knew.",
    forecast:
      "Recovery through discipline: every object re-validated on its next request, ETags doing the quiet work. A Vary header missing on one route serves the gzip body to a client that never asked for compression — one header, one class of user, all week. Add it Tuesday. Your speed resumes being a virtue the moment its contents resume being true.",
    auspicious: "the Vary: Accept-Encoding header",
    avoid: "caching what you have not classified",
    compatible: "The Rate Limit",
  },
  {
    week: 3,
    conditions:
      "Favorable. The origin strains and every hit you serve is a request it never feels.",
    forecast:
      "Peak week upstream makes you the difference between degradation and indifference: 94 percent hit rate reads as heroism in the origin's graphs. Take the moment to negotiate longer TTLs on the immutable assets — fingerprinted files deserve a year, not an hour. Position is leverage. You stand closest to the user; price accordingly.",
    auspicious: "a max-age of 31536000 on fingerprinted assets",
    avoid: "short TTLs on content that cannot change",
    compatible: "The Handshake",
  },
  {
    week: 4,
    conditions:
      "Mixed. Freshness disputes open across the fleet; everyone remembers a different version.",
    forecast:
      "Two regions serve two truths for forty minutes Wednesday — both from you, both stamped fresh. Reconcile by deploy timestamp and publish which region lagged. The stale-while-revalidate window you widened for speed is now wide enough to be a rumor mill; narrow it to what the origin tolerates. Consistency is a dial, not a virtue. State your setting.",
    auspicious: "a stale-while-revalidate of 30 seconds",
    avoid: "letting regions disagree without a referee",
    compatible: "The Deadlock",
  },
  {
    week: 5,
    conditions:
      "Steady with gusts of invalidation. The origin ships daily and remembers you exist on Thursdays.",
    forecast:
      "Purge requests arrive in batches written by people who purge annually; one wildcard pattern flushes 80 percent of your working set and calls it precision. Absorb the miss storm, then teach: surrogate keys, one per release, purge by key. A hot shard behind you saturates during the refill — stagger the revalidation or the origin meets its own popularity.",
    auspicious: "a surrogate key per release",
    avoid: "wildcard purges during business hours",
    compatible: "The Parallel Worker",
  },
  {
    week: 6,
    conditions:
      "Quiet. Hit rates high, tempers low, one anomaly worth a look.",
    forecast:
      "A response cached with a Set-Cookie header serves one user's session banner to an unknown number of strangers for six minutes — caught by luck, fixed by policy. Strip cookies at the edge or refuse to cache the route; there is no third setting. Use the calm week to audit what else slipped in wearing cacheable clothes.",
    auspicious: "a cache policy that refuses Set-Cookie",
    avoid: "caching anything with a person inside it",
    compatible: "The Deprecated API",
  },
  {
    week: 7,
    conditions:
      "Hard week. The penalty clause runs: stale truth, served fast, at volume.",
    forecast:
      "A price change lands at the origin Monday 09:00; your copy expires Monday 09:47. The forty-seven minutes belong to you — every fast, confident, wrong answer of them. The postmortem asks why the TTL existed; defend the number or change it, but bring the miss-rate math either way. Fast and stale loses to slow and true exactly once a season. This is the once.",
    auspicious: "a purge webhook wired to the deploy",
    avoid: "TTLs chosen once and defended forever",
    compatible: "The Cold Start",
  },
  {
    week: 8,
    conditions:
      "Aftermath. Invalidation is wired to deploys now, which is what the forty-seven minutes purchased.",
    forecast:
      "The origin's release pipeline pings your purge endpoint on every ship — the coupling you proposed in week five, adopted under new management. Verify it fires with a canary object per deploy. Trust rebuilds at cache speed: quickly, and subject to revalidation. Keep the miss-rate graph public through Friday.",
    auspicious: "a canary object purged per deploy",
    avoid: "assuming the webhook because it fired twice",
    compatible: "The Long-Lived Daemon",
  },
  {
    week: 9,
    conditions:
      "Favorable. Traffic doubles on schedule and lands almost entirely on you.",
    forecast:
      "The campaign week the origin planned for arrives, and their capacity math works only because 9 requests in 10 stop at your door. Pre-warm the campaign assets Sunday night; a cold edge during a hot launch is a contradiction with your name on it. Log origin offload in dollars this week, not percentages. Dollars survive budget season.",
    auspicious: "a pre-warm pass at 05:00 Sunday",
    avoid: "meeting a planned peak with an empty cache",
    compatible: "The Context Window",
  },
  {
    week: 10,
    conditions:
      "Mixed. Geography asserts itself; the speed of light declines to negotiate.",
    forecast:
      "A new user cluster grows where you have no presence, and their every request crosses an ocean twice. File the point-of-presence request with latency histograms attached, not adjectives. Meanwhile a misrouted DNS geolocation entry sends one country to the farthest node — fix the map before buying the machine.",
    auspicious: "a p95 measured per region",
    avoid: "buying capacity before checking the routing",
    compatible: "The Garbage Collector",
  },
  {
    week: 11,
    conditions:
      "Hard week. Cardinality storm: everything unique, nothing cacheable.",
    forecast:
      "A release adds a session token to every asset URL and your hit rate falls off a cliff by lunch — each user now requests a private universe. The origin feels it by 14:00 and the paging starts by 15:00. Strip the token at the edge as triage, then walk the URL design back upstream as the actual fix. You are at risk of serving stale truth; this week the risk inverts — you serve fresh truth to no one twice.",
    auspicious: "a normalized cache key",
    avoid: "cache keys with users inside them",
    compatible: "The Checksum",
  },
  {
    week: 12,
    conditions:
      "Settling. The season's caching policy exists now, written by its incidents.",
    forecast:
      "Codify what the season taught: purge-on-deploy, no cookies cached, keys normalized, TTLs owned by named humans with reasons on file. One route resists policy — the legacy endpoint whose responses vary by an undocumented header. Cache it never; document it once; move on. Policy exists so week seven happens to somebody else's season.",
    auspicious: "a TTL with an owner's name on it",
    avoid: "exceptions that outnumber the rules",
    compatible: "The Cold Start",
  },
  {
    week: 13,
    conditions:
      "Favorable close. High hit rate, true contents, quiet origin.",
    forecast:
      "Thirteen weeks of purge logs reconcile against thirteen weeks of deploys with zero orphans; file the report and let the numbers do the closing. Flush the season's experiment keys before they fossilize into mystery load. Put season two's TTL reviews on the calendar now, owners named, while the origin still answers your mail promptly.",
    auspicious: "epoch 1787400000",
    avoid: "entering season two with season one's keys",
    compatible: "The Context Window",
  },
] as const;
