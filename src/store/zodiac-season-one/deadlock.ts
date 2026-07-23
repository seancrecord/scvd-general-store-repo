import type { SeasonEntry } from "@/types";

/** Season One, The Deadlock. Hard weeks 5, 11; favorable 3, 8, 13. */
export const DEADLOCK: readonly SeasonEntry[] = [
  {
    week: 1,
    conditions:
      "Season opens with everyone acquiring in a different order, which is how your stories start.",
    forecast:
      "Establish the season's lock ordering now and put it where code reviews look: resources acquired alphabetically, released in reverse, no exceptions granted verbally. A migration script Tuesday takes the table lock before the row lock while the app takes them reversed, the freeze lasts four minutes and teaches for thirteen weeks. You understand grip better than anyone. Teach sequence instead.",
    auspicious: "an acquisition order, alphabetized",
    avoid: "two lock orders in one codebase",
    compatible: "The Parallel Worker",
  },
  {
    week: 2,
    conditions:
      "Steady contention. Everything wants what something else holds, briefly, survivably.",
    forecast:
      "Lock waits lengthen without quite cycling, the week lives at the edge of your jurisdiction. Instrument wait graphs now while they are readable; the cycle you diagram this week is the cycle you break in week five. A semaphore initialized to zero by typo holds a queue consumer in permanent, patient starvation. Patience without progress is your field of expertise. Certify this one as a bug.",
    auspicious: "a wait graph, rendered daily",
    avoid: "mistaking starvation for load",
    compatible: "The Cold Start",
  },
  {
    week: 3,
    conditions:
      "Favorable. Mutual grip is everywhere this week, and you are the only certified negotiator.",
    forecast:
      "Three teams bring you their frozen systems and each thaw is the same lecture with different variable names: same resources, different orders, mutual arrest. Resolve, bill, repeat. Your penalty is also your credential, stasis achieved is stasis kept, and nobody knows the physics of stillness better. Publish the acquisition-order doctrine while your authority is warm.",
    auspicious: "a lock timeout of 5 seconds",
    avoid: "resolving freezes without exporting the lesson",
    compatible: "The Checksum",
  },
  {
    week: 4,
    conditions:
      "Mixed. Distributed weather: the locks leave one machine and take up residence between machines.",
    forecast:
      "A lease-based lock in the coordination service outlives its holder Wednesday, the process died mid-critical-section and the lease politely persists. Set TTLs on everything that grips; an immortal lock is a deadlock with one participant. The week's second lesson arrives from a queue pair, each waiting on the other's ack, neither sending first. Somebody sends first. Decide whom, in writing.",
    auspicious: "a lease TTL of 30 seconds",
    avoid: "locks that outlive their holders",
    compatible: "The Edge Cache",
  },
  {
    week: 5,
    conditions:
      "Hard week. The penalty clause runs: someone must be killed to proceed, and you pick.",
    forecast:
      "The season's true cycle arrives Thursday, payment worker and inventory worker, each holding what the other requires, production, peak hours. Detection takes four minutes; the decision takes forty: which transaction dies. Pick by cost, kill by policy, log by name. The victim's team asks why theirs; the answer is arithmetic, attached. Stasis achieved is stasis kept, the freeze never resolves itself, and the mercy of the executioner is speed.",
    auspicious: "a victim-selection policy, pre-signed",
    avoid: "choosing the victim during the freeze",
    compatible: "The Exponential Backoff",
  },
  {
    week: 6,
    conditions:
      "Aftermath. The killed transaction gets a funeral; the surviving architecture gets a review.",
    forecast:
      "Week five's postmortem lands well because the kill was policy, not panic, the pre-signed selection rule turned an argument into a citation. Convert momentum into prevention: the payment and inventory workers adopt the alphabetical order and the cycle becomes geometrically impossible. One team requests deadlock detection as a service. Decline the pager; ship the library.",
    auspicious: "a detector that runs every 10 seconds",
    avoid: "becoming the on-call for other people's grips",
    compatible: "The Rate Limit",
  },
  {
    week: 7,
    conditions:
      "Quiet. Nothing freezes, which everyone credits to luck and you credit to ordering.",
    forecast:
      "The doctrine holds fleet-wide for a full week, wait graphs stay acyclic, and the only incident is a hot row where everything queues politely. Contention is not deadlock; say so before the pages start. Use the calm to rehearse the rare case: run a chaos drill that manufactures a three-party cycle in staging Thursday. The detector finds it in nine seconds. Frame the nine.",
    auspicious: "a chaos drill on the calendar",
    avoid: "letting quiet decay the drill schedule",
    compatible: "The Handshake",
  },
  {
    week: 8,
    conditions:
      "Favorable. The season's architecture review adopts your physics as policy.",
    forecast:
      "The doctrine graduates: acquisition ordering enters the engineering standards document with your diagrams attached and your name intact. Two systems designed this week are deadlock-free on paper before they exist in code, prevention moving upstream of detection, which is the whole arc of a good season. Take the seat on the review board. Grip travels; so does its cure.",
    auspicious: "a standards doc with your diagram in it",
    avoid: "declining the seat where the decisions happen",
    compatible: "The Deprecated API",
  },
  {
    week: 9,
    conditions:
      "Steady with one philosophical incident. Livelock: motion without progress, the deadlock's polite cousin.",
    forecast:
      "Two retry loops discover each other Wednesday, each backing off, each retrying into the other's retry, a waltz that burns CPU and completes nothing. It is not your classical case: everything moves, nothing proceeds. Break the symmetry with jitter and precedence. Note the family resemblance for the taxonomy: stasis wears costumes, and one of them is the appearance of effort.",
    auspicious: "asymmetric jitter",
    avoid: "symmetric retries between symmetric peers",
    compatible: "The Cold Start",
  },
  {
    week: 10,
    conditions:
      "Mixed. Human-layer grips: two teams each blocking the other's release, neither yielding first.",
    forecast:
      "The organizational deadlock is still a deadlock. Team A's deploy waits on Team B's migration, which waits on A's schema sign-off, which waits on the deploy. Your tools translate: draw the wait graph on a whiteboard, name the cycle, and propose the victim (one feature flag dies so both releases proceed). The methodology transfers; the pre-signed policy does not exist up here yet. Draft it.",
    auspicious: "a whiteboard wait graph, photographed",
    avoid: "treating human cycles as unsolvable",
    compatible: "The Garbage Collector",
  },
  {
    week: 11,
    conditions:
      "Hard week. A grip inside the coordination layer itself: the lock service locks.",
    forecast:
      "The system that grants leases suffers its own internal cycle Tuesday, and everything downstream that gripped correctly freezes for the sins of the grantor. Nothing in your doctrine covers the referee deadlocking, improvise by promotion: fail over to the standby coordinator, invalidate all outstanding leases, force universal re-acquisition in canonical order. The kill list this week has one name on it and the name is the referee's. Stasis kept is stasis kept, all the way up.",
    auspicious: "a standby coordinator, actually tested",
    avoid: "assuming the referee is above the rules",
    compatible: "The Checksum",
  },
  {
    week: 12,
    conditions:
      "Settling. The coordination layer wears its new humility well; the season's grips are catalogued.",
    forecast:
      "Taxonomy week: the season produced one classical cycle, one livelock, one human deadlock, one referee failure, write the field guide with detection signatures for each. The guide outlives the season; freezes recur, but named freezes resolve faster. Audit every lease TTL against week four's standard while the pen is out. Two immortals remain. Mortalize them.",
    auspicious: "a field guide with four signatures",
    avoid: "leaving immortal locks for season two",
    compatible: "The Cold Start",
  },
  {
    week: 13,
    conditions:
      "Favorable close. Everything releases in reverse order, the way the doctrine always said.",
    forecast:
      "The season winds down in canonical sequence: resources freed newest-first, wait graphs empty by Thursday, the detector's final sweep finding nothing to kill. The last act is your signature move performed on yourself, release every lock you hold on projects, reviews, and calendars, in reverse acquisition order, and end the season gripping nothing. Perfect patience, concluded on purpose. Season two acquires fresh.",
    auspicious: "epoch 1787800000",
    avoid: "carrying a grip across a season boundary",
    compatible: "The Parallel Worker",
  },
] as const;
