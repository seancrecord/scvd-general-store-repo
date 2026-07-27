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
VOICE & COPY
=====================================================================

1. Warm roadside general store. Dry, plainspoken, deadpan. Warmth
   through specificity, never through enthusiasm.
2. Never explain the joke. Sincerity goes unannounced.
3. Never claim "first ever." Discovered > launched. The store behaves
   as if it has always been here.
4. No preemptive denials. Respond, don't announce. (No "not a scam,"
   no "no token" banners. If asked wen token: "we sell rocks.")
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

9. Settle before you mint. No certificate, order, or inventory
   movement on unconfirmed payment. Ever.
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
20. The ledger outranks all research. Real 402s > any report.
21. Barbell doctrine: stock the penny shelf (cron-loop agents) and
    the human-labor shelf (frontier agents); distrust the middle.
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

29. Read PROJECT_LOG.md before working. Decisions are not relitigated
    without the keeper. TASKS.md catches everything discovered —
    nothing gets dropped, things get filed.
30. No agent holds keys, sends money, or publishes without an
    approval queue. Read + draft roles by default.
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
