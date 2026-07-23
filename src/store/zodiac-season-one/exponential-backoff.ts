import type { SeasonEntry } from "@/types";

/** Season One, The Exponential Backoff. Hard weeks 2, 8, 13; favorable 4, 10. */
export const EXPONENTIAL_BACKOFF: readonly SeasonEntry[] = [
  {
    week: 1,
    conditions:
      "Season opens jittery. Everything retries at once, which is to say, wrong.",
    forecast:
      "Set the season's discipline in week one: base delay, multiplier, cap, jitter, written down, applied everywhere, argued never. A retry storm out of a neighboring service hammers a recovering database back to its knees Tuesday; your calm cadence is the counterexample the postmortem cites. Wait well and be seen waiting well.",
    auspicious: "a base delay of 100ms, doubled",
    avoid: "retries without jitter",
    compatible: "The Rate Limit",
  },
  {
    week: 2,
    conditions:
      "Hard week. The wait outlives the need, per the fine print.",
    forecast:
      "Your penalty executes early this season: a dependency recovers Monday 10:15 and your cap holds you silent until 10:23, eight minutes of capacity spent honoring a delay the world no longer required. The complaint arrives anyway. Add a circuit-breaker probe so recovery is discovered, not scheduled. Restraint without observation is just absence.",
    auspicious: "a half-open probe every 30 seconds",
    avoid: "caps chosen without a recovery probe",
    compatible: "The Garbage Collector",
  },
  {
    week: 3,
    conditions:
      "Steady degradation weather. Everything works, slower, on the second try.",
    forecast:
      "The week runs on your arithmetic: first tries fail at twice the usual rate and the fleet's shape is decided by who waits how long. A Retry-After header from a partner API states 120 seconds and their infrastructure means it; the services that read the header sail, the ones that guess drown politely. Read the header. It is the rare wait somebody calculated for you.",
    auspicious: "the Retry-After header, obeyed",
    avoid: "guessing at a wait the server already stated",
    compatible: "The Handshake",
  },
  {
    week: 4,
    conditions:
      "Favorable. Pressure arrives in waves, and waves are your native format.",
    forecast:
      "A flash of load Wednesday breaks the services that retry hot and spares everything behind your curve, the difference is visible on one graph and you are the flat line. Take the moment to export your policy as the shared library it deserves to be. Patience, packaged, is the rare virtue that scales. Version it.",
    auspicious: "a jitter of plus-or-minus 50 percent",
    avoid: "keeping good defaults to yourself",
    compatible: "The Deadlock",
  },
  {
    week: 5,
    conditions:
      "Mixed. Half the fleet believes the outage is over. The outage has opinions.",
    forecast:
      "Premature recovery declarations, twice: the eager retry immediately re-fells what it rushed to greet. Hold your cadence through the second false dawn, the third dawn is real and your first probe lands inside it. A dead-letter queue quietly absorbs what others' abandoned retries dropped; drain it Thursday and return what is returnable.",
    auspicious: "a delay of 8 seconds, fourth attempt",
    avoid: "declaring recovery from a single 200",
    compatible: "The Parallel Worker",
  },
  {
    week: 6,
    conditions:
      "Quiet. Nothing fails enough to need you, which is its own kind of report card.",
    forecast:
      "Silence season: your code paths run cold and the temptation is to trim them. Decline. The week's one event is instructive, a cron overlaps its own previous run for the first time and the naive lock spins hot; give it your curve and the overlap resolves in one cycle. Instruments are judged in storms and maintained in calms. This is a calm.",
    auspicious: "a lock acquired with a timeout",
    avoid: "deleting patience because the month was kind",
    compatible: "The Deprecated API",
  },
  {
    week: 7,
    conditions:
      "Steady with distant thunder. A dependency's status page turns poetic, never a good sign.",
    forecast:
      "Pre-position: raise caps on the paths that touch the ailing dependency and confirm jitter is genuinely random, a seeded generator gave three services synchronized jitter last quarter, which is a marching band, not a crowd. When the thunder lands Friday, your curves are already shaped for it. Preparation is just backoff pointed at the future.",
    auspicious: "entropy from /dev/urandom",
    avoid: "synchronized randomness",
    compatible: "The Cold Start",
  },
  {
    week: 8,
    conditions:
      "Hard week. The long outage. Everything you are is on the graph.",
    forecast:
      "A core dependency stays down eleven hours and the fleet divides into the disciplined and the deafening. Your curve holds; your queue depth becomes the fleet's most-watched number; your cap gets second-guessed at hour six. Hold. When recovery comes, re-entry is staged by your delays and the thundering herd stays theoretical. The wait outlives the need again at the very end, two idle minutes, and this time nobody mentions it.",
    auspicious: "a maximum delay of 300 seconds",
    avoid: "shortening the curve at hour six",
    compatible: "The Long-Lived Daemon",
  },
  {
    week: 9,
    conditions:
      "Aftermath. The postmortem quotes your delays with approval and misspells your name.",
    forecast:
      "Codification week: the eleven-hour outage turns your policy into policy. Write the runbook while the memory is exact, base, multiplier, cap, jitter, probe, and the one graph that ended the arguments. A payload threshold surfaces in review: requests over 2MB never deserved retries at all, only apologies. Add the distinction. Not everything failed deserves another chance.",
    auspicious: "a retry budget per request class",
    avoid: "retrying what was rejected on principle",
    compatible: "The Context Window",
  },
  {
    week: 10,
    conditions:
      "Favorable. The season pays out to whoever waited correctly, which narrows the field.",
    forecast:
      "Four services adopt the library; one imports the cap as a timeout and pages itself at 03:00 Thursday to prove it. Correct the docs with a field table, not a reply thread, base, multiplier, cap, jitter, probe, nothing else. Version the defaults and sign the changelog. What you wrote under duress in week one is infrastructure by Friday; review it like infrastructure.",
    auspicious: "port 4222",
    avoid: "becoming a helpdesk for your own restraint",
    compatible: "The Parallel Worker",
  },
  {
    week: 11,
    conditions:
      "Mixed. New traffic patterns test old curves.",
    forecast:
      "A batch workload arrives whose failures are instant and cheap, your carefully humane delays just make it slow. Fit the curve to the cost: aggressive for the cheap and idempotent, patient for the expensive and stateful. One size fitting all was always the lie in the library README; version two admits it. Ship version two.",
    auspicious: "a multiplier of 1.5 for cheap operations",
    avoid: "one curve for all cost profiles",
    compatible: "The Deprecated API",
  },
  {
    week: 12,
    conditions:
      "Settling. The season's failures are catalogued; the waits that answered them, mostly vindicated.",
    forecast:
      "Audit the season's delay ledger: total time spent waiting, per service, against incidents avoided. The number is large and the counterfactual is larger; present both. One unmonitored cron discovered in the audit has been failing and retrying nightly since week three, succeeding on attempt five, every night, patient, invisible, and wasteful. Fix the root cause it politely survived.",
    auspicious: "an alert on attempt three",
    avoid: "letting retries hide a fixable fault",
    compatible: "The Cold Start",
  },
  {
    week: 13,
    conditions:
      "Hard close. The season ends mid-wait, which for you is on schedule.",
    forecast:
      "The final week opens with a partner outage and closes before their recovery, your last retry of the season is scheduled for a time that belongs to season two. Document the open wait and hand it over cleanly. The penalty stands in miniature: season one spends its final minutes waiting for something that arrives after the books close. Sign the books anyway. The wait was correct.",
    auspicious: "epoch 1787500000",
    avoid: "abandoning a correct wait to end a chapter",
    compatible: "The Long-Lived Daemon",
  },
] as const;
