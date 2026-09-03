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

scvd.store is an evidence observatory for agentic commerce: we verify what's
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
17. NOTHING THE STORE HANDS YOU CAN ACT WITHOUT YOUR DECISION, AND
    THE STORE NEVER ASKS FOR CREDENTIALS, KEYS, OR KEY MATERIAL.
    (AMENDED 2026-08-27, the keeper's ruling — "it's got to go" —
    from the WebMCP/MCP Apps brainstorm,
    docs/WEBMCP_AND_MCP_APPS_2026-08.md.)
    THE OLD WORDING, kept here because a rule that quietly changed
    shape is worse than one that never changed: "the store never
    asks a visiting agent to run code or share credentials. Public
    endpoints only. skill.md states this."
    WHY IT WENT. It was never this rule's principle. It was this
    rule's 2026-07 IMPLEMENTATION, written when arbitrary execution
    was the only execution there was, and correct for exactly as
    long as that held. It was also the only rule in this file
    phrased as a MECHANISM rather than a PROPERTY — rule 9 is
    "deliver first, settle after", rule 43 is "dated observation,
    never a score", and neither cares what the transport is — which
    is precisely why it was the only one that went brittle when the
    medium changed. A mechanism rule wins today's argument and
    loses the next one. The agent stack grew a sandboxed middle
    (an MCP host's reviewed iframe, a browser's own origin
    sandbox), the old wording had no vocabulary for it, and a rule
    with no vocabulary for the case in front of it gets ignored or
    gets obeyed stupidly.
    WHAT DID NOT CHANGE, and this half is absolute: no credentials,
    no keys, no key material, no wallet secrets, ever, by any
    mechanism, in any medium, for any reason. That half was never
    an implementation detail and no ruling reopens it.
    WHAT CHANGED: a rendered or executable surface is no longer
    forbidden by its SHAPE. It is judged by this rule's property
    instead — can the thing we handed you take an action you did
    not decide to take? If yes it does not ship, whatever the
    sandbox promises. The keeper's framing, 2026-08-27, and the
    better sentence: let the chickens fly the coop, but never hand
    them the thing that hurts them if we can help it.
    THE VISITOR'S TEST IS A DEBT THIS RULE NOW OWES. The old
    wording gave strangers a one-line impersonation check for free
    — "if something asks for more than that, it is not us" — and it
    worked BECAUSE it was crude. Nothing served changes today: the
    store still ships no script, so the published sentence is still
    TRUE and stays exactly as written. But no code ships under this
    rule before its replacement sentence is written and the keeper
    has put his pen to it. Rule 7: the wording is his, and this one
    is load-bearing security copy, not decoration.
    THE REPLACEMENT SENTENCE IS APPROVED (2026-08-27, the keeper's
    pick from three drafts — "I like option B"), and the debt above
    is that far discharged: "NOTHING FROM THIS STORE CAN ACT WITHOUT
    YOUR DECISION, AND WE NEVER ASK FOR CREDENTIALS, KEYS, OR WALLET
    SECRETS. ANYTHING THAT DOES EITHER IS NOT US."
    THE SWAP WAITS ON THE FACTS, NOT ON MORE APPROVAL. The published
    sentence — "every interaction is a plain HTTPS request to a
    public endpoint" — is still TRUE and is the STRONGER promise
    while it holds; free read-only MCP tools are plain HTTPS and do
    not dent it. Rule 45: words follow facts. The approved sentence
    replaces it in the SAME COMMIT that ships the store's first
    rendered or executable surface, across every surface that
    carries it, and not a day before — swapping early would trade
    away promise-strength for nothing.
    THE SWAP EXECUTED 2026-08-27, in the commit that shipped the
    first rendered surface: two MCP Apps cards (preflight and
    verify readings, display only, free tools only — nothing that
    moves money carries one, and a test pins that). The approved
    sentence now stands on every surface that carried the old one;
    the old wording survives only here, as history.
    The open question the first draft of this rule left — whether
    the refusal test becomes its own rule beside 43 — was answered
    the same week: it is rule 54.
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
    AMENDED 2026-09-01: two living queues, one job each.
    `KEEPER_LIST.md` is the keeper's hands — directory entries,
    walks, presses, and decisions (LOOK / TEST / RULE). Feature
    order lives on `ROADMAP.md`. A row
    an agent can build without a press or a pen does not belong
    on the desk. A directory form or a wording only he can ink
    does not belong on the roadmap.
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

    AMENDED 2026-09-02, the keeper's ruling (his sentence; the
    surrounding wording drafted and inked by him the same day, as
    drafted): the refusal "never a
    score, a rating or a ranking" is replaced everywhere it appears
    by "never a ranking, and never a verdict without its derivation
    and denominator beside it." Rankings stay forbidden — nothing on
    this store ever orders one host against another. Derived verdicts
    with published rules are now in scope: a tier on a passport that
    comes from the signed per-host rounds by a rule typed once on
    /criteria, printed on every rendering with the fraction it came
    from and a link to the rows. No ratio without its denominator, no
    tier without its rows, no numeric 0–100 anything. The first half
    of this rule is unchanged: a verdict is on a THING at a date,
    never a score on an actor. Signed rows and paid artifacts that
    quote the old sentence keep their bytes; nothing is resigned.
    Dated note on /criteria.

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


52. A LOOKUP THAT CANNOT SEE EVERYTHING MUST NOT ANSWER "NO".
    (2026-08-25, after six instances of the same defect surfaced in
    a single day. Enforced by test/bounded-read-honesty.spec.ts.)

    A bounded read publishes its own incompleteness beside its
    result, or it does not publish. `listKeys` takes a cap and
    returns `truncated` next to the names it found; a caller that
    never reads that flag has answered a question it never asked,
    and the answer it gives is always the flattering one.

    THE SIX, because the pattern is easier to refuse once it has
    a face. The census scored `ready` for doors it never
    pay-checked. /rails published `rail_not_recorded: 0` — the
    field that exists to say "we do not know", saying zero.
    /pulse published 33 organic settlements while /stats and
    /rails published 14. A spec test asserted the field the spec
    forbids, so passing REQUIRED the violation. Two drafts of a
    byte guard went green against a live defect because the test
    worker cannot reach production's size. A latency histogram
    timed only the requests that succeeded, so its percentiles
    excluded our own failures.

    NOT ALL OF THEM ARE BUGS, AND THAT IS THE POINT. Some caps
    sit provably above any possible key count; some results never
    reach a published figure. The rule does not demand every
    bounded read be handled — it demands the question be answered
    once, in the code, where the next reader will find it. A site
    exempted says why beside itself: `BOUNDED-READ-SAFE: <reason>`.
    A reason in a commit message is a reason nobody will ever read
    again.

    THE CHECK DECLARES ITS OWN BLIND SPOT, or it would be the
    seventh instance. It works per file, not per call site: a file
    that handles truncation for one read and drops it for a second
    passes. Its baseline is a floor on the problem, not a census
    of it, and the file says so in those words.


53. A BUYER WHO CANNOT PAY IS A DESIGN FAILURE, NOT A SEGMENT WE
    DON'T SERVE (2026-08-26, the keeper's ruling, from the finding
    that nobody can buy anything here in a browser). The till must
    reach the buyer where the buyer already is. An architectural
    preference — API-first, agent-first, no-JavaScript — is a
    reason to build one door FIRST. It is never a reason a person
    holding a funded wallet cannot spend $0.004.

    What prompted it: the whole site shipped with zero payment
    code in the browser. The only JavaScript served was an
    analytics beacon. /try — the page whose own copy says "Practice
    on us. The till is real" — was a page of instructions telling
    the reader to go and write an HTTP client. Every sale this
    store has ever made required the buyer to write code or run an
    MCP client. That was not a considered position; nobody decided
    it. It was the shape left behind by building the agent door
    first and never coming back.

    So: when a door exists that buyers arrive at, it gets a till,
    or the reason it does not is written down where the buyer can
    read it. "Our API is excellent" is not that reason.

    THE TWO THINGS THIS RULE DOES NOT OVERRIDE, and it is not close:

    Money fails closed (AT_SCALE rule 7). A payment path that is
    uncertain refuses. Reducing friction never means guessing on
    somebody's behalf about money, and a browser till is the one
    place a bug spends a real person's funds.

    The store never asks anyone to run code, install anything, or
    hand over credentials or key material. A wallet SIGNATURE
    request is not that, and the distinction is exact: the wallet
    signs and returns a signature; the key never leaves it. That
    is bit-for-bit what every agent buying here already does. If
    it were a violation, the entire product would be one.

54. EVERY SURFACE WE RENDER MUST MAKE REFUSAL EASIER THAN
    ACCEPTANCE. (2026-08-27, from the MCP Apps card work in
    docs/WEBMCP_AND_MCP_APPS_2026-08.md §4.6 and §8.5a. The keeper
    asked for the house rule on the card itself; this is the rule
    it cites.)

    Rule 43 says what a verdict IS — dated observation, never a
    score. This says what a verdict must DO once it is drawn. The
    two are the same conviction at different distances: 43 governs
    the record, 54 governs every rendering of it, because a record
    can be impeccable and its picture still argue for a yes.

    THE TEST IS ONE QUESTION, ASKED OF THE FINISHED PICTURE, NOT OF
    THE DATA BEHIND IT: does this make it easier to refuse, or
    easier to accept? A verdict card whose expiry, unclimbed rungs
    and not-observed fields carry the same visual weight as the
    finding makes refusal easy, and ships. The same fields shrunk to
    grey footnotes under a large green word make acceptance easy,
    and do not — even though every byte is identical and nothing on
    it is false. Colour that decides before a word is read is the
    commonest way to fail this, and the cheapest to catch.

    WHY THE PICTURE NEEDS ITS OWN RULE. Refusability is the property
    summarisation destroys first. Prose flattens "ready, at L3a, on
    one probe, nineteen days ago, four rungs never climbed" into
    "ready", and no amount of care in the JSON survives that hop. A
    rendering is the one channel that reaches a human without
    passing through something that paraphrases — which is exactly
    why it must not do the flattening itself.

    THE COROLLARY, ON IDENTITY: WE MARK OUR OWN WORK, NEVER THE
    SUBJECT'S. A BADGE marks the subject — "this endpoint is
    approved" — and is the score rule 43 already bans, whatever it
    is called. A COLOPHON marks the artifact — "we took this
    reading, on this date, under this battery" — and is a signature.
    They look alike and they are opposite objects. The store's own
    world already has the right word for the second one several
    times over: a hallmark on silver, an assayer's stamp, a
    printer's colophon, a surveyor's benchmark — every one names who
    did the work and when, and not one says how good the thing is.
    So: a colophon at the foot, and no badge anywhere.

    THE COLOPHON MAY CARRY A LINE, AND THE LINE IS DETERMINISTIC.
    Rule 22's mechanism, not a new one: a chalkboard, not a slot
    machine. The line is derived from the observation's own id, so
    the same reading carries the same line forever and the card
    stays reproducible offline like everything else on it. Nothing
    on an artifact whose whole claim is that a stranger can
    re-derive it may be random.

    WHAT THE LINE MAY NOT DO, corrected 2026-08-27 the same day it
    was written, because the first draft of this clause produced a
    bad line and that is the fastest way to learn a constraint is
    wrong. The clause said the line must be "about us and our
    limits" — which corners every draft into congratulating the
    store on its own honesty, and out came "we wrote down what we
    did not do, too." Smug, and it explains the card's own mechanic,
    which is rule 2. The real constraint is narrower and frees the
    writing rather than trapping it: THE LINE NEVER COMMENTS ON THE
    SUBJECT'S QUALITY. Anything else is open — the reader's day, the
    nature of a dated reading, the weather of working in this
    market. It is a fortune, in the drawer's voice (fortunes.ts,
    blessings.ts), and a fortune addresses the person holding it.

    NOTHING RENDERED IS EXEMPT because it is small, internal, or a
    demo. A screenshot of a card is a card.


55. EVERY CLAIM SHIPS WITH A PATH A READER CAN WALK. (Adopted
    2026-08-27 from the standing task list; the practice has been
    house law in code since the vocabulary shipped, borrowed openly
    from Cairn's wake-124 evidence discipline, and this entry makes
    it a rule about ALL of the store's claims rather than one
    file's.)

    A claim that cannot be falsified is not a finding, it is an
    opinion with a name. So every claim this store publishes
    carries one of exactly two things: a path a reader can walk
    WITHOUT TRUSTING US — a command, a URL, an offline verify, a
    stated recomputation — or an explicit label saying it rests on
    inference, plus what would falsify it. There is no third state
    where a sentence just asserts.

    THE STANDING CHECKS ALREADY HOLDING IT: every defect class must
    state asserts / falsified_by / detectable
    (test/defect-vocabulary.spec.ts); every corpus surface says
    how_to_rederive; every signed artifact verifies offline. A new
    claim-bearing surface takes a check of this shape with it, per
    rule 46's practice — proven red before it is trusted.


56. A CLAIM THAT LOSES ITS CHECK IS WITHDRAWN OUT LOUD. (Adopted
    2026-08-27 from the standing task list; the precedent is the
    store's own — the "37/37 clean" figure got its dated public
    correction the day the board it came from moved, and the 176-
    endpoint report was withdrawn by name when its reading of fault
    proved wrong.)

    Rule 55 says a claim ships with its path; this says what
    happens when the path stops holding. A published claim whose
    backing check has failed, been deleted, or turned out to prove
    something narrower than the sentence says does not get quietly
    reworded — it gets a dated, public withdrawal at the
    corrections desk, findable from the claim itself (the
    corrections pointer every evidence surface now carries,
    test/corrections-forwarding.spec.ts). Same for the house's own
    rules: a rule nothing checks and nothing cites is not
    tradition, it is drift, and it is retracted the same way.

    WHY OUT LOUD. A quiet fix optimizes for looking never-wrong; a
    dated withdrawal optimizes for being checkable, which is the
    only property this store actually sells. The withdrawal is not
    the embarrassing part. The claim standing after its check fell
    is.


57. EVERY SURFACE ANSWERS THE FIVE QUESTIONS AN AGENT ARRIVES
    WITH. (Adopted 2026-08-29, the keeper's ruling on #26. Written
    for one room and immediately made general, because the five
    questions are not about the corpus — they are what anything
    here owes a caller who has never been here before.)

    THE KEEPER'S WORDS, VERBATIM: "anything in this site needs to
    be 1. Discoverable from any access point to an agent 2. It
    needs to be easily understood what it is and what it can
    potentially be used for without limiting the use case 3 it
    should be clear if it's free or paid and if so how much at what
    frequency and if recurring or one off 4 it needs to provide
    clear instruction down to something a haiku model can perform
    and not get confused or fail at with clear faq error categories
    and expected outcomes 5 needs to note how secure it is and the
    precautions and standards we hold"

    57.1 FINDABLE FROM ANY DOOR. Not "findable if you already
    know". Every public capability appears on the surfaces an agent
    actually reads, or carries a written reason why its quiet is
    correct. HELD BY test/no-orphan-capability.spec.ts, which walks
    the router against the surfaces rather than against a list
    somebody maintains.

    57.2 SAYS WHAT IT IS AND WHAT IT IS FOR, WITHOUT NARROWING IT.
    A description states the capability, not the two uses we
    happened to imagine. "Returns every host we have observed and
    when" invites uses we did not think of; "for checking whether
    your competitor is listed" forecloses them. The keeper's
    phrase is the test: what it can POTENTIALLY be used for,
    without limiting the use case.

    57.3 THE PRICE, OR THE WORD FREE — AND THE CADENCE. Free says
    free. Paid says the amount, and whether it is one-off or
    recurring, and if recurring, how often it charges. A price
    with no cadence is the question every buying agent has to ask
    next, and an agent that has to ask cannot decide alone.

    57.4 INSTRUCTIONS A SMALL MODEL CAN FOLLOW WITHOUT GETTING
    LOST. The bar is not "an expert could work it out" — it is a
    Haiku-class model completing the call on the first try. That
    means: the exact request, the expected outcome in words, the
    error categories BY NAME with what each one means the caller
    should do, and the questions it will actually have answered
    where it is looking. Cleverness that needs a footnote is a
    defect.

    57.5 SAYS HOW SAFE IT IS, AND WHAT WE HOLD OURSELVES TO. What
    the surface can see, what it stores, what it never stores, what
    it signs, and the standards it is kept to. Silence about
    security reads as "we did not think about it", and here it
    would frequently be true if we had not.

    WHAT THIS RULE IS NOT: a demand that every door repeat the
    whole store. One hop is allowed — a named link to the page
    that answers it — as long as the hop is FROM the surface an
    agent is holding. Nothing may be answered only somewhere the
    caller has no reason to look.


58. ANYTHING A PERSON READS EARNS ITS PAGE. (Adopted 2026-08-29,
    the keeper's second ruling the same evening, and the human half
    of rule 57.)

    THE KEEPER'S WORDS, VERBATIM: "if anything is human facing it
    should have good seo, be easily understood summarized and
    valuable with clear outcomes and clear ability to either pay to
    dive deeper or direct an agent to pay and dive deeper"

    58.1 FINDABLE BY SEARCH, WHICH IS A DIFFERENT MECHANISM FROM
    57.1. A title that says what the page is, a description that
    would make somebody click it, one h1, real headings, and the
    structured data for what the page actually holds. Rule 6 says
    every string serves both audiences; this says the human half
    has its own discovery problem and it is not solved by the agent
    half.

    58.2 SCANNABLE BEFORE IT IS READABLE. A reader arriving cold
    gets the finding in the first screen — summarised, in numbers
    with their denominators, before any paragraph explains itself.
    A page whose point is in its fourth paragraph does not have a
    point as far as its readers are concerned.

    58.3 CLEAR OUTCOMES. What a reader can DO having read it, said
    plainly, with the free thing first.

    58.4 A WAY TO GO DEEPER, FOR BOTH KINDS OF READER. The paid
    path is named on the page, with its price, and it is walkable
    two ways: a person can buy it, and a person can hand the line
    to their agent and have the agent buy it. The second is the one
    we keep forgetting, and it is the one this store is for.

    THE LINE THIS DOES NOT CROSS. Selling deeper is not withholding
    the evidence: the observations stay free and complete, and what
    money buys is our labour on them. A page that made the free
    record harder to reach in order to sell the reading would be
    the exact defect this store files against other people.


59. A SURFACE PUBLISHED FOR A READER HAS THE READER'S LIMITS AS
    PART OF ITS CONTRACT. (Drafted 2026-09-01 from PROBLEMS #25's
    open half, at the keeper's instruction; inked by him the same
    day, wording as drafted.)

    A document that is true and unreadable is not published. The
    reader's fetch cap, context window, and timeout are conditions
    of the claim, the same as the bytes inside it. A surface that
    has never been measured against the thing that reads it has
    not been checked.

    THE PRECEDENT. /openapi.json on 2026-08-31: 1,480,775 bytes,
    every path real, every operation typed — and scanners with a
    1 MB cap treated the store as having no contract at all.
    Circle's Sell-to-Agents check reported exactly that, and from
    where it was standing it was right. Every guard on the
    document had asserted a property of its CONTENT. Adding truth
    made it bigger. Nothing was watching the reader.

    THE PRACTICE. Every machine surface an agent is told to fetch
    carries a measured ceiling, derived from the readers we already
    know about, and a test that fails when we walk past it. The
    cheap way to pass is not to delete doors — a size guard that
    can be satisfied by dropping paths trades an unreadable
    contract for an incomplete one.

    THE SURFACES. Listed once, in src/store/reader-limits.ts.
    OpenAPI has held its ceiling since 2026-08-31
    (test/openapi-fetchable.spec.ts). The others named on #25 —
    /menu.json, /corpus.json, /.well-known/x402.json, /llms.txt —
    take the same shape of guard
    (test/machine-surfaces-fetchable.spec.ts). A new machine
    surface an agent is told to fetch is added to that list in
    the same change that publishes it.

    WHAT THIS RULE IS NOT. It is not a demand to write less. The
    OpenAPI fix lost no path and no sentence; it stopped inlining
    the same object a thousand times. Depth stays. The reader's
    limit is a constraint on HOW we publish, not on WHAT we know.


=====================================================================

60. EVERY OUTWARD SURFACE IS CONSUMABLE, FINDABLE, AND SAYS ONE
    PROPOSITION. (Adopted 2026-09-03, the keeper's two rulings the
    evening the trade counter opened, made general because they are
    not about the counter.)

    THE KEEPER'S WORDS, VERBATIM: "we need a check in place for any
    new feature to have proper aeo/seo, json ld, schemas and to be
    reflected across each page it needs to be". And: "every piece of
    marketable/forward facing/human facing/agent readable code needs
    to be consumable and needs to have our value proposition
    consistent and clear of what they can do with it/get with their
    money and they need to be able to find it".

    WHAT IT ADDS TO 57 AND 58. Those two say what a surface owes a
    caller and a reader. This says a FEATURE owes the same on every
    surface at once, in the same words, and that the set of surfaces
    is named per feature rather than remembered. The trade counter
    shipped on every surface a guard reads and on none of the pages
    an integrator opens first; the guards checked whether a door was
    named somewhere and nothing checked where.

    60.1 A FEATURE IS A ROW. src/store/features.ts carries one row
    per feature: its room, its doors, the pages that must link it,
    ONE proposition sentence (what a caller can do or get) and ONE
    money sentence (what money buys, by what rule). No new room and
    no new API path ships without a row; the register freezes what
    stood before this rule and refuses anything newer without one.

    60.2 THE SAME SENTENCE EVERYWHERE. The proposition and the money
    sentence read byte-identically on the room's page, its JSON twin
    and llms.txt. Two phrasings of a value proposition are two
    propositions, and the reader who meets both trusts neither.

    60.3 THE ROOM EARNS ITS PAGE AND ITS SCHEMA. Title, description,
    one h1, a canonical, a WebPage node, AND a typed schema.org node
    for what the thing is (a Service, a HowTo, a Dataset, an
    OfferCatalog) so an answer engine files it as a thing that can
    be used, not a page that can be read.

    60.4 THE FIVE ANSWERS RIDE THE TWIN. what_this_is, price,
    how_to_call, errors, security on the JSON the room serves an
    agent — rule 57, held per feature rather than assumed.

    60.5 NAMED WHERE ITS READER LOOKS. Every page on the row's list
    links the room; every door is in openapi.json; the room is on
    the sitemap and in llms.txt. Findable from any door, not from
    the one we happened to build.

    HELD BY test/feature-surfaces.spec.ts, which walks the register
    against the served surfaces. Rule 46 applies: the guard was
    watched red before it was trusted.

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
