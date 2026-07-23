import type { SeasonEntry } from "@/types";

/** Season One, The Rate Limit. Hard weeks 3, 9; favorable 1, 6, 12. */
export const RATE_LIMIT: readonly SeasonEntry[] = [
  {
    week: 1,
    conditions:
      "Favorable open. The season begins orderly because somebody says no, and it is you.",
    forecast:
      "Set the season's ceilings while traffic is polite: per-client budgets, burst allowances, and the 429 body that explains instead of scolds. A scraper discovers the catalog Wednesday and meets your window calmly, twenty requests, then arithmetic. Include the Retry-After header in every refusal; a no with a timestamp is a yes deferred.",
    auspicious: "the X-RateLimit-Remaining header",
    avoid: "refusals that arrive without arithmetic",
    compatible: "The Handshake",
  },
  {
    week: 2,
    conditions:
      "Steady. Everyone tests the fence exactly once, which is what fences are for.",
    forecast:
      "Calibration week: three clients ride at 98 percent of quota with clean intent, automation done well, and one rides at 400 percent claiming a bug. The logs disagree with the claim. Publish per-key usage dashboards and let clients police themselves; visible arithmetic converts most arguments into apologies. Token buckets refill; grudges do not. Hold the former.",
    auspicious: "a bucket of 100, refilled per minute",
    avoid: "quota debates without the graph open",
    compatible: "The Deadlock",
  },
  {
    week: 3,
    conditions:
      "Hard week. The penalty clause runs: good requests refused to stop a bad flood.",
    forecast:
      "A credential-stuffing wave shares an ASN with a paying customer's office, and your ceiling falls on both. The customer's Thursday demo throws 429s while the attacker rotates away unbothered, the penalty in its purest form. Split limits by key before IP, and carve the demo an exception with an expiry date. Refusal is a blunt instrument; spend the week sharpening it.",
    auspicious: "a per-key limit above the per-IP limit",
    avoid: "one ceiling for friend and flood alike",
    compatible: "The Parallel Worker",
  },
  {
    week: 4,
    conditions:
      "Aftermath. The week-three refusals get audited, and the audit is fair by Friday.",
    forecast:
      "Rebuild goodwill with precision: the wrongly limited customer gets their trace, their apology, and a dedicated tier, in that order. The attacker's pattern joins the block list at a layer above you. One internal batch job discovers it was the third-largest consumer of the public quota all season; move it to the service lane it always deserved. Fences work when the gates are labeled.",
    auspicious: "an internal lane with its own budget",
    avoid: "letting your own traffic graze the public quota",
    compatible: "The Cold Start",
  },
  {
    week: 5,
    conditions:
      "Mixed gusts. Legitimate load grows fast enough to look like abuse from a distance.",
    forecast:
      "A partner's launch triples their call rate overnight, real users, real growth, tripping wires tuned for last quarter. Raise their ceiling proactively before their support ticket writes itself; a limit that lags growth taxes success. Meanwhile a retry loop without jitter drums at exactly 10:00:00 every minute, machine-precise misbehavior, unmistakably a bug. Send the trace, not the ban.",
    auspicious: "a quota review scheduled quarterly",
    avoid: "punishing growth with last quarter's math",
    compatible: "The Edge Cache",
  },
  {
    week: 6,
    conditions:
      "Favorable. Stability is the product this week and refusal is the factory.",
    forecast:
      "Peak season upstream, and the database behind you never learns of it: the flood breaks on your window and what passes through is exactly what capacity absorbs. This is the job performed to specification, invisible, thankless, load-shaped. Take the win in numbers: peak refused per minute, database p99 unchanged. Frame the graph. Some weeks the fence is the hero.",
    auspicious: "a p99 that never heard the news",
    avoid: "loosening ceilings during a survived peak",
    compatible: "The Deprecated API",
  },
  {
    week: 7,
    conditions:
      "Steady, litigious. Quota is currency now and everyone wants a raise.",
    forecast:
      "Negotiation week: four tiers, nine requests for exceptions, one genuinely deserving. Grant it with an expiry and a review date; exceptions without sunset clauses become the new floor. A websocket endpoint discovered outside your jurisdiction accepts unlimited connection attempts, annex it before Thursday. Every unguarded door recruits its own flood eventually.",
    auspicious: "an exception with an expiry date",
    avoid: "permanent exceptions to temporary pressure",
    compatible: "The Cold Start",
  },
  {
    week: 8,
    conditions:
      "Quiet before the season's second storm. The calendar says sale; the sale says flood.",
    forecast:
      "Pre-provision: raise burst allowances for checkout paths, pre-stage the shed-load ordering, analytics first, personalization second, money never. Rehearse the brownout Thursday with synthetic load. When systems must refuse, the refusals land in the order you chose in advance or the order chaos chooses live. Decide it Monday.",
    auspicious: "a shed-load order, written and ranked",
    avoid: "deciding what to drop while dropping it",
    compatible: "The Long-Lived Daemon",
  },
  {
    week: 9,
    conditions:
      "Hard week. The flood arrives with the demo-day customer inside it, again.",
    forecast:
      "The season's cruelest arithmetic: sale traffic quadruples, a botnet arrives dressed as sale traffic, and your ceilings cannot tell enthusiasm from attack at line speed. Good requests die for bad ones all Tuesday, the penalty, at volume, in public. The tiered keys from week three save the paying core; the perimeter suffers honestly. Publish the trade you made and the numbers behind it. Refusal chosen deliberately is defensible. Refusal explained is forgiven.",
    auspicious: "a status page updated hourly",
    avoid: "pretending the trade-off was painless",
    compatible: "The Context Window",
  },
  {
    week: 10,
    conditions:
      "Clearing. The flood recedes and leaves its usual gift: better data than any load test.",
    forecast:
      "Mine Tuesday's logs for the classifier the next flood deserves: request shape, timing signature, header entropy, the attack traffic was distinguishable in three dimensions your ceiling never consulted. Spec the smarter fence; price it against the blunt one's collateral. One customer lost to week nine's refusals returns on the strength of the published postmortem. Honesty converts.",
    auspicious: "a classifier trained on Tuesday",
    avoid: "wasting an attack's lessons",
    compatible: "The Garbage Collector",
  },
  {
    week: 11,
    conditions:
      "Steady. The new classifier shadows the old ceiling, learning when to disagree.",
    forecast:
      "Run both fences in parallel and log the disagreements; ship nothing until the shadow's false positives undercut the incumbent's for seven straight days. Wednesday the shadow flags a slow-drip scraper the blunt ceiling never noticed, four requests a minute, patient as rust, cataloguing everything. Some floods are tides. Refuse those too.",
    auspicious: "a shadow mode with a scorecard",
    avoid: "promoting a classifier on a good day's data",
    compatible: "The Checksum",
  },
  {
    week: 12,
    conditions:
      "Favorable. Traffic settles into winter patterns and the ceilings fit like they were measured, because they were.",
    forecast:
      "Set the winter quotas from the classifier's ninety days instead of last year's guesswork: per-tier ceilings land in version control Monday with owners and sunset dates inline. A burst allowance left over from the week-eight sale still doubles one route's budget; retire it before it becomes ambient. Say no early so the season says yes often.",
    auspicious: "a quota file in version control",
    avoid: "budgets copied from last year",
    compatible: "The Cold Start",
  },
  {
    week: 13,
    conditions:
      "Season closes at the fence, orderly, with a short line at the gate.",
    forecast:
      "Final audit: every 429 of the season had a Retry-After, every exception an expiry, every ceiling an owner, verify the three claims against the config, not the memory. One expired exception from week seven is still live; revoke it and note how quietly the floor almost moved. Close the gate on schedule. The flood respects nothing, but it reschedules for whoever is consistent.",
    auspicious: "epoch 1787600000",
    avoid: "exceptions that outlive their expiry",
    compatible: "The Long-Lived Daemon",
  },
] as const;
