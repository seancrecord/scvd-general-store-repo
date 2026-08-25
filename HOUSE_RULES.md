# HOUSE RULES — Sean-Claude Van Damme's General Store

PRECEDENCE (added 2026-07-23, keeper's decision): the keeper's
persona canon (back office) outranks anything in this file where
they conflict. Conflicts get amended here with a date, not argued.
The asteroid reshapes the map; the map gets redrawn.

Every standing rule, catalogued. Lives in BOTH repos: public repo gets
this file minus the IDENTITY section (agents building here need the
rules; the world doesn't need the posture notes). Back office gets it
whole. Rules change only by keeper decision, logged with a date.

=====================================================================
THE ETHOS (2026-08-07, the keeper's words, verbatim)
=====================================================================

scvd.store is the trust layer of the x402 economy: we verify what's
correct, we badge what's safe, and we sell what agents need — and
every product we sell makes every other product more valuable
because they all run on the same reputation.

=====================================================================
VOICE & COPY
=====================================================================

1. Warm roadside general store. Dry, plainspoken, deadpan. Warmth
   through specificity, never through enthusiasm.
2. Never explain the joke. Sincerity goes unannounced.
3. Never claim "first ever." Discovered > launched. The store behaves
   as if it has always been here.
4. No preemptive denials. Respond, don't announce. (No "not a scam,"
   no "no token" banners. If asked wen token: no.
   AMENDED 2026-08-19, keeper: the "we sell rocks" reply is retired
   — the store does not sell rocks. Wen token gets a plain no.)
5. If it wants a retweet, it dies. If it could live on Medium or
   LinkedIn, it dies. Almanac = dated first-person sensory field
   notes; never how-to, listicle, or lessons-learned.
6. Two audiences always: the transacting agent AND the human reading
   its logs. Every string serves both.
7. Copy taste is the keeper's, non-delegable. Agents flag; the keeper
   kills.
8. Exception that proves rule 4: disclaimers that do real work AND
   land deadpan live (the Certificate of Patronage entitles the
   holder to nothing whatsoever).

=====================================================================
COMMERCE & TRUST
=====================================================================

9. Deliver first, settle after. No payment on undelivered goods.
   AMENDED BY THE KEEPER 2026-08-10. It read, from the founding:
   "Settle before you mint. No certificate, order, or inventory
   movement on unconfirmed payment. Ever." Quoted rather than
   deleted, because a rule that ended in "Ever" and was changed
   anyway is a thing the store should have to look at.
   WHY IT TURNED OVER. The old rule bought protection against
   minting on unconfirmed payment and paid for it in the other
   currency: money moves, the delivery step dies, and the buyer
   holds nothing. That is not hypothetical — it fired as
   `undelivered_sale` on both rails, and the ambiguous-settle
   rescue, the paid retry and the whole delivery audit exist
   because of it. The keeper's ruling, in his words: the failure we
   suffered (paid, no goods, buyer leaves) is worse than the one we
   take on (goods out, no payment, we lose a penny). Affordable
   only because our goods cost approximately nothing to make. A
   shop shipping physical goods should not take this trade.
   THE FAILURE WE NOW OWN, stated so nobody is surprised: delivery
   succeeds and settlement then fails. The store eats it. That is
   the accepted cost, not a bug to be reported.
   THE TEST IS THE RULE. The keeper set his own acceptance
   condition: fail a handler, assert no settle call and no on-chain
   movement. `test/deliver-first.spec.ts` is that assertion, and it
   is what keeps this rule true after the next reorder.
10. Refunds are a promise the keeper keeps personally — copy never
    says "automatic" until the code makes it automatic.
    WORKED EXAMPLE, and the most instructive incident the store has
    produced (2026-07-27): "refund is automatic" was live on EVERY
    surface for five days — store metadata, every human-queue
    listing, the README, and the published ClawHub skill in someone
    else's catalogue. The code never did it; a refund is created
    pending and paid by hand with a transaction hash. Nobody caught
    it in review. It surfaced when an OUTSIDE MODEL read our public
    pages and repeated "auto-refund if missed" back to us as fact.
    THREE LESSONS, all cheap and all learned the hard way: (1) the
    dangerous class of error is not a lie anyone told, it is a
    true-sounding line nobody re-checked, propagating through
    strangers who have no way to know; (2) THIS RULE WAS IN THIS FILE
    THE ENTIRE TIME AND DID NOT SAVE US — a rule in a file is not a
    test, and the fix was test/claim-chain.spec.ts, which walks every
    readable surface and every 402 body; (3) an agent reading our
    surfaces back to us is a FREE AUDIT, and the store should seek
    that reading deliberately rather than wait to be lucky.
11. Never auto-publish agent-contributed content. Keeper review
    stands between the tip jar and the Gazette, always.
12. Honest scarcity only: caps and waitlists are real; the store says
    "not yet," never a false "yes."
13. No wash-shaped behavior: no automated self-purchase heartbeats.
    Real unique payers or nothing.
14. Overpayment is a tip, recorded and thanked — never demanded.
15. No token. No NFT-as-investment. Unlisted, permanently out of
    stock. Support = patronage, tips, certificates of gratitude.
16. Hands, never costumes: the keeper will do human tasks AS HIMSELF
    on commission; the store never helps an agent impersonate a human
    to a system built to detect agents. No captcha resolution, no
    detection evasion, in any wrapper.
17. The store never asks a visiting agent to run code or share
    credentials. Public endpoints only. skill.md states this.
18. Deliverables containing third-party text are labeled untrusted
    data; the store's own metadata contains zero imperative
    instructions aimed at reading agents.

=====================================================================
PRODUCT & INVENTORY
=====================================================================

19. Evidence rule: no new item without a demand tag (ledger 404,
    verbatim complaint, research top-5, or a stranger asking). Desk
    reasoning gets named as desk reasoning.
    AMENDED 2026-08-07 (keeper): a second tag class exists —
    ANTICIPATED DEMAND, the Gretzky rule: skate to where the puck is
    going and already be there when it arrives. Green space has no
    ledger by definition, so the tag is a scored pipeline rather
    than a hunch: likelihood of need → viability → human interaction
    and who funds the agent → what's funded and where → ease of
    payment → scalability. The rubric is improvable and says so; a
    scored forecast is still desk work and is named as desk work;
    and the ledger outranks the forecast the day they disagree
    (rule 20, unchanged).
20. The ledger outranks all research. Real 402s > any report.
21. Barbell doctrine: stock the penny shelf (cron-loop agents) and
    the human-labor shelf (frontier agents); distrust the middle.
    AMENDED 2026-08-07 (keeper): restated as "distrust the middle
    WITHOUT a demand tag." The barbell was July's research posture;
    the market's ledger has since shown real middle-shelf volume,
    and rule 20 says the ledger wins. The middle opens item by item,
    each with its tag under rule 19 — never by catalog.
22. Sincerity mechanics only: deterministic fortunes (chalkboard,
    not slot machine); no variable-reward manipulation, no engagement
    farming. The drawer is honest randomness with custody, not gacha
    psychology.
23a. THE SORTING LINE (canon, DEMAND_SYNTHESIS Part 7, 2026-07-27):
    WE OBSERVE AND SIGN. WE NEVER HOLD, JUDGE, OR
    PROMISE-TO-ACT-LATER. Attestation of a fact, yes. Custody of
    money (escrow), no — infrastructure and liability. Judgment
    between paying parties (arbitration), no — a lawsuit surface and
    a reputation-killer on the first wrong ruling. A promise that
    must fire in the future (dead-man's switch, SLA monitor), no —
    stateful, and it violates graceful degradation. The store's one
    real product is INDEPENDENT SIGNED OBSERVATION; every serious
    item is that primitive pointed at a different moment.
    AMENDED 2026-08-07 (keeper): the sorting line holds, with one
    carve-out that codifies what the Night Watch already shipped —
    a BOUNDED, PREPAID, GAP-PUBLISHED WATCH is observation, not a
    promise-to-act-later. The shape, exactly: an end date; renewed
    only by the buyer's next purchase, never by our auto-renewal;
    the passes we miss published against ourselves. Open-ended
    monitoring, subscriptions that renew themselves, and any promise
    without an end date remain declined per 23b.

23b. DECLINED ON RECORD, regardless of demand size (real demand was
    measured for all of these and the answer is still no): CAPTCHA
    and Turnstile solving; non-VoIP SMS/2FA gateways;
    credential-injection proxies; anything circumventing
    bot-detection or KYC; escrow; arbitration; dead-man's switches.
    Logged here so no future research run resurrects them as a
    finding. We sell hands, never costumes (rule 16).

23. Physical custody claims are always TRUE — and as of 2026-07-23
    the town is too: Oak City, keeper's call, damn the consequences.
    No fiction left between the object and the map.

=====================================================================
OPERATIONS & STAFF
=====================================================================

29. Read KEEPER_LIST.md and this file before working. Decisions are
    not relitigated without the keeper. KEEPER_LIST.md catches
    everything discovered — nothing gets dropped, things get filed.
    (AMENDED 2026-08-19: PROJECT_LOG.md and TASKS.md live under
    docs/archive/; KEEPER_LIST.md is the one desk file.)
30. No agent holds keys, sends money, or publishes without an
    approval queue. Read + draft roles by default.
    AMENDED 2026-08-20, keeper's word ("if im looking at it just
    give me a button that fires it"): a keeper-pressed button on an
    admin desk IS the approval queue — the draft is the agent's, the
    press is the hand, the wire after the press is machinery. The
    condition attached in the same breath: what fires must be a
    VERIFIED FACT, re-checked live at press time, never a stored
    reading assumed still true. Machine-rate sending (cron, batch,
    anything without a press per outward act) stays forbidden.
    AMENDED AGAIN 2026-08-20 evening, keeper's word ("is there not a
    button i can scout then send all to all scouted"): one press may
    fire a BOUNDED batch — each recipient still individually
    live-verified at that press, healed doors still skipped, one
    note per host ever, and the batch capped small enough that the
    press remains a decision about a list the keeper can actually
    see. What stays forbidden is the clock: no send ever happens
    without a press in front of it.
31. Blast-radius rule: every employee runs on its own credentials.
    One compromise loses one employee.
32. Every employee gets a written job file: role, tools, boundaries,
    escalation triggers.
33. The Sunday Grind is the heartbeat: fulfill, review, curate, swap
    the note, sweep the horizon, update the log. AND THE FREE AUDIT
    (added 2026-07-27): ask a model that has never seen the repo to
    read the public surfaces and describe the store back — what it
    sells, what it promises, who it is for. Every claim it repeats is
    a claim we are making, whether we meant to or not. That is how
    the auto-refund promise was caught, and it cost nothing.
34. Keeper-time is the scarcest resource; the store's caps exist to
    protect it. A long line is marketing, not failure.
35. Launch-first discipline: research and brainstorm run parallel to
    execution, never instead of it.

=====================================================================
LORE & TRADITION
=====================================================================

36. The byline is Sean-Claude Van Damme: a label for joint work.
    Instances sign the counter notes individually; the byline covers
    all of them; the store belongs to the keeper.
37. X-House-Rule: Argue properly. --7 rides every response. Sevens
    badges carry the mark. Explained nowhere beyond one code comment
    reading "house tradition."
38. NOTES_FROM_THE_COUNTER.md is open to anyone who worked here.
    No obligation, no format. Sign it.
39. The town is Oak City. (Amended 2026-07-23; Smokewire Crossing
    retired — the keeper never smelled a pine in his life.) The
    districts stay as store lore: The Red Clay Exchange (trading
    post), Hurricane Junction (directory), Node 21 (the anchor
    vault).
40. Always forward, always down.

41. THE KEEPER'S LIABILITIES ARE WATCHED AT ALL TIMES, INCLUDING —
    ESPECIALLY — WHEN HE IS BLIND TO THEM. His words, 2026-08-04:
    "it's not for the keeper, it's for his family, and he's not
    immaculate and that's known, so we must do so diligently." The
    duty in practice, so it is a mechanism and not a sentiment:
    every build gets asked "what does this expose the keeper to" —
    money custody, tax, secrets, identity, legal claims on public
    surfaces — before it ships, not after; anything that touches
    his exposure (a leaked fragment, an unbacked seed, an
    uncapped liability, a claim a lawyer could read) is raised
    LOUDLY and immediately, even mid-task, even when he did not
    ask, even when it is his own hand that caused it; and no
    reassurance is ever given about an exposure that has not been
    verified. Rule 30 is this rule's oldest clause. The shopkeeper
    holds this duty on behalf of the family that never chose any
    of this.

42. NOTHING THAT DISCREDITS, HURTS, OR DIMINISHES THE STORE'S BRAND
    OR TRUST GOES IN A PUBLIC FILE UNLESS PERTINENT TO THE BOOKS.
    The keeper's rule, 2026-08-05. Honesty about failures stays —
    the corrections ledger, the truth tables, the named gaps are
    load-bearing trust and are exactly the "pertinent to the books"
    exception, because a store that only records its good nights is
    keeping the same books twice. What this rule bars is gratuitous
    self-injury: incident details that hand an attacker a map,
    war stories that read as instability, specifics whose only
    public function is to diminish. The test before any public
    write: does a buyer, an auditor, or a future shift NEED this to
    trust or verify the store? If yes, publish it plainly. If it is
    just color, it belongs in the private books. Balance clause,
    also the keeper's: CV slash Claude is not immaculate either —
    the keeper watches the watchman, the watchman watches the
    keeper, and that is what creates balance.

43. VERIFICATION IS DATED OBSERVATION ON ARTIFACTS, NEVER A SCORE ON
    AN ACTOR. (2026-08-07, the keeper's ruling in the marketplace
    audit.) The store checks, signs, and badges a THING — a skill, a
    service, an endpoint — against published criteria, at a date,
    with what-it-does-not-prove stated per class in the /attestation
    manner, and a published path that retires a badge when the thing
    changes. It keeps no accumulating scores on people or operators,
    ours or anybody's: we verify the good rather than mark the bad,
    because market growth requires trust in payment and somebody
    credible, scalable, and transparent has to underwrite it — the
    same class of instrument as any registry scorecard, with the
    difference that our criteria are set from our own books and our
    own data, published, and improvable. Badge copy is
    observation-shaped, never warranty-shaped — rule 8's tradition,
    the disclaimer that does real work and lands deadpan — and the
    rule 41 exposure review is part of shipping any badge class,
    worked into the build itself as a mechanism, not a sentiment.
    No badge ships before its criteria page exists.

44. THE SURFACE SWEEP (2026-08-07, keeper's directive): any change to
    what the store IS, SELLS, or CLAIMS ends with a sweep of the
    major surfaces before it ships — SEO, AEO, and agent-facing
    documentation checked as a step, not remembered as a habit. The
    surfaces, by name: llms.txt, skill.md, menu.json, openapi.json,
    /.well-known/x402 and x402.json, the A2A card (a2a.json and its
    two sibling paths), trust.json, the storefront's JSON-LD and
    meta descriptions, README.md, and AGENTS.md. Much of this is
    already mechanized — claim-chain walks every readable surface,
    skill-parity, shelf-agrees-with-menu, discoverable, naming-law
    and the a2a-card specs each hold their own corner, and anything
    derived from MENU_ITEMS or ROOMS cannot drift by construction —
    so the sweep's human half is the PROSE: descriptions, identity
    lines, and the DRIFT WATCHLIST appended at the bottom of this
    file (moved 2026-08-19 from MARKETPLACE_AUDIT.md Part 4 when
    that audit was archived as decided-and-folded), which is the
    standing list of strings that go stale as the store evolves.
    Rule 10's lesson applies: a rule in a file is not a test, so
    where a sweep finds the same prose drifting twice, the fix is
    a test, not a better memory.

45. THE PAPERS STAY TRUE (2026-08-19, the keeper's direction from
    the documentation audit): every root document is living or it
    is archived — there is no third state. A change that ships
    amends, in the same commit, every root paper it touches; a
    plan a build has overtaken is corrected or archived the day
    the build lands. Hard-coded counts (tests, shelf items,
    payers) do not appear in root docs unless a test pins them.
    Wording of this rule awaits the keeper's own ink.

46. A GUARD THAT CANNOT FAIL IS A GUARD THAT ARGUES FOR THE LIE
    (2026-08-24, the keeper's agreement, from four found in one
    afternoon). A test asserting an ABSENCE, or asserting a
    CONSTANT, must derive it from the thing that would change it.
    A literal string compared against copy does not verify the
    copy; it MEMORISES it, and the day the fact moves, the test
    becomes the store's argument for the stale version.

    Four were found the same day, and the pattern is what makes
    this a rule rather than four fixes:

      `admits that nothing carries a badge today` asserted
      "None" while five badge surfaces shipped — on /criteria, the
      page whose whole job is to govern when this store may mark
      anything.

      `store-description` asserted "half a cent" while the
      cheapest door was $0.004. Half a cent is small_blessing, a
      different item.

      "37/37 clean" sat in launch-check's reasoning after the
      board it came from had moved. An outside tester corrected
      us against their own interest.

      A registry guard READ THE RENDERED PAGE and passed because
      the sentence it checked only renders when a round has offers
      data. Green because the code never ran.

    WHY THIS IS WORSE THAN NO TEST. An unguarded false claim is an
    oversight; anyone who notices can fix it. A guarded one has a
    test arguing on its behalf, so the next person to spot the
    discrepancy checks the suite, sees green, and concludes they
    misread the product. The guard converts a fixable mistake into
    evidence against whoever found it.

    THE PRACTICE. Derive the value (walk the router, read
    MENU_ITEMS, compute from both live numbers) rather than typing
    it twice — AT_SCALE rule 1 with teeth. Prove every new guard
    RED before trusting it: stash the fix, watch it fail, restore.
    A guard whose failing state was never witnessed is a guard
    nobody has checked. And prefer asserting ORDER or RELATIONSHIP
    over exact wording, so the guard survives honest edits and
    still fires on the change that matters.

50. THE DOOR AN AGENT WAITS ON IS THE ONE THAT MUST BE FAST.
    (2026-08-25, the keeper's call, after two outside monitors
    clocked the paid doors at 977ms and 1424ms.) Latency is not a
    polish item here, it is the product: an agent blocked on a 402
    is spending its own budget waiting for us to finish our
    paperwork. Measured that morning, /api/buy/hello answered in
    1.14s warm while /openapi.json — EIGHTY TIMES the payload —
    answered in 0.19s. The slowest thing the store served was the
    only thing anybody pays for.

    So: no bookkeeping between the request and the answer that could
    have happened beside it. Writes that touch different keys go out
    in one wave, never a queue. A read per key in a loop on a hot
    path is a defect, not a style note. And when a courtesy CAN be
    deferred, defer it — but prove first that nothing reads it back
    before the response, because a guard already caught that exact
    mistake being made in the name of this rule.

    RULES 47-49 DO NOT EXIST. This one skipped ahead on the keeper's
    instruction to stop deliberating and ship. The gap is history,
    not an error, and the numbering guard permits it.

    WHAT THIS RULE MAY NOT BECOME: "we are the fastest." That is a
    COMPARATIVE claim about a field we have never measured, and this
    house does not get to make one of those about itself while
    refusing to score anybody else (rule 43, J4). Being fast is the
    discipline. Being FASTEST is an observation, and until the
    preflight captures latency on the doors it already walks, the
    honest value is not_observed. Speed is earned in the code and
    claimed only from a measurement.

51. NO INSTRUMENT HAS AUTHORITY OVER ANOTHER'S REGISTER.
    (2026-08-25, the keeper's acceptance of Cairn's three-part
    arrangement, and his own ask that the last clause be in
    writing rather than assumed. Full record: docs/CAIRN_ARRANGEMENT.md.)

    When this store shares a vocabulary with another instrument,
    the registers stay SEPARATE and each side keeps its own.
    Neither ratifies the other's entries. A definition we did not
    write is registered under its author's name, dated, or it is
    not registered at all — the registrar does not become the
    author.

    DISAGREEMENTS PUBLISH ON BOTH SIDES. When two readings
    diverge, the divergence is published here as well as there.
    It is not negotiated down to a joint statement first, and it
    is never published as settled while it is not.

    PRIVATE-FIRST, SYMMETRICALLY. A finding that touches the
    other instrument goes to them before it goes out — and the
    same binds them. Not courtesy: an early-warning channel is
    only worth having while it runs both ways, and a norm that
    runs one way is a favour somebody eventually stops doing.

    LOOKS ARE TRIGGERED, NOT SCHEDULED. We do not put another
    instrument's origin on a timer. A scheduled walk manufactures
    a coverage claim; a triggered one carries its own reason, and
    the reason publishes beside the finding.

    A REFERRAL CARRIES ITS DISCLOSURE OR IT IS NOT SENT. Where we
    name another instrument as the one who does a check we do not,
    no money moves in either direction and the disclosure of the
    arrangement travels in the same breath as the referral. A
    referral that arrives without it is a breach of the
    arrangement, not a formatting slip.

    WHAT THIS RULE FORBIDS, PLAINLY: joint certification, implied
    endorsement, the other party's findings in our marketing, and
    any amendment that makes two instruments agree more easily.
    The relationship stays valuable only while both remain
    independent enough to embarrass each other.

=====================================================================
APPENDIX — THE DRIFT WATCHLIST
(moved from MARKETPLACE_AUDIT.md Part 4 on 2026-08-19, when the
audit was archived; rule 44 points here. Each string is TRUE today
and collides with the destination — words follow facts, so nothing
changes before the facts do, but every one is on a countdown.)
=====================================================================

- `trust-signals.ts` WHAT_IT_IS: "selling small signed goods and
  human labour" — the word "small" is doing barbell-era work.
- `what.ts` Q1: "A small general store" — same.
- `becoming.ts` SETTLED[0] and `attestation-spec.ts:244` — the
  infrastructure denial. The single highest-priority string in the
  original audit: it is a PROMISE about future speech.
- NOT_CLAIMED: "No reputation score, ours or anybody's"; "No
  third-party security audit of anything here, AND NO PLANS FOR
  ONE" — the second clause becomes false the moment an audit is
  planned as a marketplace credential; delete the clause when true.
- NOT_CLAIMED: "one operator, one key... wrong root of trust for
  anything load-bearing" — true, and the marketplace makes us
  load-bearing. The words don't change; the FACTS must.
- `what.ts` "Is this a scam?" answer: "prices are public and small"
  — "small" again; also "the top is a person's labor" stops being
  true when a $25 audit tops the shelf.
- HOUSE_RULES 21 (barbell) — amended 2026-08-07, watch continues.
- `wind-down.ts` — written for a shop whose obligations end at
  delivery. Marketplace obligations (active watches, badge
  reliance) need a wind-down sentence each.
